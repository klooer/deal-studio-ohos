// timer: a countdown with named presets and a hole that runs once at zero. Driven in the real VM: the clock, the presets, the exact
// sdk.call the finish action makes (read from the host's pending effects), the answer rule of docs/intent-call-contract.md, the
// gate on the slot, and what the compiler does with a target that does not exist. No network, no model.
'use strict'
const assert = require('node:assert/strict')
const {loadVera} = require('./source-loader')
const {fragments} = loadVera('VeraTemplates')
const {expandListRows} = loadVera('VeraTemplateContent')
const {composeProgram, readSectionPick, markedHole} = loadVera('VeraSectionCompose')
const {holesOf, holeValues, fillHoles, buildHolePrompt} = loadVera('VeraHoles')
const {compileVeraSource} = loadVera('VeraCompiler')
const {VirtualMachine, deserializeVbc2, decodeRuntimeValue} = loadVera('VeraInterpreter')
const {UiHostEnvironment, decodeVeraUi} = loadVera('VeraUi')
const num = v => decodeRuntimeValue(['n', v])
const str = v => decodeRuntimeValue(['s', v])
const bool = v => decodeRuntimeValue(['b', v])

const globals = new Map([['__THEME__', 'clean'], ['__HEADER_STYLE__', 'default'], ['__BANNER_SECTION__', 'hide'], ['__TITLE__', 'Check']])
const EGGS = [['Soft', '360'], ['Medium', '420'], ['Hard', '600']]
const FINISH = '__FINISH_ACTION_IDX__'
const VIBRATE = '  sdk.call("SensorServiceKit.vibrator.vibrate", ["duration", "1500"], "onFinishedAnswerIDX");\n  return 0;'

function values(over = {}, rows) {
  const spec = fragments().find(f => f.kind === 'timer'), m = new Map()
  spec.slots.forEach(s => m.set(s.token, over[s.token] !== undefined ? over[s.token] : s.values[0]))
  spec.contentFields.forEach(c => m.set(c.token, c.fallback))
  spec.listFields.forEach(l => m.set(l.token, expandListRows(rows, l).text))
  return m
}
function build(over = {}, rows, body) {
  const v = values(over, rows)
  if (body !== undefined) v.set('__HOLE_WHENFINISHED_IDX__', markedHole('whenFinished', '1', body))
  const src = composeProgram(['timer'], globals, [v])
  const r = compileVeraSource(src)
  const env = new UiHostEnvironment()
  return {src, env, vm: new VirtualMachine(deserializeVbc2(r.vbc2 !== undefined ? r.vbc2 : r), env)}
}
const walk = (n, f) => { f(n); (n.children || []).forEach(c => walk(c, f)) }
const nodes = (h, st) => { const out = []; walk(decodeVeraUi(h.vm.execute('view', [st]))[0], n => out.push(n)); return out }
const texts = (h, st) => nodes(h, st).flatMap(n => Object.values(n).filter(v => typeof v === 'string' && v !== '').concat(n.options || []))
const left = (h, st) => nodes(h, st).find(n => n.kind === 'numbertext').numberValue
const bar = (h, st) => { const p = nodes(h, st).find(n => n.kind === 'progress'); return [p.label, p.maximum] }
function act(h, name, st, ...args) { h.env.effectsAllowed = true; h.env.pendingEffects = []; const next = h.vm.execute(name, [st, ...args]); h.env.effectsAllowed = false; return {st: next, effects: h.env.pendingEffects} }

// list column check: seconds outside 5 to 86400 become 60
{
  const spec = fragments().find(f => f.kind === 'timer').listFields[0]
  const out = expandListRows([['A', '360'], ['B', '9'], ['C', '99999'], ['D', 'abc']], spec).text
  assert.match(out, /name: "A", seconds: 360/); assert.match(out, /name: "B", seconds: 9/)
  assert.match(out, /name: "C", seconds: 60/); assert.match(out, /name: "D", seconds: 60/)
}

// the default (no content): one preset of 25 minutes, no chooser, the clock shows 1500 s left
{
  const h = build()
  let st = h.vm.execute('init')
  assert.equal(left(h, st), 1500, 'one preset of 1500 seconds')
  assert.equal(nodes(h, st).filter(n => n.kind === 'select').length, 0, 'one preset: no chooser')
}

