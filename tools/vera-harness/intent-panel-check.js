// intent_panel: a list of phone actions, each one sdk.call with a target, parameters and a mode that the host chose from the
// phone's intent registry (the rows hole, never written by the model). Checks that 1, 3 and 8 rows compile and run, that
// "{input}" in a parameter takes the text box's value, that each of the four answer shapes of docs/intent-call-contract.md
// is shown the right way, and that two copies of the block keep their own names.
'use strict'
const assert = require('node:assert/strict')
const {loadVera} = require('./source-loader')
const {fragments} = loadVera('VeraTemplates')
const {composeProgram} = loadVera('VeraSectionCompose')
const {holesOf, holeValues} = loadVera('VeraHoles')
const {compileVeraSource} = loadVera('VeraCompiler')
const {smokeRun} = loadVera('VeraSmoke')
const {VirtualMachine, deserializeVbc2, decodeRuntimeValue} = loadVera('VeraInterpreter')
const {UiHostEnvironment, decodeVeraUi} = loadVera('VeraUi')
const num = v => decodeRuntimeValue(['n', v])

const globals = new Map([['__THEME__', 'clean'], ['__HEADER_STYLE__', 'default'], ['__BANNER_SECTION__', 'hide'], ['__TITLE__', 'Check']])
function values(kind) {
  const spec = fragments().find(f => f.kind === kind), m = new Map()
  spec.slots.forEach(s => m.set(s.token, s.values[0]))
  spec.contentFields.forEach(c => m.set(c.token, c.fallback))
  return m
}
const row = (label, target, params, mode, input) =>
  `{label: "${label}", target: "${target}", params: "${params}", mode: "${mode}", input: ${input}}`
const rowsBody = rows => '  return [' + rows.join(', ') + '];'
const TORCH = row('Torch on', 'com.huawei.hmos.settings/entry/EntryAbility/SetTorch', 'state\\non', 'background', false)
const NOTE = row('New note', 'com.huawei.hmos.notepad/entry/EntryAbility/CreateNote', 'content\\n{input}', 'foreground', true)
const OPEN = row('Open calendar', 'com.huawei.hmos.calendar/phone/MainAbility', '', 'foreground', false)

function build(kinds, bodiesBySlot) {
  const bodies = new Map()
  bodiesBySlot.forEach((b, i) => { if (b !== undefined) bodies.set('intentRows' + (i + 1), b) })
  const extra = holeValues(kinds, bodies)
  const vals = kinds.map((k, i) => new Map([...values(k), ...extra[i]]))
  const src = composeProgram(kinds, globals, vals)
  const r = compileVeraSource(src)
  const vbc2 = r.vbc2 !== undefined ? r.vbc2 : r
  assert.equal(smokeRun(r), '', 'smoke run')
  const env = new UiHostEnvironment()
  return {src, env, vm: new VirtualMachine(deserializeVbc2(vbc2), env)}
}
const walk = (n, f) => { f(n); (n.children || []).forEach(c => walk(c, f)) }
const nodes = (h, st) => { const out = []; walk(decodeVeraUi(h.vm.execute('view', [st]))[0], n => out.push(n)); return out }
const text = (h, st) => nodes(h, st).flatMap(n => [n.text, n.label, n.title, n.subtitle, n.value]).filter(Boolean).join('|')
function act(h, name, st, ...args) { h.env.effectsAllowed = true; h.env.pendingEffects = []; const next = h.vm.execute(name, [st, ...args]); h.env.effectsAllowed = false; return {st: next, effects: h.env.pendingEffects} }

// the rows are the host's to write: the model is never asked about them
assert.equal(holesOf(['intent_panel']).filter(x => x.spec.byModel).length, 0, 'no model hole')
assert.equal(holesOf(['intent_panel']).length, 1)

// no rows (the default body): an empty state, and the program still runs
{
  const h = build(['intent_panel'], [])
  assert.match(text(h, h.vm.execute('init')), /No actions/)
}

