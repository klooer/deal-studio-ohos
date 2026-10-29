// The one plan format (ScreenPlan.ets): both ways of planning give a ScreenPlan, and the program is assembled from it.
// The blocks' pick (planFromBlocks) assembles to exactly what the blocks' composer gives; a sketch's composition
// (VeraCompose.ets's screenPlan) has a slot for everything the screen does, each naming what fills it, and an open slot
// for what nothing does yet. No network.
'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {loadVera} = require('./source-loader')
const c = loadVera('VeraCompose')
const P = loadVera('ScreenPlan')
const {composeProgram, specsOf} = loadVera('VeraSectionCompose')
const {fragments} = loadVera('VeraTemplates')
const {blockDefaults} = loadVera('VeraTemplateContent')
const {compileVeraSource} = loadVera('VeraCompiler')
const {smokeRun} = loadVera('VeraSmoke')

const fixture = (label, file) => fs.readFileSync(path.join(__dirname, 'compose', label, file), 'utf8')
const compositionOf = (label, widget = false) =>
  c.readComposition(fixture(label, 'jev-answer.json'), c.parseSketch(fixture(label, 'sketch.json')), widget)
const slot = (plan, id) => { const s = plan.slots.find(x => x.id === id); assert.ok(s, 'no slot ' + id + ' in\n' + P.describePlan(plan)); return s }
const kindOf = (plan, s) => plan.components[s.by].spec.kind

// The blocks' pick: one slot per chosen section, filled by it, with an empty place taking none, and the same program
// the blocks' composer makes, for every kind alone and every ordered pair.
{
  const globals = new Map([['__THEME__', 'playful'], ['__HEADER_STYLE__', 'compact'], ['__TITLE__', 'T']])
  const kinds = fragments().map(f => f.kind)
  let cases = 0
  for (const a of kinds) {
    for (const b of [null].concat(kinds)) {
      const chosen = b === null ? [a] : [a, 'none', b]
      const values = chosen.map(k => k === 'none' ? new Map() : blockDefaults(k))
      const plan = P.planFromBlocks('p', 'stack', specsOf(chosen), globals, values)
      assert.equal(P.assemblePlan(plan), composeProgram(chosen, globals, values), chosen.join('+'))
      assert.equal(plan.slots.length, b === null ? 1 : 2)
      assert.ok(plan.slots.every(s => s.fill === P.FILL_BLOCK && s.by >= 0))
      cases++
    }
  }
  assert.ok(cases > 100)
  // A layout's slot says which kinds may fill it; the blocks' ports are the plan's state.
  const md = P.planFromBlocks('p', 'master_detail', specsOf(['filter_box', 'master_list', 'detail_view']), globals,
    ['filter_box', 'master_list', 'detail_view'].map(k => blockDefaults(k)))
  assert.deepEqual(slot(md, 'master_list.2').accepts, ['master_list'])
  assert.ok(slot(md, 'master_list.2').writes.length > 0, P.describePlan(md))
  assert.ok(slot(md, 'detail_view.3').reads.some(n => slot(md, 'master_list.2').writes.includes(n)), P.describePlan(md))
  assert.ok(md.state.length > 0)
}

// A sketch's composition: every fixture Jev served is a plan with nothing open, assembled to the same program
// assembleProgram gives, which compiles and runs.
for (const label of fs.readdirSync(path.join(__dirname, 'compose'))) {
  for (const widget of [false, true]) {
    const comp = compositionOf(label, widget)
    if (comp.unbound.length > 0) continue
    const plan = c.screenPlan(comp)
    assert.equal(plan.origin, P.PLAN_FROM_SKETCH)
    assert.deepEqual(plan.open().map(s => s.id), comp.custom.map((_n, i) => 'custom.' + i), label)
    const source = P.assemblePlan(plan, true)
    assert.equal(source, c.assembleProgram(comp), label)
    assert.equal(smokeRun(compileVeraSource(source), false), '', label)
    // Every slot that is filled names a component of the plan.
    for (const s of plan.slots) if (s.fill !== P.FILL_OPEN) assert.ok(s.by >= 0 && s.by < plan.components.length, label + ' ' + s.id)
  }
}

