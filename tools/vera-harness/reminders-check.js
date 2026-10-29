// reminders (a list of timed entries) driven in the real VM: the form, the rows, the exact calendar calls (read from the host's pending
// effects), the answers of docs/intent-call-contract.md (the event id on success, "declined..." / "error..." as failures), the
// published ports and the vetoes the block covers. Nothing here says "medicine": the title and prefix are plain content values.
'use strict'
const assert = require('node:assert/strict')
const {loadVera} = require('./source-loader')
const {fragments} = loadVera('VeraTemplates')
const {composeProgram, bindPorts, readSectionPick} = loadVera('VeraSectionCompose')
const {compileVeraSource} = loadVera('VeraCompiler')
const {VirtualMachine, deserializeVbc2, decodeRuntimeValue} = loadVera('VeraInterpreter')
const {UiHostEnvironment, decodeVeraUi} = loadVera('VeraUi')
const num = v => decodeRuntimeValue(['n', v])
const str = v => decodeRuntimeValue(['s', v])
const bool = v => decodeRuntimeValue(['b', v])

const globals = new Map([['__THEME__', 'clean'], ['__HEADER_STYLE__', 'default'], ['__BANNER_SECTION__', 'hide'], ['__TITLE__', 'Check']])
const CAL = '__CALENDAR_IDX__'
function values(kind, over = {}) {
  const spec = fragments().find(f => f.kind === kind), m = new Map()
  spec.slots.forEach(s => m.set(s.token, over[s.token] !== undefined ? over[s.token] : s.values[0]))
  spec.contentFields.forEach(c => m.set(c.token, over[c.token] !== undefined ? over[c.token] : c.fallback))
  spec.listFields.forEach(l => m.set(l.token, ''))
  return m
}
function build(kinds, over = {}) {
  const src = composeProgram(kinds, globals, kinds.map(k => values(k, k === 'reminders' ? over : {})))
  const r = compileVeraSource(src)
  const env = new UiHostEnvironment()
  return {src, env, vm: new VirtualMachine(deserializeVbc2(r.vbc2 !== undefined ? r.vbc2 : r), env)}
}
const walk = (n, f) => { f(n); (n.children || []).forEach(c => walk(c, f)) }
const nodes = (h, st) => { const out = []; walk(decodeVeraUi(h.vm.execute('view', [st]))[0], n => out.push(n)); return out }
const texts = (h, st) => nodes(h, st).flatMap(n => Object.values(n).filter(v => typeof v === 'string' && v !== ''))
const text = (h, st) => texts(h, st).join('|')
function act(h, name, st, ...args) { h.env.effectsAllowed = true; h.env.pendingEffects = []; const next = h.vm.execute(name, [st, ...args]); h.env.effectsAllowed = false; return {st: next, effects: h.env.pendingEffects} }
const fill = (h, st, title, hour, minute, daily) => {
  st = act(h, 'setTitle1', st, str(title)).st; st = act(h, 'setHour1', st, num(hour)).st
  st = act(h, 'setMinute1', st, num(minute)).st; return act(h, 'setDaily1', st, bool(daily)).st
}

const h = build(['reminders'], {[CAL]: 'true', __EVENT_PREFIX_IDX__: 'Take ', __EVENT_NOTE_IDX__: 'Reminder from the app'})
let st = h.vm.execute('init')
assert.match(text(h, st), /Nothing yet/); assert.equal(nodes(h, st).filter(n => n.kind === 'listitem').length, 0)
// the form: the defaults are 08:00 and daily; an empty title adds nothing
let r = act(h, 'addReminder1', st, num(0)); assert.equal(r.effects.length, 0); assert.match(text(h, r.st), /Nothing yet/, 'an empty title adds nothing')
r = act(h, 'addReminder1', fill(h, st, '   ', 8, 0, true), num(0)); assert.equal(r.effects.length, 0, 'a blank title adds nothing')
// hour and minute are kept in range
st = act(h, 'setHour1', st, num(25)).st; st = act(h, 'setHour1', st, num(23.9)).st
assert.equal(act(h, 'addReminder1', fill(h, st, 'X', 25, 70, true), num(0)).effects[0].values.get('hour'), '23')
assert.equal(act(h, 'addReminder1', fill(h, st, 'X', -3, 70, true), num(0)).effects[0].values.get('hour'), '0')
assert.equal(act(h, 'addReminder1', fill(h, st, 'X', 9, 70, true), num(0)).effects[0].values.get('minute'), '59')
assert.equal(act(h, 'addReminder1', fill(h, st, 'X', 9, -1, true), num(0)).effects[0].values.get('minute'), '0')

