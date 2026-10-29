// live_facts: the block that refreshes figures from the web, and the host function behind it (VeraLive.ets). Driven in the real
// VM and against canned search results and model replies: what the program asks the host, how it reads the answer, what the screen
// says about the source, and that a figure or an address the search did not contain is never shown as found. No network.
'use strict'
const assert = require('node:assert/strict')
const {loadVera} = require('./source-loader')
const {fragments} = loadVera('VeraTemplates')
const {composeProgram} = loadVera('VeraSectionCompose')
const {compileVeraSource} = loadVera('VeraCompiler')
const {VirtualMachine, deserializeVbc2, decodeRuntimeValue} = loadVera('VeraInterpreter')
const {UiHostEnvironment, decodeVeraUi} = loadVera('VeraUi')
const live = loadVera('VeraLive')
const search = loadVera('VeraWebSearch')
const {settings} = loadVera('SettingsStore')
const str = v => decodeRuntimeValue(['s', v])
const bool = v => decodeRuntimeValue(['b', v])
const num = v => decodeRuntimeValue(['n', v])

// ---- the pure parts -------------------------------------------------------------------------------------------------------------
assert.equal(live.normalizeFigure('1 234,56 RUB'), '1234.56rub')
assert.equal(live.foundIn('92,45', 'Rate: 92.45 RUB today'), true, 'comma and dot are the same mark')
assert.equal(live.foundIn('92.45', 'rate 92,45'), true)
assert.equal(live.foundIn('93.00', 'rate 92.45'), false)
assert.equal(live.foundIn('-', 'a - b'), false)
assert.equal(live.foundIn('', 'abc'), false)
// a figure is found as a number of its own, not inside a longer one
assert.equal(live.foundIn('5', 'in 2025 it rose'), false, '5 is not in 2025')
assert.equal(live.foundIn('1.2', 'it was 11.25 then'), false, '1.2 is not in 11.25')
assert.equal(live.foundIn('1,2', 'it was 11,25 then'), false, 'with the comma as the mark too')
assert.equal(live.foundIn('25', 'in 2025 and 25 more'), true, 'a later occurrence may be the right one')
assert.equal(live.foundIn('5', 'one, 5, and 6'), true, 'a comma between numbers in a list is not part of a number')
assert.equal(live.foundIn('5', 'it cost 5.'), true, 'a full stop after it is a full stop')
assert.equal(live.foundIn('92.45', 'USD 92,45 EUR'), true)
assert.equal(live.foundIn('92.45 RUB', 'rate 92.45 RUB.'), true)
assert.equal(live.foundIn('$5', 'costs $5 each'), true, 'a value that begins with a sign is matched on its number end only')
assert.equal(live.domainOf('https://www.cbr.ru/currency_base/daily/?x=1'), 'cbr.ru')
assert.equal(live.domainOf('http://rates.example.com'), 'rates.example.com')
assert.equal(live.domainOf('example.org/path'), 'example.org')

const HITS = [
  {title: 'Bank of Russia official rates', url: 'https://www.cbr.ru/currency_base/daily/', snippet: 'USD 92,45 EUR 100,10 as of today'},
  {title: 'Some blog', url: 'https://blog.example.com/fx', snippet: 'My guess: the dollar will reach 120 next year, 99.99 now'}
]
// the model names a result; the figure must be in that result, and the source is that result's own address
let r = live.readExtraction('1|1|92,45\n2|1|100,10', [1, 2], HITS)
assert.deepEqual(r.values, ['92,45', '100,10', '']); assert.equal(r.accepted, 2); assert.equal(r.source, 0); assert.equal(r.rejected, 0)
r = live.readExtraction('1|1|93,00', [1], HITS)
assert.equal(r.accepted, 0); assert.equal(r.rejected, 1, 'a figure not in the named result is dropped')
r = live.readExtraction('1|2|92,45', [1], HITS)
assert.equal(r.accepted, 0, 'right figure, wrong result: dropped')
r = live.readExtraction('1|9|92,45\n2|-|-\nnonsense\n7|1|1', [1, 2], HITS)
assert.equal(r.accepted, 0); assert.equal(r.rejected, 0, 'a result number that does not exist, a dash, junk and an unasked label are ignored')
r = live.readExtraction('1|2|99.99\n1|1|92,45', [1], HITS)
assert.equal(r.values[0], '99.99', 'the first answer for a label wins'); assert.equal(r.source, 1)
assert.equal(live.formatAnswer(live.readExtraction('1|1|92,45', [1], HITS), HITS, '14:05'),
  'ok\n92,45\n\n\nsource\tcbr.ru\thttps://www.cbr.ru/currency_base/daily/\nasof\t14:05')
