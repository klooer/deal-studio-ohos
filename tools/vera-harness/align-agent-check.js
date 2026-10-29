// agent/AgentAlign.ets without the network: what the composition leaves for the model to write is offered to the catalogue first,
// one Jev question per need. A host replays the recorded sketch and Jev's composition (tools/vera-harness/compose/pill: a daily
// medicine reminder through the phone's calendar, with two figures of its own) and answers the alignment itself.
'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {loadVera} = require('./source-loader')
const {needsOf, asPlan} = require('./needs-lib')
const {AgentHost, defaultBlockFill} = loadVera('agent/AgentHost')
const {AgentRequest, runAgent} = loadVera('agent/VeraAgent')
const align = loadVera('agent/AgentAlign')
const compose = loadVera('VeraCompose')

// The recorded plans: compose/ for the ones the other checks read too, align/ for those only this one needs.
const fixture = (label, file) => fs.readFileSync(path.join(__dirname, fs.existsSync(path.join(__dirname, 'align', label)) ? 'align' : 'compose', label, file), 'utf8')
const compositionOf = label => compose.readComposition(fixture(label, 'jev-answer.json'), compose.parseSketch(fixture(label, 'sketch.json')))

// The answer to the alignment request: `says(need)` gives [section, confidence] for each need asked about.
function host(label, says, {real = ['false', 0.1]} = {}) {
  const h = new AgentHost()
  const seen = {jev: 0, align: [], fill: null}
  h.askPlan = async (system, user, onText) => { const t = asPlan(fixture(label, 'sketch.json')); onText(t); return t }
  h.askJev = async body => {
    seen.jev++
    const q = JSON.parse(body).questions
    if (!q['need.0']) return fixture(label, 'jev-answer.json')
    seen.align.push(body)
    if (says === null) return ''
    const answers = {}
    Object.keys(q).filter(k => k.startsWith('need.')).forEach(k => {
      const need = q[k].instructions.match(/"(.*)"\. Which/)[1]
      const [choice, confidence] = says(need)
      answers[k] = {choice, confidence}
    })
    answers.real_data = {choice: real[0], confidence: real[1]}
    return JSON.stringify({answers})
  }
  h.fillBlocks = async request => { seen.fill = request; return defaultBlockFill(request) }
  return {host: h, seen}
}
const ask = prompt => Object.assign(new AgentRequest(), {prompt})

