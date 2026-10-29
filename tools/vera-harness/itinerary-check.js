// itinerary (an ordered day of places) and progress_line: the schedule, the reached marks, the numbers the two publish, and
// the exact sdk.call each phone action makes (target, parameters, handler, mode), read from the host's pending effects.
// The answers follow docs/intent-call-contract.md: only "declined..." and "error..." are failures.
'use strict'
const assert = require('node:assert/strict')
const {loadVera} = require('./source-loader')
const {fragments} = loadVera('VeraTemplates')
const {expandListRows} = loadVera('VeraTemplateContent')
const {composeProgram, bindPorts} = loadVera('VeraSectionCompose')
const {compileVeraSource} = loadVera('VeraCompiler')
const {VirtualMachine, deserializeVbc2, decodeRuntimeValue} = loadVera('VeraInterpreter')
const {UiHostEnvironment, decodeVeraUi} = loadVera('VeraUi')
const num = v => decodeRuntimeValue(['n', v])
const str = v => decodeRuntimeValue(['s', v])

const globals = new Map([['__THEME__', 'clean'], ['__HEADER_STYLE__', 'default'], ['__BANNER_SECTION__', 'hide'], ['__TITLE__', 'Check']])
const STOPS = [['The Bund', '90', '31.2397', '121.4900'], ['Yu Garden', '75', '31.2270', '121.4920'], ['Nanjing Road', '60', '310', 'abc']]
function values(kind, over = {}) {
  const spec = fragments().find(f => f.kind === kind), m = new Map()
  spec.slots.forEach(s => m.set(s.token, over[s.token] !== undefined ? over[s.token] : s.values[0]))
  spec.contentFields.forEach(c => m.set(c.token, over[c.token] !== undefined ? over[c.token] : c.fallback))
  spec.listFields.forEach(l => m.set(l.token, expandListRows(kind === 'itinerary' ? STOPS : undefined, l).text))
  return m
}
const ON = {'__NAVIGATE_IDX__': 'true', '__CALENDAR_IDX__': 'true', '__START_PLACE_IDX__': 'Pudong Airport', '__START_LAT_IDX__': '31.1443', '__START_LON_IDX__': '121.8083'}
function build(kinds, over = {}) {
  const src = composeProgram(kinds, globals, kinds.map(k => values(k, k === 'itinerary' ? over : {})))
  const r = compileVeraSource(src)
  const env = new UiHostEnvironment()
  return {src, env, vm: new VirtualMachine(deserializeVbc2(r.vbc2 !== undefined ? r.vbc2 : r), env)}
}
const walk = (n, f) => { f(n); (n.children || []).forEach(c => walk(c, f)) }
const strings = (vm, st) => { const out = []; walk(decodeVeraUi(vm.execute('view', [st]))[0], n => out.push(n.text, n.label, n.value, ...(n.options || []))); return out.filter(Boolean) }
// run one handler the way the renderer does: effects are allowed, and what the program asked for is read back
function act(h, name, st, ...args) { h.env.effectsAllowed = true; h.env.pendingEffects = []; const next = h.vm.execute(name, [st, ...args]); h.env.effectsAllowed = false; return {st: next, effects: h.env.pendingEffects} }
const text = (h, st) => strings(h.vm, st).join('|')

// column checks: a latitude of 310 and a longitude of "abc" become empty, minutes outside 5-600 become 60
{
  const spec = fragments().find(f => f.kind === 'itinerary').listFields[0]
  const out = expandListRows([['A', '90', '31.2397', '121.49'], ['B', '9999', '-95', '181'], ['C', '2', '31', 'x']], spec).text
  assert.match(out, /name: "A", minutes: 90, latitude: "31.2397", longitude: "121.49"/)
  assert.match(out, /name: "B", minutes: 60, latitude: "", longitude: ""/)
  assert.match(out, /name: "C", minutes: 60, latitude: "31", longitude: ""/)
}

const h = build(['itinerary', 'progress_line'], ON)
let st = h.vm.execute('init')
let s = text(h, st)
assert.match(s, /09:00 - 10:30 \| 90 min(?!.*31\.2397)/); assert.match(s, /10:45 - 12:00 \| 75 min/); assert.match(s, /12:15 - 13:15 \| 60 min/)
assert.match(s, /0 of 3/, 'progress_line reads done and total')
assert.deepEqual(bindPorts(['itinerary', 'progress_line'])[1].get('__PORT_done__'), 'reachedCount1(state)')

// reaching a stop moves the numbers; unticking recomputes the last reached stop
st = act(h, 'toggleStop1', st, num(0)).st; assert.match(text(h, st), /1 of 3/)
st = act(h, 'toggleStop1', st, num(1)).st; assert.match(text(h, st), /2 of 3/)
st = act(h, 'toggleStop1', st, num(1)).st; assert.match(text(h, st), /1 of 3/)