// three presets: a chooser with their names, the clock follows the chosen one, choosing resets
const h = build({[FINISH]: 'false'}, EGGS)
let st = h.vm.execute('init')
assert.deepEqual(nodes(h, st).find(n => n.kind === 'select').options, ['Soft', 'Medium', 'Hard'])
assert.equal(left(h, st), 360, 'the first preset: 360 s')
st = act(h, 'choosePreset1', st, num(2)).st; assert.equal(left(h, st), 600, 'Hard: 600 s')
st = act(h, 'toggleRunning1', st, bool(true)).st
st = act(h, 'onTick1', st, num(1000)).st; assert.equal(left(h, st), 599, 'one tick of 1000 ms')
st = act(h, 'onTick1', st, num(100000)).st; assert.equal(left(h, st), 499, 'a long tick')
st = act(h, 'choosePreset1', st, num(1)).st; assert.equal(left(h, st), 420, 'choosing resets to the full time')
// a tick while paused changes nothing
let paused = act(h, 'onTick1', act(h, 'choosePreset1', st, num(1)).st, num(5000)).st
assert.equal(left(h, paused), 420, 'paused: the clock does not move')

// reaching zero stops the clock at the limit; with the default hole nothing is asked of the phone
st = act(h, 'toggleRunning1', act(h, 'choosePreset1', st, num(0)).st, bool(true)).st
let r = act(h, 'onTick1', st, num(359000)); assert.equal(r.effects.length, 0); assert.equal(left(h, r.st), 1)
r = act(h, 'onTick1', r.st, num(5000))
assert.equal(r.effects.length, 0, 'default hole: no phone call'); assert.equal(left(h, r.st), 0, 'zero left')
assert.ok(texts(h, r.st).includes('Time is up'), 'the banner')
assert.equal(act(h, 'onTick1', r.st, num(5000)).effects.length, 0, 'a stopped clock ignores ticks')
// starting again after the end starts over
const again = act(h, 'toggleRunning1', r.st, bool(true)).st
assert.equal(left(h, again), 360, 'restart from the full time')

// the finish action: the exact call at zero, once, with the handler of this block
const f = build({[FINISH]: 'true'}, EGGS, VIBRATE)
let fs = act(f, 'toggleRunning1', f.vm.execute('init'), bool(true)).st
r = act(f, 'onTick1', fs, num(359000)); assert.equal(r.effects.length, 0, 'not yet')
// exactly at the limit counts as finished
assert.equal(act(f, 'onTick1', fs, num(360000)).effects.length, 1, 'a tick that lands exactly on the limit finishes it')
r = act(f, 'onTick1', r.st, num(2000)); assert.equal(r.effects.length, 1, 'the phone is asked once')
const e = r.effects[0]
assert.equal(e.rawTarget, 'SensorServiceKit.vibrator.vibrate'); assert.equal(e.resultHandler, 'onFinishedAnswer1')
assert.deepEqual(Object.fromEntries(e.values), {duration: '1500'})
assert.equal(act(f, 'onTick1', r.st, num(1000)).effects.length, 0, 'once: the clock has stopped')
// the answers: only "declined..." and "error..." are failures
const okNote = act(f, 'onFinishedAnswer1', r.st, str('ok')).st; assert.ok(!texts(f, okNote).includes('The phone said no'))
const json = act(f, 'onFinishedAnswer1', r.st, str('{"done":true}')).st; assert.ok(!texts(f, json).includes('The phone said no'))
const declined = act(f, 'onFinishedAnswer1', r.st, str('declined code=201')).st
assert.ok(texts(f, declined).includes('The phone said no') && texts(f, declined).includes('declined code=201'))
assert.ok(texts(f, act(f, 'onFinishedAnswer1', r.st, str('error 5: no vibrator')).st).includes('The phone said no'))
// a reset clears the message
assert.ok(!texts(f, act(f, 'resetTimer1', declined, num(0)).st).includes('The phone said no'))