assert.match(live.formatAnswer(live.readExtraction('1|1|93,00', [1], HITS), HITS, '14:05'), /^error: the figures were not in the search results \(the model gave 1 that were not\)/)

// ---- provenance of the first figures ---------------------------------------------------------------------------------------------
const SEARCH_TEXT = 'Web results for "usd rub".\n1. Bank of Russia (https://www.cbr.ru/currency_base/daily/)\nUSD 92,45 as of today\n'
const fields = over => new Map(Object.entries(Object.assign({
  __L1_IDX__: 'USD/RUB', __L2_IDX__: '', __L3_IDX__: '', __V1_IDX__: '92,45', __V2_IDX__: '-', __V3_IDX__: '-', __QUERY_IDX__: 'usd rub today',
  __SRC_NAME_IDX__: 'invented.org', __SRC_URL_IDX__: 'https://www.cbr.ru/currency_base/daily/'}, over)))
let f = fields({})
assert.match(live.checkLiveProvenance(f, SEARCH_TEXT, 'usd rub'), /source=ok figures=1/)
assert.equal(f.get('__SRC_NAME_IDX__'), 'cbr.ru', 'the name is the address\'s own domain, not the model\'s')
assert.equal(f.get('__V1_IDX__'), '92,45'); assert.equal(f.get('__V2_IDX__'), '', 'no label, no figure')
f = fields({__SRC_URL_IDX__: 'https://made.up/page'})
assert.match(live.checkLiveProvenance(f, SEARCH_TEXT, 'usd rub'), /source=none/)
assert.equal(f.get('__SRC_URL_IDX__'), ''); assert.equal(f.get('__SRC_NAME_IDX__'), '')
f = fields({__V1_IDX__: '95,10 RUB'})
assert.match(live.checkLiveProvenance(f, SEARCH_TEXT, 'usd rub'), /figures=0/); assert.equal(f.get('__V1_IDX__'), '-', 'a number the search did not say is not shown')
f = fields({__V1_IDX__: '92,45 RUB'})
live.checkLiveProvenance(f, SEARCH_TEXT, 'usd rub'); assert.equal(f.get('__V1_IDX__'), '92,45 RUB', 'a unit the search spelled differently is fine, the number is what is checked')
f = fields({})
assert.match(live.checkLiveProvenance(f, '', 'usd rub'), /source=none figures=0/); assert.equal(f.get('__V1_IDX__'), '-', 'no search at all: no figure')
f = fields({__QUERY_IDX__: ''})
live.checkLiveProvenance(f, SEARCH_TEXT, 'what is "usd" to rub'); assert.equal(f.get('__QUERY_IDX__'), 'what is \\"usd\\" to rub', 'an empty query becomes the request, escaped')
f = fields({__L2_IDX__: 'EUR/RUB', __V2_IDX__: 'x'})
live.checkLiveProvenance(f, SEARCH_TEXT, 'usd rub'); assert.equal(f.get('__V2_IDX__'), 'x', 'a text value with no digits cannot be checked and is kept')

// ---- the block in the real VM -----------------------------------------------------------------------------------------------------
const globals = new Map([['__THEME__', 'clean'], ['__HEADER_STYLE__', 'default'], ['__BANNER_SECTION__', 'hide'], ['__TITLE__', 'Check']])
function values(over = {}) {
  const spec = fragments().find(f => f.kind === 'live_facts'), m = new Map()
  spec.slots.forEach(s => m.set(s.token, over[s.token] !== undefined ? over[s.token] : s.values[0]))
  spec.contentFields.forEach(c => m.set(c.token, over[c.token] !== undefined ? over[c.token] : c.fallback))
  return m
}
const FIRST = {__L1_IDX__: 'USD/RUB', __V1_IDX__: '92,10', __QUERY_IDX__: 'usd rub today', __SRC_NAME_IDX__: 'cbr.ru', __SRC_URL_IDX__: 'https://www.cbr.ru/currency_base/daily/'}
function build(over) {
  const src = composeProgram(['live_facts'], globals, [values(over)])
  const r = compileVeraSource(src)
  const env = new UiHostEnvironment()
  return {src, env, vm: new VirtualMachine(deserializeVbc2(r.vbc2 !== undefined ? r.vbc2 : r), env)}
}
const walk = (n, f) => { f(n); (n.children || []).forEach(c => walk(c, f)) }
const texts = (h, st) => { const out = []; decodeVeraUi(h.vm.execute('view', [st])).forEach(root => walk(root, n => Object.values(n).forEach(v => { if (typeof v === 'string' && v !== '') out.push(v) }))); return out }
function act(h, name, st, ...args) { h.env.effectsAllowed = true; h.env.pendingEffects = []; const next = h.vm.execute(name, [st, ...args]); h.env.effectsAllowed = false; return {st: next, effects: h.env.pendingEffects} }
const has = (list, re) => list.some(t => re.test(t))