// Navigate: the origin is the last reached stop, else the start place; empty coordinates are left out
let r = act(h, 'navigate1', st, num(1))
assert.equal(r.effects.length, 1); let e = r.effects[0]
assert.equal(e.rawTarget, 'com.huawei.hmos.maps.app/entry/EntryAbility/StartNavigate'); assert.equal(e.rawMode, 'foreground'); assert.equal(e.resultHandler, 'onNavigated1')
assert.deepEqual(Object.fromEntries(e.values), {'dstLocation.locationName': 'Yu Garden', 'dstLocation.latitude': '31.2270', 'dstLocation.longitude': '121.4920',
  'srcLocation.locationName': 'The Bund', 'srcLocation.latitude': '31.2397', 'srcLocation.longitude': '121.4900', trafficType: 'Drive'})
r = act(h, 'navigate1', h.vm.execute('init'), num(0)); e = r.effects[0]
assert.equal(e.values.get('srcLocation.locationName'), 'Pudong Airport'); assert.equal(e.values.get('srcLocation.latitude'), '31.1443')
r = act(h, 'navigate1', h.vm.execute('init'), num(2)); e = r.effects[0]
assert.equal(e.values.get('dstLocation.locationName'), 'Nanjing Road'); assert.equal(e.values.has('dstLocation.latitude'), false, 'no coordinates, name only')
assert.equal(act(h, 'navigate1', st, num(9)).effects.length, 0, 'an index outside the list does nothing')
// the maps app answered with something that is not a failure: no banner; a refusal is shown
assert.doesNotMatch(text(h, act(h, 'onNavigated1', st, str('0')).st), /Last action/)
assert.match(text(h, act(h, 'onNavigated1', st, str('declined code=3')).st), /declined code=3/)

// Add to calendar: hour and minute of the right row, the id kept on that stop only
let fresh = h.vm.execute('init')
r = act(h, 'addEvent1', fresh, num(1)); e = r.effects[0]
assert.equal(e.rawTarget, 'CalendarKit.Calendar.addEvent'); assert.equal(e.resultHandler, 'onAdded1')
assert.deepEqual(Object.fromEntries(e.values), {title: 'Yu Garden', hour: '10', minute: '45', durationMinutes: '75', location: 'Yu Garden, 31.2270, 121.4920', remindBefore: '15', repeat: 'once'})
let added = act(h, 'onAdded1', r.st, str('12')).st
assert.equal((text(h, added).match(/In calendar/g) || []).length, 1); assert.equal((text(h, added).match(/Add to calendar/g) || []).length, 2)
assert.match(text(h, act(h, 'onAdded1', r.st, str('error 201: no permission')).st), /error 201: no permission/)
assert.doesNotMatch(text(h, act(h, 'onAdded1', r.st, str('error 201')).st), /In calendar/, 'a failure stores no id')
assert.equal(act(h, 'addEvent1', fresh, num(-1)).effects.length, 0)

// Wipe: nothing to remove says so and calls nothing; with ids it sends them comma-separated and clears them on success only
r = act(h, 'wipeEvents1', fresh, num(0)); assert.equal(r.effects.length, 0); assert.match(text(h, r.st), /No events added by this app/)
let two = act(h, 'onAdded1', act(h, 'addEvent1', added, num(2)).st, str('15')).st
r = act(h, 'wipeEvents1', two, num(0)); e = r.effects[0]
assert.equal(e.rawTarget, 'CalendarKit.Calendar.deleteEvents'); assert.equal(e.values.get('ids'), '12,15'); assert.equal(e.resultHandler, 'onWiped1')
assert.equal((text(h, act(h, 'onWiped1', two, str('ok')).st).match(/Add to calendar/g) || []).length, 3, 'ids cleared')
assert.equal((text(h, act(h, 'onWiped1', two, str('error 5: x')).st).match(/In calendar/g) || []).length, 2, 'ids kept on failure')

// Open calendar: a three-part launch, nothing else
r = act(h, 'openCalendar1', st, num(0)); e = r.effects[0]
assert.equal(e.rawTarget, 'com.huawei.hmos.calendar/phone/MainAbility'); assert.equal(e.rawParams, '')

// the slots are switches: off, the screen has no phone buttons
{
  const off = build(['itinerary'], {})
  const s0 = text(off, off.vm.execute('init'))
  assert.doesNotMatch(s0, /Navigate|Add to calendar|Open calendar/); assert.match(s0, /The Bund/)
}
// a start time that is not a time of day falls back, and a bad start coordinate is dropped
{
  const odd = build(['itinerary'], Object.assign({}, ON, {'__START_TIME_IDX__': '99999', '__START_LAT_IDX__': '500'}))
  let o = odd.vm.execute('init'); assert.match(text(odd, o), /09:00 - 10:30/)
  const ev = act(odd, 'navigate1', o, num(0)).effects[0]
  assert.equal(ev.values.has('srcLocation.latitude'), false); assert.equal(ev.values.get('srcLocation.locationName'), 'Pudong Airport')
}
// progress_line also reads a checklist: the same two ports
{
  const both = build(['checklist', 'progress_line'])
  const b = both.vm.execute('init')
  assert.match(text(both, b), /0 of 3/)
  assert.match(text(both, act(both, 'toggle1', b, num(0)).st), /1 of 3/)
}
console.log('itinerary-check ok')