// two timers do not collide, and the handler number follows the slot
{
  const src = composeProgram(['timer', 'timer'], globals, [values({[FINISH]: 'true'}, EGGS), values({[FINISH]: 'true'}, EGGS)])
  assert.match(src, /function onFinishedAnswer1\(/); assert.match(src, /function onFinishedAnswer2\(/)
  compileVeraSource(src)
}
// a stored body names the handler as IDX and survives the block moving to another slot
{
  const body = markedHole('whenFinished', '3', VIBRATE)
  assert.match(body, /"onFinishedAnswer3"/)
}

// the gate: the hole is asked only when the slot came out true; callers that pass no values want every hole
assert.equal(holesOf(['timer'], [new Map([[FINISH, 'false']])]).length, 0)
assert.equal(holesOf(['timer'], [new Map([[FINISH, 'true']])]).length, 1)
assert.equal(holesOf(['timer']).length, 1)
assert.equal(holesOf(['timer'], [new Map()]).length, 0, 'no answer for the slot: not asked')

// the question the model gets: the SDK functions found, the handler written with IDX, the sdk-capable instructions
{
  const hole = holesOf(['timer'], [new Map([[FINISH, 'true']])])
  const [system, user] = buildHolePrompt('Egg timer, vibrate when done', hole, '{"found":[{"call":"SensorServiceKit.vibrator.vibrate"}]}')
  assert.match(system, /sdk\.call\("<target>"/); assert.match(system, /never invent a target/)
  assert.match(user, /onFinishedAnswerIDX/); assert.match(user, /SDK functions found for this request/); assert.match(user, /SensorServiceKit\.vibrator\.vibrate/)
  const plain = buildHolePrompt('x', hole)
  assert.doesNotMatch(plain[1], /SDK functions found/, 'nothing found: no list')
}

// the compiler is the validator: a real target compiles; a made-up one does not, and the default body takes over. On the phone the
// compiler checks sdk.call targets against the bundled SDK index (E2110); the host has no index loaded, so a stand-in with one
// known target plays that part here.
;(async () => {
  globalThis.__sdkTargetHook = target => target === 'SensorServiceKit.vibrator.vibrate'
  const buildFor = bodies => composeProgram(['timer'], globals, [values({[FINISH]: 'true'}, EGGS)].map(v => { holeValues(['timer'], bodies)[0].forEach((x, k) => v.set(k, x)); return v }))
  let reply = JSON.stringify({holes: {whenFinished1: VIBRATE.replace(/^ {2}/gm, '')}})
  let fill = await fillHoles('egg timer, vibrate', ['timer'], async () => reply, buildFor, [new Map([[FINISH, 'true']])])
  assert.match(fill.note, /holes=filled\(1\)/); assert.match(fill.bodies.get('whenFinished1'), /SensorServiceKit\.vibrator\.vibrate/)
  reply = JSON.stringify({holes: {whenFinished1: 'sdk.call("Nonexistent.Kit.fn", ["a", "b"], "onFinishedAnswerIDX");\nreturn 0;'}})
  fill = await fillHoles('egg timer, vibrate', ['timer'], async () => reply, buildFor, [new Map([[FINISH, 'true']])])
  assert.match(fill.note, /holes=default\(/, 'a target that does not exist falls back to the default: ' + fill.note)
  assert.equal(fill.bodies.size, 0)
  // the slot says no: the model is not asked at all
  let asked = 0
  fill = await fillHoles('countdown only', ['timer'], async () => { asked++; return reply }, buildFor, [new Map([[FINISH, 'false']])])
  assert.equal(asked, 0); assert.equal(fill.note, '')

  // Jev: the finish-action slot is what covers the integration veto
  const body = (slot, vetoes = {}) => {
    const answers = {section1: {choice: 'timer', confidence: 0.9}, 'section1.timer.finish_action': {noul: slot}}
    for (const k of ['needs_integration', 'needs_real_data', 'needs_search_or_form', 'needs_live_ticking', 'needs_multiple_counters', 'needs_multiple_series', 'needs_logic'])
      answers['veto.' + k] = {noul: vetoes[k] || 0}
    return JSON.stringify({answers})
  }
  let o = readSectionPick(body(0.9, {needs_integration: 0.82}))
  assert.equal(o.sections[0].slotValues.get(FINISH), 'true'); assert.equal(o.needsLogic, false, 'a finish action is covered by the hole')
  o = readSectionPick(body(0.1, {needs_integration: 0.82}))
  assert.equal(o.sections[0].slotValues.get(FINISH), 'false'); assert.equal(o.needsLogic, true, 'an integration the block does not cover still goes to the model')
  console.log('timer-check ok')
})().catch(e => { console.error(e); process.exit(1) })