// What fills what: the inputs and figures by the composer's parts, a phone action by its effect, a ready need by the
// section Jev chose for it.
{
  const tip = c.screenPlan(compositionOf('tip'))
  const inputs = tip.slots.filter(s => s.id.startsWith('input.'))
  assert.ok(inputs.length > 0 && inputs.every(s => s.fill === P.FILL_PART && kindOf(tip, s) === 'inputs'), P.describePlan(tip))
  const values = tip.slots.filter(s => s.id.startsWith('value.'))
  assert.ok(values.length > 0 && values.every(s => s.writes.length === 1 && s.reads.length > 0), P.describePlan(tip))
  assert.ok(tip.state.some(x => x.role === 'input') && tip.state.some(x => x.role === 'value'))

  const pill = c.screenPlan(compositionOf('pill-calendar'))
  const event = pill.slots.find(s => s.id.startsWith('event.'))
  assert.ok(event, P.describePlan(pill))
  assert.equal(event.fill, P.FILL_EFFECT)
  assert.equal(event.detail, 'calendar_add')
  assert.equal(kindOf(pill, event), 'effects')
  assert.ok(event.when.length > 0 && event.reads.length > 0, P.describePlan(pill))

  const beach = compositionOf('sections-beach')
  const plan = c.screenPlan(beach)
  const ready = slot(plan, 'ready.0')
  assert.equal(ready.fill, P.FILL_BLOCK)
  assert.equal(kindOf(plan, ready), beach.blocks[0])
}

// A need nothing ready does is an open slot until its section is written; the written section fills it.
{
  const comp = compositionOf('tip')
  comp.custom = ['round the tip up to a whole coin']
  const open = c.screenPlan(comp)
  assert.equal(slot(open, 'custom.0').fill, P.FILL_OPEN)
  assert.equal(P.assemblePlan(open), '')
  assert.notEqual(P.assemblePlan(open, true), '')
  const {parseSection} = loadVera('agent/AgentCustom')
  const section = parseSection('<classes>\n</classes>\n<fields>\nc_round: boolean = false\n</fields>\n<functions>\n' +
    'function c_flip(state: AppState, v: number): AppState {\n  return {c_round: !state.c_round__PASSTHROUGH__};\n}\n</functions>\n' +
    '<view>\nsections.push(ui.Section("content", "", "", [ui.Button("secondary", "Round up", "c_flip", 0, true)]));\n</view>')
  const filled = c.screenPlan(comp, [], section)
  assert.equal(slot(filled, 'custom.0').fill, P.FILL_HOLE)
  assert.equal(filled.components[slot(filled, 'custom.0').by].spec, section)
  assert.equal(P.assemblePlan(filled), c.assembleProgram(comp, [], section))
  // Anything unbound is open, and the plan is not served.
  comp.unbound = ['event "set an alarm": no effect']
  const refused = c.screenPlan(comp, [], section)
  assert.equal(slot(refused, 'unbound.0').fill, P.FILL_OPEN)
  assert.equal(P.assemblePlan(refused), '')
}

// What the plan leaves open is settled, not refused: a figure the countdown runs from that no formula works out becomes
// a number the person sets, starting from the plan's own example; the person's own to-dos become a section they fill.
{
  const c2 = loadVera('VeraCompose')
  const boil = compositionOf('default-boil')
  assert.deepEqual(boil.unbound, [])
  assert.ok(boil.defaulted.some(d => /set by you, starting at/.test(d)), boil.defaulted.join('; '))
  assert.ok(boil.inputs.some(i => boil.countdownFrom === i.id), boil.countdownFrom)
  assert.equal(smokeRun(compileVeraSource(c2.assembleProgram(boil))), '')
  const todos = compositionOf('own-todos')
  assert.deepEqual(todos.unbound, [])
  assert.ok(todos.custom.some(n => /the person's own: they add, change and remove them; the list starts empty/.test(n)))
  assert.deepEqual(c2.screenPlan(todos).toWrite().map(s => s.id), ['custom.0'])
}

console.log('plan-check: ok')