// the compiler lets this one host address through even when the SDK index knows nothing of it, and still refuses another "Vera." one
globalThis.__sdkTargetHook = () => false
{
  const h = build(FIRST)
  assert.ok(h.src.includes('sdk.call("Vera.Live.fetch"'))
  assert.throws(() => compileVeraSource(h.src.replace('Vera.Live.fetch', 'Vera.Live.fetchh')), e => e.diagnostics.some(d => d.code === 'E2110'))
}

const h = build(FIRST)
let st = h.vm.execute('init')
let t = texts(h, st)
assert.ok(has(t, /^USD\/RUB$/) && has(t, /^92,10$/), 'first figure and its label: ' + JSON.stringify(t))
assert.ok(has(t, /^Source: cbr\.ru$/), 'the source before any refresh: ' + JSON.stringify(t))
assert.ok(has(t, /^https:\/\/www\.cbr\.ru\/currency_base\/daily\/$/), 'the full address')
assert.ok(has(t, /^Next update in /), 'a countdown while auto-refresh is on')
assert.equal(has(t, /Could not update/), false)

// three ticks and the automatic refresh asks the host, once
let e
;({st, effects: e} = act(h, 'onTick1', st, num(1000))); assert.equal(e.length, 0)
;({st, effects: e} = act(h, 'onTick1', st, num(1000))); assert.equal(e.length, 0)
;({st, effects: e} = act(h, 'onTick1', st, num(1000)))
assert.equal(e.length, 1, 'the third tick refreshes')
assert.equal(e[0].rawTarget, 'Vera.Live.fetch'); assert.equal(e[0].resultHandler, 'onLive1')
assert.equal(e[0].values.get('query'), 'usd rub today'); assert.equal(e[0].values.get('labels'), 'USD/RUB||')
assert.ok(has(texts(h, st), /^Updating\.\.\.$/), 'the button says so while it waits: ' + JSON.stringify(texts(h, st)))
// a second refresh while one is in flight, or within 5 s of the last, asks nothing
;({st, effects: e} = act(h, 'refresh1', st, num(0))); assert.equal(e.length, 0, 'busy')
// the answer: figure, previous figure, source and time
const OK = 'ok\n92,45\n\n\nsource\tcbr.ru\thttps://www.cbr.ru/currency_base/daily/\nasof\t14:05:10'
;({st} = act(h, 'onLive1', st, str(OK)))
t = texts(h, st)
assert.ok(has(t, /^92,45$/) && has(t, /^was 92,10$/), 'new figure, old one beside it: ' + JSON.stringify(t))
assert.ok(has(t, /^Source: cbr\.ru \u00b7 checked 14:05:10$/), 'source and time to the second: ' + JSON.stringify(t))
assert.equal(has(t, /^No change$/), false, 'the figure changed, so no "no change" notice')
assert.equal(has(t, /^Updating\.\.\.$/), false)
// within 5 s of the last call the button does nothing
;({st, effects: e} = act(h, 'refresh1', st, num(0))); assert.equal(e.length, 0, 'too soon after the last call')
// the same figures again: the screen says so, and the button reads Updating... while a call is out
{
  let again = act(h, 'onLive1', st, str(OK)).st
  assert.ok(has(texts(h, again), /^No change$/), 'the same answer is reported as no change')
}
// a failure keeps the figure, says why, and says when the figure is from
;({st} = act(h, 'onLive1', st, str('error: no results')))
t = texts(h, st)
assert.ok(has(t, /^92,45$/), 'the figure stays'); assert.ok(has(t, /^Could not update$/) && has(t, /^error: no results$/), 'the reason: ' + JSON.stringify(t))
assert.ok(has(t, /checked 14:05:10/), 'and the source line still says when it was last checked')
// "declined" and a long reason are also failures; the reason is cut
;({st} = act(h, 'onLive1', st, str('declined by the person'))); assert.ok(has(texts(h, st), /^declined by the person$/))
;({st} = act(h, 'onLive1', st, str('error: ' + 'x'.repeat(300)))); assert.ok(texts(h, st).every(x => x.length <= 150), 'a long reason is cut')
// a good answer clears the warning and keeps a figure the host left empty
;({st} = act(h, 'onLive1', st, str('ok\n\n\n\nsource\tcbr.ru\thttps://www.cbr.ru/currency_base/daily/\nasof\t15:00')))
t = texts(h, st); assert.equal(has(t, /Could not update/), false); assert.ok(has(t, /^92,45$/), 'an empty line keeps the figure')
// auto-refresh off: no countdown and the ticks do nothing
;({st} = act(h, 'toggleAuto1', st, bool(false)))
assert.equal(has(texts(h, st), /^Next update in/), false)
;({st, effects: e} = act(h, 'onTick1', st, num(1000))); assert.equal(e.length, 0)

