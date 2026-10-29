// NeedsChoose.ets: the plan of needs and Jev's choice of a section or a part for each need, through runAgent with a host that
// answers from recorded plans (tools/vera-harness/compose/). The choices Jev gives are put in by hand. No network.
'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {loadVera} = require('./source-loader')
const {needsOf} = require('./needs-lib')
const {AgentHost, defaultBlockFill} = loadVera('agent/AgentHost')
const {AgentRequest, runAgent} = loadVera('agent/VeraAgent')
const c = loadVera('VeraCompose')
const nc = loadVera('NeedsChoose')
const np = loadVera('NeedsPlan')
const align = loadVera('agent/AgentAlign')

const fixture = (label, file) => fs.readFileSync(path.join(__dirname, 'compose', label, file), 'utf8')
const says = (choice, confidence = 0.9) => ({type: 'choice', choice, confidence})

// Runs the agent on a recorded sketch, written as a needs plan. `edit(sketchJson)` changes the recorded plan first; `choices` is
// what Jev answers to the choice call (null: nothing, twice). Returns what was asked of Jev, in order.
async function run(label, choices, edit = null, request = null) {
  const sketchJson = JSON.parse(fixture(label, 'sketch.json'))
  const rest = JSON.parse(fixture(label, 'jev-answer.json'))
  if (edit) edit(sketchJson, rest.answers)
  for (const key of Object.keys(rest.answers)) if (/^(clock\.part|list\.part|ready\.|whose\.|real_data)/.test(key)) delete rest.answers[key]
  const h = new AgentHost()
  const asked = []
  h.askPlan = async (system, user, onText) => {
    assert.match(system, /JSON plan of what the app needs/)
    const t = JSON.stringify(needsOf(sketchJson)); onText(t); return t
  }
  h.askJev = async body => {
    const q = JSON.parse(body).questions
    const isChoice = Object.keys(q).every(k => /^(clock\.part|list\.part|ready\.|whose\.|real_data)/.test(k))
    asked.push({keys: Object.keys(q), q})
    if (isChoice) return choices === null ? '' : JSON.stringify({answers: choices})
    return JSON.stringify(rest)
  }
  let filled = null
  h.fillBlocks = async request => { filled = request; return defaultBlockFill(request) }
  // The request: every quote the plan makes is in it, unless a test says what the request is.
  const said = needsOf(sketchJson).needs.filter(n => n.from).map(n => n.from).join('. ')
  const r = await runAgent(Object.assign(new AgentRequest(), {prompt: request || said || 'x'}), h)
  return {r, asked, filled}
}
const isChoice = a => a.keys.every(k => /^(clock\.part|list\.part|ready\.|whose\.|real_data)/.test(k))
const settledKeys = a => a.keys.filter(k => /^(clock\.part|list\.part|ready\.|whose\.|real_data)/.test(k))
// A countdown of one fixed time and nothing wired to it: the case the `timer` section may take (merge-check.js's).
const fixedLength = (s, a) => {
  s.constants = [{id: 'brewTime', label: 'Brew time', value: 240, measure: 'seconds'}]
  s.countdown.length = 'brewTime'; s.events = []; s.inputs = []
  if (a) { delete a['effect.notifyDone']; delete a['moment.notifyDone']; a['countdown.length'] = says('brewTime', 1) }
}