// adding: the exact calendar call, the row, and what the calendar answered
st = fill(h, h.vm.execute('init'), 'Aspirin', 8, 30, true)
r = act(h, 'addReminder1', st, num(0)); assert.equal(r.effects.length, 1)
let e = r.effects[0]
assert.equal(e.rawTarget, 'CalendarKit.Calendar.addEvent'); assert.equal(e.resultHandler, 'onAdded1')
assert.deepEqual(Object.fromEntries(e.values), {title: 'Take Aspirin', hour: '8', minute: '30', durationMinutes: '15', remindBefore: '0', repeat: 'daily',
  description: 'Reminder from the app'})
st = r.st; assert.match(text(h, st), /Aspirin\|08:30 - every day\|sending\.\.\./, 'the row is pending until the calendar answers')
assert.doesNotMatch(text(h, st), /Nothing yet/)
// the title field is cleared for the next entry, the time stays
assert.equal(act(h, 'addReminder1', st, num(0)).effects.length, 0, 'the cleared title adds nothing again')
// the answer is the event id: the row says it is in the calendar
st = act(h, 'onAdded1', st, str('4242')).st
assert.match(text(h, st), /Aspirin\|08:30 - every day\|in calendar/)
// a second entry, once, answered with a refusal: shown on the row, not counted as scheduled
st = fill(h, st, 'Dentist', 14, 5, false)
r = act(h, 'addReminder1', st, num(0)); assert.equal(r.effects[0].values.get('repeat'), 'once'); assert.equal(r.effects[0].values.get('hour'), '14')
st = act(h, 'onAdded1', r.st, str('declined code=201')).st
assert.match(text(h, st), /Dentist\|14:05\|not added/); assert.match(text(h, st), /The calendar said no\|declined code=201/)
// a json answer or "ok" is success (only declined/error fail)
{
  let s2 = act(h, 'addReminder1', fill(h, h.vm.execute('init'), 'A', 7, 0, false), num(0)).st
  s2 = act(h, 'onAdded1', s2, str('{"id":"9"}')).st; assert.match(text(h, s2), /in calendar/)
  let s3 = act(h, 'addReminder1', fill(h, h.vm.execute('init'), 'A', 7, 0, false), num(0)).st
  s3 = act(h, 'onAdded1', s3, str('error 3: no calendar')).st; assert.match(text(h, s3), /not added/)
}
// an answer with nothing pending changes nothing
assert.equal(text(h, act(h, 'onAdded1', h.vm.execute('init'), str('7')).st), text(h, h.vm.execute('init')))

// the numbers the block publishes: scheduled (done) and all (total), read by progress_line
{
  const g = build(['reminders', 'progress_line'], {[CAL]: 'true'})
  assert.deepEqual([bindPorts(['reminders', 'progress_line'])[1].get('__PORT_done__'), bindPorts(['reminders', 'progress_line'])[1].get('__PORT_total__')],
    ['scheduledCount1(state)', 'state.reminders1.length()'])
  let s = fill(g, g.vm.execute('init'), 'A', 7, 0, true); s = act(g, 'addReminder1', s, num(0)).st; s = act(g, 'onAdded1', s, str('1')).st
  s = fill(g, s, 'B', 9, 0, true); s = act(g, 'addReminder1', s, num(0)).st
  assert.match(text(g, s), /1 of 2/, 'one scheduled of two')
}