;(async () => {
  // On by default, with the wide pool; what follows says which it tests.
  assert.equal(align.alignIsEnabled(), true); assert.equal(align.alignIsWide(), true)
  assert.ok(align.alignKinds().includes('timer'))
  align.setAlignEnabled(false); align.setAlignWide(false)
  try {
  // The recorded plan: three needs a section might do (the calendar call, what it answered, adding a medicine), and two figures.
  const pill = compositionOf('pill')
  assert.equal(pill.custom.length, 5)
  const candidates = align.alignCandidates(pill)
  assert.equal(candidates.length, 3)
  assert.ok(candidates.every(n => !n.startsWith('the figure "')))
  // The person's own records are marked by the composer; the mark here is the one it writes.
  const own = compositionOf('own-todos')
  assert.ok(own.custom.some(n => n.includes(align.OWN_MARK)), 'the composer\'s own-records mark is the one AgentAlign skips')
  assert.deepEqual(align.alignCandidates(own), [])

  // The request: one choice per need among the sections allowed and none, and whether the content must be real.
  {
    const body = JSON.parse(align.buildAlignRequest('a medicine reminder', candidates))
    assert.equal(body.model, 'jev-latest'); assert.equal(body.state, 'a medicine reminder')
    assert.equal(Object.keys(body.questions).length, 2 * candidates.length + 1, 'a need, whose it is, for each, and whether the content must be real')
    const q = body.questions['need.1']
    assert.equal(q.type, 'choice'); assert.ok(q.instructions.includes(candidates[1]))
    assert.deepEqual(Object.keys(q.criteria).sort(), align.ALIGN_KINDS.concat(['none']).sort())
    for (const f of ['record_log', 'timer', 'number_strip', 'intent_panel', 'filter_box']) assert.ok(!(f in q.criteria), f + ' is not offered to a leftover need')
    assert.ok('reminders' in q.criteria && 'calendar_event' in q.criteria && 'itinerary' in q.criteria)
    assert.ok('real_data' in body.questions)
  }

  // Off (`--ps veraAlign 0`): nothing is asked and the needs stay for the model.
  {
    assert.equal(align.alignIsEnabled(), false)
    const {host: h, seen} = host('pill', () => ['reminders', 0.9])
    const r = await runAgent(ask('a daily medicine reminder'), h)
    assert.equal(seen.align.length, 0); assert.equal(r.align, null)
    assert.equal(seen.fill, null, 'no section was asked for')
  }

  align.setAlignEnabled(true)
  try {
    // On: the three needs go to one `reminders` section, once, and only the figures are left to write.
    {
      const {host: h, seen} = host('pill', () => ['reminders', 0.9])
      const r = await runAgent(ask('a daily medicine reminder'), h)
      assert.equal(seen.align.length, 1)
      assert.deepEqual(r.blocks, ['reminders'])
      assert.deepEqual(seen.fill.kinds, ['reminders'])
      assert.deepEqual(r.align.added, ['reminders'])
      assert.equal(r.align.taken.length, 3)
      assert.deepEqual(r.composed.composition.custom.map(n => n.slice(0, 12)), ['the figure "', 'the figure "'])
      assert.deepEqual(r.composed.composition.phoneNeeds, [])
      assert.deepEqual(r.composed.composition.unboundNeeds, [])
      assert.match(r.note, /; align: reminders@0\.90, reminders@0\.90, reminders@0\.90 -> sections reminders/)
      assert.equal(r.screen.toWrite().length, 2, 'the two figures')
    }
    // Different sections for different needs, and one Jev is unsure of is left to the model.
    {
      const says = need => /calendar answered/.test(need) ? ['none', 0.9] : /add a medicine/.test(need) ? ['calendar_event', 0.4] : ['calendar_event', 0.8]
      const {host: h} = host('pill', says)
      const r = await runAgent(ask('x'), h)
      assert.deepEqual(r.align.added, ['calendar_event'])
      assert.equal(r.align.taken.length, 1)
      assert.equal(r.composed.composition.custom.length, 4, 'below the bar or none: still for the model')
    }
    // A name that is not a section of the list is no answer.
    {
      const {host: h} = host('pill', () => ['not-a-section', 1])
      const r = await runAgent(ask('x'), h)
      assert.deepEqual(r.blocks, []); assert.equal(r.composed.composition.custom.length, 5)
    }
    // Jev does not answer: the composition is as it was and the note says so.
    {
      const {host: h} = host('pill', null)
      const r = await runAgent(ask('x'), h)
      assert.deepEqual(r.blocks, []); assert.equal(r.composed.composition.custom.length, 5)
      assert.match(r.note, /; align: Jev did not answer/)
    }
    // Nothing the composition leaves is a section's to do (the person's own records): Jev is not asked.
    {
      const {host: h, seen} = host('own-todos', () => ['checklist', 0.9])
      const r = await runAgent(ask('my to-dos'), h)
      assert.equal(seen.align.length, 0); assert.equal(r.align, null)
    }
    // A plan with nothing left over (parts only) costs no call.
    {
      const {host: h, seen} = host('tip', () => ['checklist', 0.9])
      const r = await runAgent(ask('tip calculator'), h)
      assert.equal(seen.jev, 1); assert.equal(r.align, null); assert.ok(r.vbc2.length > 0)
    }
    // The inputs the composer kept for the section the model was to write are left out when a section takes everything it had.
    {
      const {host: h, seen} = host('phone-alarm', () => ['reminders', 0.9])
      const before = compositionOf('phone-alarm')
      assert.ok(before.custom.length > 0 && before.customReads.length > 0 && before.inputs.length > 0, 'the plan keeps inputs for the written section')
      const r = await runAgent(ask('set an alarm for my medication every day'), h)
      const comp = r.composed.composition
      assert.deepEqual(r.blocks, ['reminders'])
      assert.deepEqual(comp.custom, []); assert.deepEqual(comp.customReads, [])
      assert.deepEqual(comp.inputs, [], 'nothing reads them now')
      assert.ok(comp.dropped.some(d => /: a section does it$/.test(d)))
      assert.equal(r.screen.toWrite().length, 0)
      assert.ok(r.vbc2.length > 0, r.note)
      assert.ok(!/Alarm time|Set Alarm/.test(r.source), 'no leftover form beside the section')
    }
    // With a figure still to write, the inputs stay: it may read them.
    {
      const comp = compositionOf('pill')
      const inputs = comp.inputs.map(i => i.id)
      const result = new align.AlignResult()
      const needs = align.alignCandidates(comp)
      align.readAlignment(JSON.stringify({answers: Object.fromEntries(needs.map((_n, i) => ['need.' + i, {choice: 'reminders', confidence: 0.9}]))}), needs, result)
      align.applyAlignment(comp, result)
      assert.ok(comp.custom.length > 0)
      assert.deepEqual(comp.inputs.map(i => i.id), inputs)
    }
    // A section the screen already has does not stand in for a need: its slots here are the defaults.
    {
      const comp = compositionOf('sections-beach')
      assert.deepEqual(comp.blocks, ['checklist'])
      comp.custom.push('a button that adds each item to the calendar')
      const result = new align.AlignResult()
      align.readAlignment(JSON.stringify({answers: {'need.0': {choice: 'checklist', confidence: 0.95}}}), comp.custom, result)
      align.applyAlignment(comp, result)
      assert.deepEqual(comp.blocks, ['checklist']); assert.equal(comp.custom.length, 1); assert.deepEqual(result.added, [])
    }
    // Content that has to be real: the composition says so once a content section is added, and not for a phone one.
    {
      const real = (kind, says) => {
        const comp = compositionOf('pill')
        const result = new align.AlignResult()
        const needs = align.alignCandidates(comp)
        align.readAlignment(JSON.stringify({answers: Object.assign({real_data: {choice: 'true', confidence: says}},
          Object.fromEntries(needs.map((_n, i) => ['need.' + i, {choice: kind, confidence: 0.9}])))}), needs, result)
        align.applyAlignment(comp, result)
        return {comp, result}
      }
      assert.equal(real('itinerary', 0.9).comp.realData, true)
      assert.equal(real('itinerary', 0.2).comp.realData, false, 'under the bar')
      assert.equal(real('reminders', 0.9).result.realData, true, 'Jev\'s answer is read as it is')
      assert.equal(real('reminders', 0.9).comp.realData, false, 'but a reminder is the person\'s own entry: nothing to look up')
    }

    // Readers (the default pool): asked about first, when a section on the screen publishes every port they read. A checklist
    // publishes done and total, so list_summary may count its items; number_strip, which reads records nothing on the screen
    // publishes, is never offered. What a reader does not take goes on to the sections that stand alone.
    {
      const need = 'shows how many of the items are packed'
      const withNeed = () => { const comp = compositionOf('sections-beach'); comp.custom.push(need); return comp }
      const ask = (seen, answers) => async body => {
        const q = JSON.parse(body).questions
        seen.push(Object.keys(q['need.0'].criteria))
        return JSON.stringify({answers: {'need.0': {choice: answers[seen.length - 1], confidence: 0.9}, real_data: {choice: 'true', confidence: 0.9}}})
      }
      align.setAlignWide(false)
      assert.deepEqual(align.readerKinds(withNeed()), [], 'plain pool: no readers')
      align.setAlignWide(true)
      try {
        const comp = withNeed()
        assert.deepEqual(comp.blocks, ['checklist'])
        assert.deepEqual(align.readerKinds(comp).sort(), ['list_summary', 'progress_line'])
        const seen = []
        const result = await align.alignLeftovers(comp, 'a packing list for the beach', ask(seen, ['list_summary']))
        assert.equal(seen.length, 1, 'a reader took the need: nothing is left for the others')
        assert.deepEqual(seen[0].sort(), ['list_summary', 'none', 'progress_line'])
        assert.deepEqual(comp.blocks, ['checklist', 'list_summary'])
        assert.equal(result.readers, 1); assert.deepEqual(result.added, ['list_summary'])
        assert.equal(comp.realData, false, 'a reader has nothing to look up')
        // The reader reads the checklist's ports, by name, in the program the composition makes.
        const source = compose.assembleProgram(comp)
        assert.ok(/doneCount\d\(state\)/.test(source), 'bound to the checklist')
        // No reader takes it: the sections that stand alone are asked about what is left.
        const both = withNeed()
        const asked = []
        await align.alignLeftovers(both, 'x', ask(asked, ['none', 'search_list']))
        assert.equal(asked.length, 2)
        assert.ok(asked[0].includes('list_summary') && !asked[0].includes('timer'))
        assert.ok(asked[1].includes('timer') && !asked[1].includes('list_summary'))
        assert.deepEqual(both.blocks, ['checklist', 'search_list'])
      } finally {
        align.setAlignWide(false)
      }
    }

    // A need about the person's own data -- what they entered, what is worked out from it, marks on their own entries -- is not given a
    // section that writes content of its own (a checklist's items, a table's rows): it would make the data up. Readers, the sections
    // that keep the person's entries and the phone ones are not refused.
    {
      const need = 'let the person mark each settlement as paid'
      const answer = (choice, whose) => JSON.stringify({answers: {'need.0': {choice, confidence: 0.9}, 'whose.0': {choice: whose, confidence: 0.8}, real_data: {choice: 'false', confidence: 0.1}}})
      const read = (choice, whose, kinds = align.alignKinds()) => {
        const result = new align.AlignResult()
        align.readAlignment(answer(choice, whose), [need], result, kinds)
        return result.asked[0]
      }
      align.setAlignWide(true)
      try {
        assert.equal(read('checklist', 'written').kind, 'checklist')
        const refused = read('checklist', 'own')
        assert.equal(refused.kind, ''); assert.equal(refused.rejected, 'checklist')
        assert.equal(read('data_table', 'own').rejected, 'data_table')
        for (const kind of ['reminders', 'timer', 'note', 'record_log', 'progress_goal', 'calendar_event']) assert.equal(read(kind, 'own').kind, kind, kind + ' keeps what the person enters')
        assert.equal(read('list_summary', 'own', ['list_summary']).kind, 'list_summary', 'a reader shows the data, it makes none up')
        // Jev's probability for "own" decides, not which option it chose: 0.42 against 0.58 is own enough.
        const withProbabilities = (own, choice) => {
          const result = new align.AlignResult()
          align.readAlignment(JSON.stringify({answers: {'need.0': {choice, confidence: 0.9}, 'whose.0': {choice: own >= 0.5 ? 'own' : 'written', confidence: 0.16, probabilities: {own, written: 1 - own}}}}), [need], result, align.alignKinds())
          return result.asked[0]
        }
        assert.equal(withProbabilities(0.42, 'data_table').rejected, 'data_table')
        assert.equal(withProbabilities(0.05, 'data_table').kind, 'data_table')
        // The question is asked only when a section that writes content is among the options.
        const body = JSON.parse(align.buildAlignRequest('x', [need]))
        assert.ok('whose.0' in body.questions)
        assert.deepEqual(Object.keys(body.questions['whose.0'].criteria).sort(), ['own', 'written'])
        const onlyReaders = JSON.parse(align.buildAlignRequest('x', [need], ['list_summary', 'progress_line']))
        assert.ok(!('whose.0' in onlyReaders.questions))
        const onlyOwn = JSON.parse(align.buildAlignRequest('x', [need], ['reminders', 'timer']))
        assert.ok(!('whose.0' in onlyOwn.questions))
        // The trace says what was refused.
        const comp = compositionOf('pill')
        const needs = align.alignCandidates(comp)
        const run = new align.AlignResult()
        align.readAlignment(JSON.stringify({answers: Object.fromEntries(needs.flatMap((_n, i) => [['need.' + i, {choice: 'checklist', confidence: 0.9}], ['whose.' + i, {choice: 'own', confidence: 0.9}]]))}), needs, run)
        align.applyAlignment(comp, run)
        assert.deepEqual(run.added, []); assert.equal(comp.custom.length, 5, 'all still for the model to write')
      } finally {
        align.setAlignWide(false)
      }
    }

    // The wide pool (`--ps veraAlign wide`): every section that stands alone, bar the ones that do too little or are not a
    // section of their own. The plain pool is what it was, and goes back to it when wide is switched off.
    {
      const plain = align.alignKinds().slice()
      assert.deepEqual(plain, align.ALIGN_KINDS)
      align.setAlignWide(true)
      try {
        const wide = align.alignKinds()
        for (const k of plain) assert.ok(wide.includes(k), k + ' stays offered')
        for (const k of ['timer', 'note', 'rating', 'record_log', 'progress_goal']) assert.ok(wide.includes(k), k + ' is offered')
        for (const k of ['actions', 'metrics', 'intent_panel', 'filter_box', 'number_strip', 'breakdown_table', 'series_chart', 'settle_up',
          'master_list', 'detail_view', 'list_summary', 'progress_line']) assert.ok(!wide.includes(k), k + ' is not offered')
        const body = JSON.parse(align.buildAlignRequest('x', ['a second countdown']))
        assert.deepEqual(Object.keys(body.questions['need.0'].criteria).sort(), wide.concat(['none']).sort())
        // A section only the wide pool has is taken when Jev names it, and ignored in the plain pool.
        const {host: h} = host('pill', () => ['timer', 0.9])
        const r = await runAgent(ask('x'), h)
        assert.deepEqual(r.align.added, ['timer'])
        assert.deepEqual(r.blocks, ['timer'])
        // Its content is the person's own setting: nothing to look up, whatever Jev says about real data.
        const comp = compositionOf('pill')
        const needs = align.alignCandidates(comp)
        const result = new align.AlignResult()
        align.readAlignment(JSON.stringify({answers: Object.assign({real_data: {choice: 'true', confidence: 0.9}},
          Object.fromEntries(needs.map((_n, i) => ['need.' + i, {choice: 'note', confidence: 0.9}])))}), needs, result)
        align.applyAlignment(comp, result)
        assert.deepEqual(result.added, ['note']); assert.equal(comp.realData, false)
      } finally {
        align.setAlignWide(false)
      }
      assert.deepEqual(align.alignKinds(), plain)
      const {host: h2} = host('pill', () => ['timer', 0.9])
      const r2 = await runAgent(ask('x'), h2)
      assert.deepEqual(r2.blocks, [], 'timer is not in the plain pool')
    }
  } finally {
    align.setAlignEnabled(false)
  }
  // `--ps veraAlign 0` is off whatever the pool was.
  {
    const {host: h, seen} = host('pill', () => ['reminders', 0.9])
    align.setAlignWide(true)
    const r = await runAgent(ask('a daily medicine reminder'), h)
    assert.equal(seen.align.length, 0); assert.equal(r.align, null)
  }
  } finally {
    align.setAlignEnabled(true); align.setAlignWide(true)
  }
  console.log('align-agent-check: ok')
})().catch(e => { console.error(e); process.exit(1) })