// 1, 3 and 8 rows compile, run and show every label; no row takes input, so there is no text box
for (const n of [1, 3, 8]) {
  const rows = Array.from({length: n}, (_, i) => row('Action ' + (i + 1), 'com.example.app/entry/EntryAbility/Do' + i, 'k\\nv' + i, 'background', false))
  const h = build(['intent_panel'], [rowsBody(rows)])
  const st = h.vm.execute('init'), s = text(h, st)
  for (let i = 1; i <= n; i++) assert.match(s, new RegExp('Action ' + i + '(\\||$)'))
  assert.equal(nodes(h, st).filter(x => x.kind === 'field').length, 0)
}

// a tap makes exactly the call the row describes; "{input}" becomes the text box's value
{
  const h = build(['intent_panel'], [rowsBody([TORCH, NOTE, OPEN])])
  let st = h.vm.execute('init')
  assert.match(text(h, st), /Torch on/)
  let r = act(h, 'runAction1', st, num(0))
  assert.equal(r.effects.length, 1)
  assert.equal(r.effects[0].rawTarget, 'com.huawei.hmos.settings/entry/EntryAbility/SetTorch')
  assert.equal(r.effects[0].rawParams, 'state'); assert.equal(r.effects[0].values.get('state'), 'on')
  assert.equal(r.effects[0].rawMode, 'background'); assert.equal(r.effects[0].resultHandler, 'onAnswered1')
  st = r.st
  // the answers, in the four shapes
  st = act(h, 'onAnswered1', st, decodeRuntimeValue(['s', 'ok'])).st
  assert.match(text(h, st), /Torch on\|Done/)
  assert.equal(nodes(h, st).find(x => x.text === 'Torch on').icon, 'check')
  st = act(h, 'setInput1', st, decodeRuntimeValue(['s', 'buy milk'])).st
  r = act(h, 'runAction1', st, num(1))
  assert.equal(r.effects[0].values.get('content'), 'buy milk'); assert.equal(r.effects[0].rawMode, 'foreground')
  st = act(h, 'onAnswered1', r.st, decodeRuntimeValue(['s', '{"noteId":"42"}'])).st
  assert.match(text(h, st), /New note\|\{"noteId":"42"\}/)
  r = act(h, 'runAction1', st, num(2))
  assert.equal(r.effects[0].rawParams, '')
  st = act(h, 'onAnswered1', r.st, decodeRuntimeValue(['s', 'declined code=401'])).st
  let s = text(h, st)
  assert.match(s, /Open calendar\|declined code=401/)
  assert.match(s, /Torch on\|Done/, 'an earlier answer stays with its row')
  r = act(h, 'runAction1', st, num(0))
  st = act(h, 'onAnswered1', r.st, decodeRuntimeValue(['s', 'error 16000050: internal'])).st
  s = text(h, st)
  assert.match(s, /Torch on\|error 16000050: internal/)
  // a failed answer is a warning, a success is not
  const icons = Object.fromEntries(nodes(h, st).filter(x => x.kind === 'listitem').map(x => [x.text, x.icon]))
  assert.deepEqual(icons, {'Torch on': 'warning', 'New note': 'navigate', 'Open calendar': 'warning'})
  // the text box is there because one row takes input
  assert.equal(nodes(h, st).find(x => x.kind === 'field').value, 'buy milk')
  // an index outside the rows does nothing
  assert.equal(act(h, 'runAction1', st, num(9)).effects.length, 0)
}

// two copies keep their own names and their own answers
{
  const h = build(['intent_panel', 'intent_panel'], [rowsBody([TORCH]), rowsBody([OPEN])])
  assert.match(h.src, /function runAction1\(/); assert.match(h.src, /function runAction2\(/)
  let st = h.vm.execute('init')
  let r = act(h, 'runAction2', st, num(0))
  assert.equal(r.effects[0].rawTarget, 'com.huawei.hmos.calendar/phone/MainAbility'); assert.equal(r.effects[0].resultHandler, 'onAnswered2')
  st = act(h, 'onAnswered2', r.st, decodeRuntimeValue(['s', 'ok'])).st
  const s = text(h, st)
  assert.match(s, /Open calendar\|Done/); assert.doesNotMatch(s, /Torch on\|Done/)
}

console.log('intent-panel-check: ok')