// removing: the event goes too, the index of a pending entry follows
const rm = act(h, 'removeReminder1', st, num(0))
assert.equal(rm.effects.length, 1); assert.equal(rm.effects[0].rawTarget, 'CalendarKit.Calendar.deleteEvents'); assert.deepEqual(Object.fromEntries(rm.effects[0].values), {ids: '4242'})
assert.doesNotMatch(text(h, rm.st), /Aspirin/); assert.match(text(h, rm.st), /Dentist/)
assert.equal(act(h, 'removeReminder1', st, num(1)).effects.length, 0, 'a refused entry has no event to remove')
assert.equal(act(h, 'removeReminder1', st, num(9)).effects.length, 0, 'an index outside the list does nothing')
{
  // two pending entries, the first removed before the calendar answered: the answer goes to the remaining one
  let s = fill(h, h.vm.execute('init'), 'A', 7, 0, true); s = act(h, 'addReminder1', s, num(0)).st
  s = fill(h, s, 'B', 8, 0, true); s = act(h, 'addReminder1', s, num(0)).st
  s = act(h, 'removeReminder1', s, num(0)).st; s = act(h, 'onAdded1', s, str('55')).st
  assert.match(text(h, s), /B\|08:00 - every day\|in calendar/); assert.doesNotMatch(text(h, s), /\bA\|/)
}
// a refusal to remove is shown, a success is silent
assert.match(text(h, act(h, 'onRemoved1', rm.st, str('error 9: nope')).st), /Last action\|error 9: nope/)
assert.doesNotMatch(text(h, act(h, 'onRemoved1', rm.st, str('ok')).st), /Last action/)
// open the calendar: the ability, and a refusal is shown
r = act(h, 'openCalendar1', st, num(0)); assert.equal(r.effects[0].rawTarget, 'com.huawei.hmos.calendar/phone/MainAbility'); assert.equal(r.effects[0].resultHandler, 'onOpened1')

// the calendar off: only a list, no phone call, no status
{
  const l = build(['reminders'], {[CAL]: 'false'})
  let s = fill(l, l.vm.execute('init'), 'Water', 10, 0, true); r = act(l, 'addReminder1', s, num(0))
  assert.equal(r.effects.length, 0); assert.match(text(l, r.st), /Water\|10:00 - every day/); assert.doesNotMatch(text(l, r.st), /sending|in calendar|Open calendar/)
  assert.equal(act(l, 'removeReminder1', r.st, num(0)).effects.length, 0)
}

// two blocks do not collide
compileVeraSource(composeProgram(['reminders', 'reminders'], globals, [values('reminders'), values('reminders')]))

// Jev: the form is the block, and the calendar slot covers the integration veto
{
  const body = (slot, vetoes) => {
    const answers = {section1: {choice: 'reminders', confidence: 0.9}, 'section1.reminders.calendar': {noul: slot}}
    for (const k of ['needs_integration', 'needs_real_data', 'needs_search_or_form', 'needs_live_ticking', 'needs_multiple_counters', 'needs_multiple_series', 'needs_logic'])
      answers['veto.' + k] = {noul: vetoes[k] || 0}
    return JSON.stringify({answers})
  }
  let o = readSectionPick(body(0.9, {needs_integration: 0.8, needs_search_or_form: 0.95}))
  assert.equal(o.sections[0].slotValues.get(CAL), 'true'); assert.equal(o.needsLogic, false, 'calendar on: both vetoes are covered')
  o = readSectionPick(body(0.1, {needs_integration: 0.8, needs_search_or_form: 0.95}))
  assert.equal(o.sections[0].slotValues.get(CAL), 'false'); assert.equal(o.needsLogic, true, 'calendar off: an integration is still the model\'s'); assert.doesNotMatch(o.note, /needs_search_or_form/)
}
console.log('reminders-check ok')