// no search at generation: no first figure, no source, and the first automatic refresh fills them
{
  const none = build({__L1_IDX__: 'USD/RUB', __V1_IDX__: '-', __QUERY_IDX__: 'usd rub today'})
  let s0 = none.vm.execute('init'); const tt = texts(none, s0)
  assert.ok(has(tt, /^Source: not found yet$/), 'no source claimed: ' + JSON.stringify(tt))
}

// ---- the host function end to end, with a canned search and a canned model ---------------------------------------------------------
;(async () => {
  settings.hasExaKey = () => true; settings.hasApiKey = () => true; settings.getApiKey = () => 'k'; settings.getBaseUrl = () => 'https://m'; settings.getModel = () => 'm'
  let searches = []
  search.webSearchHits = async q => { searches.push(q); return {hits: HITS, error: ''} }
  const model = reply => { globalThis.__veraHttp = () => ({on() {}, destroy() {}, request: async () => ({responseCode: 200, result: JSON.stringify({choices: [{message: {content: reply}}]})})}) }
  const fresh = async p => { live.resetLiveAnswers(); return live.liveFetch(p) }
  const params = new Map([['query', 'usd rub today'], ['labels', 'USD/RUB||']])
  model('1|1|92,45')
  let answer = await fresh(params)
  assert.match(answer, /^ok\n92,45\n\n\nsource\tcbr\.ru\thttps:\/\/www\.cbr\.ru\/currency_base\/daily\/\nasof\t\d\d:\d\d:\d\d$/); assert.deepEqual(searches, ['usd rub today'])
  model('1|1|95,00')
  assert.match(await fresh(params), /^error: the figures were not in the search results/)
  model('1|2|99.99')
  assert.match(await fresh(params), /^ok\n99\.99\n\n\nsource\tblog\.example\.com\thttps:\/\/blog\.example\.com\/fx/, 'the source is the result the figure was found in')
  globalThis.__veraHttp = () => ({on() {}, destroy() {}, request: async () => ({responseCode: 500, result: ''})})
  assert.equal(await fresh(params), 'error: the model did not answer')
  search.webSearchHits = async () => ({hits: [], error: 'no results'})
  assert.equal(await fresh(params), 'error: no results')
  search.webSearchHits = async () => ({hits: [], error: 'search answered HTTP 401'})
  assert.equal(await fresh(params), 'error: search answered HTTP 401')
  assert.equal(await fresh(new Map([['query', ''], ['labels', 'A||']])), 'error: nothing to look up')
  assert.equal(await fresh(new Map([['query', 'x'], ['labels', '||']])), 'error: nothing to look up')
  settings.hasExaKey = () => false
  assert.match(await fresh(params), /^error: no search key/)
  settings.hasExaKey = () => true; settings.hasApiKey = () => false
  assert.match(await fresh(params), /^error: no model key/)
  // The same query and labels asked again within LIVE_REUSE_MS are answered from what was read: no second search, no second model call.
  settings.hasExaKey = () => true; settings.hasApiKey = () => true
  live.resetLiveAnswers(); searches = []
  let modelCalls = 0
  search.webSearchHits = async q => { searches.push(q); return {hits: HITS, error: ''} }
  globalThis.__veraHttp = () => ({on() {}, destroy() {}, request: async () => { modelCalls++; return {responseCode: 200, result: JSON.stringify({choices: [{message: {content: '1|1|92,45'}}]})} }})
  const first = await live.liveFetch(params); const again = await live.liveFetch(params)
  assert.equal(again, first); assert.equal(searches.length, 1); assert.equal(modelCalls, 1, 'the second call did not search or ask the model')
  await live.liveFetch(new Map([['query', 'usd rub today'], ['labels', 'EUR/RUB||']]))
  assert.equal(searches.length, 2, 'other labels are another question')
  // An error is not kept: it is tried again.
  live.resetLiveAnswers(); searches = []
  search.webSearchHits = async q => { searches.push(q); return {hits: [], error: 'no results'} }
  await live.liveFetch(params); await live.liveFetch(params)
  assert.equal(searches.length, 2, 'an error is asked again')
  delete globalThis.__veraHttp
  console.log('live-check: ok')
})().catch(e => { console.error(e); process.exit(1) })
