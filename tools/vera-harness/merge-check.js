// A part and a section of the catalogue on a par (VeraCompose.ets's chooseSections, AgentAlign.ets's alignKindsFor): where both can
// do a need -- a countdown (the `timer` section), a list the person fills in (`record_log`, `reminders`) -- one question puts the part
// and the sections side by side, and Jev's confident pick takes the part's place unless something else on the screen is wired to
// the part. A section is never added beside the part that does the same. Recorded plans, Jev's answers added by hand. No network.
'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {loadVera} = require('./source-loader')
const {needsOf, asPlan} = require('./needs-lib')
const c = loadVera('VeraCompose')
const {compileVeraSource} = loadVera('VeraCompiler')
const {smokeRun} = loadVera('VeraSmoke')
const {describePlan} = loadVera('ScreenPlan')
const align = loadVera('agent/AgentAlign')

const fixture = (label, file) => fs.readFileSync(path.join(__dirname, 'compose', label, file), 'utf8')
function read(label, extra = {}, edit = null) {
  const sketchJson = JSON.parse(fixture(label, 'sketch.json'))
  const body = JSON.parse(fixture(label, 'jev-answer.json'))
  if (edit) edit(sketchJson, body.answers)
  Object.assign(body.answers, extra)
  const sketch = c.parseSketch(JSON.stringify(sketchJson))
  return {sketch, comp: c.readComposition(JSON.stringify(body), sketch, false)}
}
const says = (choice, confidence = 0.9) => ({type: 'choice', choice, confidence})
const runs = comp => { const compiled = compileVeraSource(c.assembleProgram(comp)); assert.equal(smokeRun(compiled, false), ''); return compiled }
// soft-egg with a countdown of one fixed time and nothing wired to it: the case the `timer` section may take.
const fixedLength = (s, a) => {
  s.constants = [{id: 'brewTime', label: 'Brew time', value: 240, measure: 'seconds'}]
  s.countdown.length = 'brewTime'; s.events = []; s.inputs = []
  delete a['effect.notifyDone']; delete a['moment.notifyDone']
  a['countdown.length'] = says('brewTime', 1)
}

// The question is not the composer's: the part and the sections that may stand in for it are put side by side before the composer
// is asked anything (NeedsChoose.ets, needs-choose-check.js), and its answers are read below under the same keys.
{
  for (const label of ['soft-egg', 'stopwatch', 'expenses', 'tip']) {
    const q = JSON.parse(c.buildComposeRequest(label, c.parseSketch(fixture(label, 'sketch.json')))).questions
    assert.ok(!('clock.part' in q) && !('list.part' in q), label + ': the composer does not ask whether a section does it')
  }
}