;(async () => {
  // A request that names one length starts the input that holds a length on it.
  {
    const mk = (kind, measure, extra) => c.parseSketch(JSON.stringify({title: 'T', inputs: [Object.assign({id: 'len', label: 'Length', kind, measure}, extra)]}))
    assert.deepEqual(nc.requestedSeconds('10 minute meditation timer, 2 hours later, 10 min'), [600, 7200])
    assert.deepEqual(nc.requestedSeconds('a 90-second plank'), [90])
    const choice = mk('choice', 'seconds', {options: [{label: '5 minutes', value: 300}, {label: '10 minutes', value: 600}, {label: '15 minutes', value: 900}], value: 2})
    assert.equal(nc.startOnRequested(choice, '10 minute meditation timer'), 'Length starts on 10 minutes')
    assert.equal(choice.inputs[0].value, 1)
    assert.equal(nc.startOnRequested(choice, '10 minute meditation timer'), '', 'already there: nothing to say')
    assert.equal(nc.startOnRequested(choice, 'a 7 minute timer'), '', 'not among the options: left as the plan has it')
    assert.equal(nc.startOnRequested(choice, '5 minutes then 10 minutes'), '', 'two lengths: no way to tell')
    const amount = mk('amount', 'minutes', {min: 1, max: 60, value: 20})
    assert.equal(nc.startOnRequested(amount, 'pomodoro timer 25 minutes'), 'Length starts at 25')
    assert.equal(amount.inputs[0].value, 25)
    assert.equal(nc.startOnRequested(mk('amount', 'minutes', {min: 1, max: 20, value: 5}), '25 minutes'), '', 'out of range')
    assert.equal(nc.startOnRequested(mk('amount', 'money', {value: 5}), '25 minutes'), '', 'not a length')
  }
  align.setAlignEnabled(false)

  // The plan's facts decide what is offered, before anyone is asked.
  {
    const plan = n => np.parseNeedsPlan(JSON.stringify(needsOf(n)))
    const egg = JSON.parse(fixture('soft-egg', 'sketch.json'))
    assert.equal(nc.timerMayTakeCountdown(plan(egg)), false, 'a length the person sets keeps the part')
    fixedLength(egg)
    assert.equal(nc.timerMayTakeCountdown(plan(egg)), true)
    egg.events = [{id: 'done', when: 'the countdown reaches zero', what: 'beep', asked: true}]
    assert.equal(nc.timerMayTakeCountdown(plan(egg)), false, 'something at the end keeps the part')
    const pill = JSON.parse(fixture('pill', 'sketch.json'))
    assert.deepEqual(nc.listSectionsFor(plan({...pill, events: [{id: 'a', when: 'when an entry is added', what: 'x', asked: true}]})), [])
    const log = JSON.parse(fixture('expenses', 'sketch.json'))
    log.values = [{id: 'sum', label: 'Sum', means: 'sum', format: 'plain', formula: 'entryTotal', example: {given: {entryTotal: 1}, result: 1}}]
    assert.deepEqual(nc.listSectionsFor(plan(log)), ['record_log'], 'a figure over the entries is only for the log to publish')
  }

  // A countdown of one fixed time: Jev is asked once, with the part and the section; the second call does not ask it again.
  {
    const {r, asked, filled} = await run('soft-egg', {'clock.part': says('timer')}, fixedLength)
    assert.ok(isChoice(asked[0]) && !isChoice(asked[1]), 'the choice, then the rest')
    // The plan fixed the length (240 s): the section's writer is told, and the finished screen is read against it.
    assert.match(filled.prompt, /The plan fixes: .*counts down 4 minutes/)
    assert.ok(JSON.stringify(asked.map(a => a.q)).includes('counting down 4 minutes'), 'the claim carries the length')
    assert.deepEqual(asked[0].keys, ['clock.part'])
    assert.deepEqual(Object.keys(asked[0].q['clock.part'].criteria).sort(), ['part', 'timer'])
    assert.ok(!asked[1].keys.includes('clock.part'))
    assert.deepEqual(r.blocks, ['timer'], r.note)
    assert.equal(r.errors, '', r.note)
  }
  // The same, when Jev prefers the part: the part stays and nothing else changes.
  {
    const {r, asked} = await run('soft-egg', {'clock.part': says('part')}, fixedLength)
    assert.deepEqual(r.blocks || [], [], r.note)
    assert.ok(r.vbc2.length > 0, r.note)
    assert.ok(isChoice(asked[0]) && !isChoice(asked[1]))
  }
  // A length the person sets: the section is not offered, so nobody is asked, and the second call does not ask it either.
  {
    const {r, asked} = await run('soft-egg', {})
    assert.ok(!isChoice(asked[0]) && !asked[0].keys.includes('clock.part'), 'no choice call')
    assert.deepEqual(r.blocks || [], [])
    assert.ok(r.vbc2.length > 0, r.note)
  }
  // A list the person fills in: the part, the log and the reminders side by side; the log takes it.
  {
    const {r, asked} = await run('expenses', {'list.part': says('record_log')})
    assert.deepEqual(Object.keys(asked[0].q['list.part'].criteria).sort(), ['part', 'record_log', 'reminders'])
    assert.ok(!asked[1].keys.includes('list.part'))
    assert.deepEqual(r.blocks, ['record_log'], r.note)
  }
  // Something happens as an entry is added: only the part can do it, so the question is not asked.
  {
    const {asked} = await run('pill', {}, s => { s.events = [{id: 'a', when: 'when an entry is added', what: 'beep', asked: true}] })
    assert.ok(asked.every(a => !a.keys.includes('list.part')))
  }
  // Content written for the request: which section, whose data it is and whether it needs a search are asked once, first.
  {
    const {r, asked} = await run('sections-beach', {'ready.0': says('checklist'), 'whose.0': says('written'), real_data: says('false')})
    assert.ok(isChoice(asked[0]))
    assert.ok(asked[0].keys.includes('ready.0') && asked[0].keys.includes('whose.0') && asked[0].keys.includes('real_data'))
    assert.deepEqual(settledKeys(asked[1]), [], 'the second call asks none of them')
    assert.deepEqual(r.blocks, ['checklist'], r.note)
  }
  // Jev gives no choice: the composer asks them itself in the second call, as before the plan of needs.
  {
    const {asked} = await run('sections-beach', null)
    assert.ok(asked.length >= 3 && isChoice(asked[0]) && isChoice(asked[1]))
    assert.ok(settledKeys(asked.find(a => !isChoice(a))).includes('ready.0'), 'the second call asks them')
  }
  // A need the request does not ask for is not built: the quote it makes is not the request's.
  {
    const {r} = await run('sections-beach', {'ready.0': says('checklist'), 'whose.0': says('written'), real_data: says('false')}, (s) => {
      s.ready = ['beach packing checklist', 'a short note about the weather on the beach']
    }, 'beach packing checklist')
    // The checklist's own quote is its words, and the request is "beach packing checklist": it stays; the weather note does not.
    assert.deepEqual(r.blocks, ['checklist'], r.note)
    assert.match(r.note, /not in the request, so not built: a short note about the weather/)
    assert.ok(r.composed.dropped.some(d => /^not in the request: a short note about the weather/.test(d)))
  }
  // A section that does an effect does it for an event the effect could not be given its details for as well: no second button.
  {
    const sketch = c.parseSketch(JSON.stringify({title: 'T', ready: ['an hour by hour list of stops'],
      events: [{id: 'nav', when: 'the person taps a stop\'s navigate button', what: 'opens maps with directions to that stop', asked: true},
               {id: 'cal', when: 'the person taps a stop\'s calendar button', what: 'adds that stop to the calendar', asked: true},
               {id: 'wipe', when: 'the person taps the wipe button', what: 'removes every calendar event this app added', asked: true}]}))
    const a = (choice, confidence = 0.95) => ({type: 'choice', choice, confidence})
    const answers = {'ready.0': a('itinerary'), 'whose.0': a('written'), real_data: a('false'),
      'effect.nav': a('navigate'), 'moment.nav': a('button'), 'arg.nav.navigate.place': a('unavailable'),
      'effect.cal': a('calendar_add'), 'moment.cal': a('button'), 'arg.cal.calendar_add.title': a('unavailable'),
      'effect.wipe': a('calendar_clear'), 'moment.wipe': a('button')}
    const comp = c.readComposition(JSON.stringify({answers}), sketch, false)
    assert.equal(comp.custom.length, 2, 'two events could not be given their details: ' + comp.custom.join(' / '))
    assert.deepEqual([...comp.customEffects.values()].sort(), ['calendar_add', 'navigate'])
    // The itinerary's stop buttons: its navigate and calendar slots provide these effects.
    const itinerary = loadVera('VeraTemplates').fragments().find(f => f.kind === 'itinerary')
    const provided = itinerary.slots.flatMap(sl => sl.provides)
    assert.ok(provided.includes('navigate') && provided.includes('calendar_add') && provided.includes('calendar_clear'))
    const gone = c.dropProvided(comp, provided)
    assert.equal(gone.length, 3, gone.join(' / '))
    assert.deepEqual(comp.custom, [])
    assert.deepEqual(comp.phoneNeeds, [])
    assert.deepEqual(comp.unboundNeeds, [])
    assert.equal(comp.events.length, 0)
  }
  align.setAlignEnabled(true)
  console.log('needs-choose-check ok')
})().catch(e => { console.error(e); process.exit(1) })