// A stopwatch whose list is its laps: the Lap button is the stopwatch's, the list has no form to type one in, and a lap holds the time passed
// and what it took since the one before. Nothing is left for a section the model writes.
{
  const {comp} = read('stopwatch', {}, s => { s.list = {label: 'Laps', fields: []} })
  const program = c.assembleProgram(comp)
  assert.match(program, /function lapEntry\(/); assert.match(program, /ui\.Button\("secondary", "Lap", "lapEntry"/)
  assert.ok(!/ui\.Button\("primary", "Add", "addEntry"/.test(program), 'no form to add a lap by hand')
  assert.match(program, /Start the stopwatch and tap Lap/)
  assert.ok(comp.sketch.list.fields.some(f => f.id === 'seconds') && comp.sketch.list.fields.some(f => f.id === 'split'))
  runs(comp)
  assert.ok(/state\.entries\.length\(\) - 1\]/.test(program), 'the split is taken from the lap before')
  // A list that is not laps keeps its form.
  const plain = read('stopwatch', {}, s => { s.list = {label: 'Exercises', fields: []} })
  assert.ok(!/lapEntry/.test(c.assembleProgram(plain.comp)))
}

// A countdown of one fixed time with nothing wired to it: Jev's `timer` replaces the clock part, which is gone from the program.
{
  const {comp} = read('soft-egg', {'clock.part': says('timer')}, fixedLength)
  assert.deepEqual(comp.blocks, ['timer']); assert.deepEqual(comp.replaced.map(r => r.kind), ['timer'])
  assert.equal(comp.sketch.hasCountdown, false); assert.equal(comp.countdownFrom, '')
  assert.ok(comp.dropped.some(d => /a section does it, not a part/.test(d)))
  assert.ok(comp.claimed.length > 0, 'the finished screen is read against what the section was chosen for')
  assert.ok(!c.compositionParts(comp).some(p => p.kind === 'clock'))
  const plan = c.screenPlan(comp)
  assert.match(describePlan(plan), /section\.timer block by timer/)
  assert.equal(plan.open().length, 0)
  runs(comp)
}
// The part is the answer when Jev says so, is unsure, or gives none: the recorded plans behave as they did.
for (const answer of [says('part'), says('timer', 0.3), undefined]) {
  const {comp} = read('soft-egg', answer === undefined ? {} : {'clock.part': answer}, fixedLength)
  assert.deepEqual(comp.blocks, []); assert.deepEqual(comp.replaced, [])
  assert.ok(c.compositionParts(comp).some(p => p.kind === 'clock'))
}
// What the part is wired to keeps it: a length the person sets, values that read the clock, an effect at the countdown's end.
for (const label of ['egg', 'soft-egg', 'default-boil']) {
  const {comp} = read(label, {'clock.part': says('timer', 1)})
  assert.deepEqual(comp.replaced, [], label + ' keeps its clock part')
  assert.ok(c.compositionParts(comp).some(p => p.kind === 'clock'))
}
{
  const withEnd = read('soft-egg', {'clock.part': says('timer', 1)}, (s, a) => { fixedLength(s, a); const first = JSON.parse(fixture('soft-egg', 'jev-answer.json')).answers; s.events = JSON.parse(fixture('soft-egg', 'sketch.json')).events; a['effect.notifyDone'] = first['effect.notifyDone']; a['moment.notifyDone'] = first['moment.notifyDone'] })
  assert.deepEqual(withEnd.comp.replaced, [], 'an event at the end keeps the part')
}

// A list nothing reads: `record_log` (or `reminders`) in its place; the form and the list parts are gone.
{
  const {comp} = read('pill', {'list.part': says('record_log')})
  assert.deepEqual(comp.blocks, ['record_log']); assert.equal(comp.sketch.list, null)
  assert.ok(!c.compositionParts(comp).some(p => p.kind === 'list'))
  assert.match(describePlan(c.screenPlan(comp)), /section\.record_log block by record_log/)
  runs(comp)
  const reminders = read('pill', {'list.part': says('reminders')}).comp
  assert.deepEqual(reminders.blocks, ['reminders']); runs(reminders)
  // A name that is not one of the sections for a list is no answer.
  assert.deepEqual(read('pill', {'list.part': says('timer')}).comp.blocks, [])
}
// An event on an entry keeps the list part, whatever the section.
{
  const {comp} = read('pill-calendar', {'list.part': says('record_log', 1)})
  assert.deepEqual(comp.replaced, [], 'pill-calendar keeps its list part')
  assert.ok(c.compositionParts(comp).some(p => p.kind === 'list'))
}
// A total over the entries keeps the part for a section that only keeps entries (`reminders`) ...
{
  const {comp} = read('expenses', {'list.part': says('reminders', 1)})
  assert.deepEqual(comp.replaced, [], 'a total over the entries keeps the list part')
  assert.ok(c.compositionParts(comp).some(p => p.kind === 'list'))
}
// ... but not for `record_log`, which publishes totals, averages and counts for the readers of the catalogue: the total leaves the
// plan as a need, asked of those readers first, and is a written section only when none does it.
{
  const {comp} = read('expenses', {'list.part': says('record_log')})
  assert.deepEqual(comp.blocks, ['record_log']); assert.equal(comp.sketch.list, null)
  assert.equal(comp.sketch.values.length, 0); assert.equal(comp.bindings.size, 0)
  assert.equal(comp.custom.length, 1); assert.match(comp.custom[0], /^shows /)
  assert.ok(comp.dropped.some(d => /left to what the section that keeps the entries publishes/.test(d)))
  assert.ok(align.alignCandidates(comp).length === 1, 'and it is a need Align may offer')
  assert.ok(align.readerKinds(comp).includes('number_strip'), 'to the readers of the section\'s records')
}

// The leftovers offered to the catalogue (AgentAlign.ets) never add a section beside the part that does the same job.
{
  const pool = comp => align.alignKindsFor(comp)
  const egg = read('egg').comp
  assert.ok(!pool(egg).includes('timer'), 'a countdown is on the screen: no second timer')
  assert.ok(pool(egg).includes('note') && pool(egg).includes('checklist'))
  const stopwatch = read('stopwatch').comp
  assert.ok(!pool(stopwatch).includes('timer'), 'nor beside a stopwatch')
  // A list wired to a total keeps its part against `reminders`, but `record_log` publishes the total for the readers; one wired
  // to an entry's event keeps it against both.
  const expenses = read('expenses').comp
  assert.ok(pool(expenses).includes('record_log') && !pool(expenses).includes('reminders'))
  assert.ok(!pool(read('pill-calendar').comp).includes('record_log'))
  assert.ok(!pool(read('pill-calendar').comp).includes('reminders'))
  // A list nothing is wired to is given up for the section chosen for what is left, not kept beside it.
  const pill = read('pill').comp
  assert.ok(pool(pill).includes('reminders') && pool(pill).includes('record_log'))
  const needs = align.alignCandidates(pill)
  const result = new align.AlignResult()
  align.readAlignment(JSON.stringify({answers: Object.fromEntries(needs.map((_n, i) => ['need.' + i, {choice: 'reminders', confidence: 0.9}]))}), needs, result, pool(pill))
  align.applyAlignment(pill, result)
  assert.deepEqual(pill.blocks, ['reminders']); assert.equal(pill.sketch.list, null)
  assert.deepEqual(pill.replaced.map(r => r.kind), ['reminders'])
  assert.ok(!c.compositionParts(pill).some(p => p.kind === 'list'), 'one list of reminders, not two')
  // A plan with neither a clock nor a list is offered everything the pool has.
  assert.ok(pool(read('tip').comp).includes('timer') && pool(read('tip').comp).includes('record_log'))
}

// Through the agent: the section is filled like any other, the program is checked, and the plan has no open slot.
const {AgentHost, defaultBlockFill} = loadVera('agent/AgentHost')
const {AgentRequest, runAgent} = loadVera('agent/VeraAgent')
;(async () => {
  align.setAlignEnabled(false)
  for (const [label, extra, kind, edit] of [['soft-egg', {'clock.part': says('timer')}, 'timer', fixedLength], ['pill', {'list.part': says('record_log')}, 'record_log', null]]) {
    const h = new AgentHost()
    const sketchJson = JSON.parse(fixture(label, 'sketch.json')); const body = JSON.parse(fixture(label, 'jev-answer.json'))
    if (edit) edit(sketchJson, body.answers)
    Object.assign(body.answers, extra)
    let filled = null
    h.askPlan = async (system, user, onText) => { const t = JSON.stringify(needsOf(sketchJson, false)); onText(t); return t }
    h.askJev = async () => JSON.stringify(body)
    h.fillBlocks = async request => { filled = request; return defaultBlockFill(request) }
    const r = await runAgent(Object.assign(new AgentRequest(), {prompt: 'x'}), h)
    assert.deepEqual(r.blocks, [kind], label)
    assert.deepEqual(filled.kinds, [kind], label)
    assert.equal(r.errors, '', label + ': ' + r.note)
    // The recorded plan of pill also has a section only the model can write: no program without one, on the host.
    if (label !== 'pill') assert.ok(r.vbc2.length > 0, label + ': ' + r.note)
    assert.ok(r.screen.slots.some(s => s.id === 'section.' + kind && s.fill === 'block'), label)
  }
  {
    // The section Align gives a need may publish what a reader shows: the readers are asked about what is still left afterwards,
    // and a list given up this way is no claim for the finished screen to be read against (the need was the evidence).
    {
      const comp = read('expenses').comp
      assert.equal(comp.claimed.length, 0)
      comp.custom.push('track what each person has spent and the total per person')
      comp.custom.push('show the total spent')
      const rounds = []
      const answer = async body => {
        const q = JSON.parse(body).questions
        const kinds = Object.keys(q['need.0'].criteria); rounds.push(kinds)
        const pick = kinds.includes('record_log') ? 'record_log' : (kinds.includes('number_strip') ? 'number_strip' : 'none')
        const answers = {}
        Object.keys(q).filter(k => k.startsWith('need.')).forEach(k => {
          const need = q[k].instructions
          answers[k] = {choice: pick === 'record_log' ? (/track what each/.test(need) ? 'record_log' : 'none') : pick, confidence: 0.9}
        })
        answers.real_data = {choice: 'false', confidence: 0.1}
        return JSON.stringify({answers})
      }
      const result = await align.alignLeftovers(comp, 'x', answer)
      assert.equal(rounds.length, 2, 'the sections that stand alone, then the readers of what was chosen')
      assert.ok(rounds[0].includes('record_log') && !rounds[0].includes('number_strip'))
      assert.ok(rounds[1].includes('number_strip') && !rounds[1].includes('record_log'))
      assert.deepEqual(comp.blocks, ['record_log', 'number_strip']); assert.equal(result.readers, 1)
      assert.equal(comp.sketch.list, null); assert.equal(comp.claimed.length, 0)
    }
  }
  // A need that is the person's own records (a chart of what they entered) is a reader's: it shows them and makes nothing up; a section
  // that stands alone is never offered it.
  {
    const comp = read('expenses', {'list.part': says('record_log')}).comp
    comp.custom = ['A bar chart of the logged spending per category' + align.OWN_MARK + ': they add, change and remove them']
    assert.deepEqual(align.alignCandidates(comp), [])
    assert.equal(align.alignReaderCandidates(comp).length, 1)
    const rounds = []
    const result = await align.alignLeftovers(comp, 'x', async body => {
      const q = JSON.parse(body).questions
      rounds.push(Object.keys(q['need.0'].criteria))
      return JSON.stringify({answers: {'need.0': {choice: 'series_chart', confidence: 0.9}, real_data: {choice: 'false', confidence: 0.1}}})
    })
    assert.equal(rounds.length, 1); assert.ok(rounds[0].includes('series_chart') && !rounds[0].includes('key_facts'))
    assert.deepEqual(comp.blocks, ['record_log', 'series_chart']); assert.deepEqual(comp.custom, [])
    assert.equal(result.readers, 1)
  }
  // What is left to write is read against the screen the sections make: a detail the log already settles in its own way is not
  // written again; nothing is taken for done without Jev's word.
  {
    const claims = loadVera('agent/AgentClaims')
    const reply = yes => async () => JSON.stringify({answers: Object.fromEntries(yes.map((p, i) => ['does.' + i, {probabilities: {yes: p, no: 1 - p}}]))})
    assert.deepEqual(await claims.claimsDone(['a', 'b'], 'x', 'src', reply([0.9, 0.2])), ['a'])
    assert.deepEqual(await claims.claimsDone(['a'], 'x', 'src', async () => ''), [], 'no answer: nothing is done')
    assert.deepEqual(await claims.claimsDone(['a'], 'x', 'src', async () => '{"answers":{}}'), [], 'no answer for the need: not done')
    assert.deepEqual(await claims.claimsDone(['a'], 'x', 'src', async () => { throw new Error('down') }), [])
    assert.deepEqual(await claims.claimsDone([], 'x', 'src', reply([])), [])

    align.setAlignEnabled(true)
    const run = async yes => {
      const h = new AgentHost()
      const sketchJson = JSON.parse(fixture('expenses', 'sketch.json')); sketchJson.other = ['pick the category of each expense from a list']
      const body = JSON.parse(fixture('expenses', 'jev-answer.json')); body.answers['list.part'] = says('record_log')
      const verified = []
      h.askPlan = async (system, user, onText) => { const t = JSON.stringify(needsOf(sketchJson, false)); onText(t); return t }
      h.askJev = async request => {
        const q = JSON.parse(request).questions
        if (q['does.0']) { verified.push(q['does.0'].instructions); return JSON.stringify({answers: {'does.0': {probabilities: {yes, no: 1 - yes}}}}) }
        if (q['need.0']) {
          // The readers take the total; nothing else is a section's.
          const answers = {real_data: {choice: 'false', confidence: 0.1}}
          Object.keys(q).filter(k => k.startsWith('need.')).forEach(k => { answers[k] = {choice: /Total spent/.test(q[k].instructions) && 'number_strip' in q[k].criteria ? 'number_strip' : 'none', confidence: 0.9} })
          return JSON.stringify({answers})
        }
        return JSON.stringify(body)
      }
      h.fillBlocks = async request => defaultBlockFill(request)
      const r = await runAgent(Object.assign(new AgentRequest(), {prompt: 'expense log'}), h)
      return {r, verified}
    }
    const done = await run(0.9)
    assert.deepEqual(done.verified.length, 1); assert.match(done.verified[0], /category of each expense/)
    assert.match(done.r.note, /; already on the screen: pick the category of each expense from a list/)
    assert.equal(done.r.custom, null, 'nothing was written'); assert.equal(done.r.screen.toWrite().length, 0)
    assert.ok(done.r.vbc2.length > 0, done.r.note)
    const missing = await run(0.1)
    assert.doesNotMatch(missing.r.note, /already on the screen/)
    assert.equal(missing.r.screen.toWrite().length + (missing.r.custom ? 1 : 0) > 0, true, 'still for the model to write')
  }
  // The records cluster end to end: the log, and the readers asked about first for what it publishes -- a stub Jev names
  // number_strip for the total -- give a program that compiles, runs, and shows the log's own total.
  {
    const h = new AgentHost()
    const body = JSON.parse(fixture('expenses', 'jev-answer.json')); body.answers['list.part'] = says('record_log')
    const asked = []
    h.askPlan = async (system, user, onText) => { const t = asPlan(fixture('expenses', 'sketch.json')); onText(t); return t }
    h.askJev = async request => {
      const q = JSON.parse(request).questions
      if (q['need.0']) { asked.push(Object.keys(q['need.0'].criteria)); return JSON.stringify({answers: {'need.0': {choice: 'number_strip', confidence: 0.9}, real_data: {choice: 'false', confidence: 0.1}}}) }
      return JSON.stringify(body)
    }
    h.fillBlocks = async request => defaultBlockFill(request)
    align.setAlignEnabled(true)
    const r = await runAgent(Object.assign(new AgentRequest(), {prompt: 'trip expense log with a total'}), h)
    assert.equal(asked.length, 1, 'the readers are asked, and nothing is left for the sections that stand alone')
    assert.ok(asked[0].includes('number_strip') && !asked[0].includes('key_facts'))
    assert.deepEqual(r.blocks, ['record_log', 'number_strip'])
    assert.equal(r.errors, '', r.note); assert.ok(r.vbc2.length > 0, r.note)
    assert.match(r.source, /totalSum\d+\(state\)/, 'the strip shows the log\'s total')
    assert.ok(!/state\.entries/.test(r.source), 'no list part beside the log')
    assert.equal(r.screen.toWrite().length, 0)
  }
  align.setAlignEnabled(true)
  console.log('merge-check: ok')
})().catch(e => { align.setAlignEnabled(true); console.error(e); process.exit(1) })
