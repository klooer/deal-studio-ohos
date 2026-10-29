// The composition record and structural edits: the record rebuilds the program it describes, every edit op produces a
// program that compiles and runs, bad edits are refused, and Jev's answer is read conservatively. No network.
'use strict'
const assert = require('node:assert/strict')
const {loadVera} = require('./source-loader')
const compose = loadVera('VeraSectionCompose')
const {deepseek} = loadVera('DeepSeekEngine')
const {settings} = loadVera('SettingsStore')
const C = loadVera('VeraComposition')
const T = loadVera('VeraTemplates')
const {compileVeraSource} = loadVera('VeraCompiler')
const {VirtualMachine, deserializeVbc2} = loadVera('VeraInterpreter')
const {UiHostEnvironment, decodeVeraUi} = loadVera('VeraUi')

settings.getSelectorKey = () => 'test-key'
settings.hasExaKey = () => false
const rowsAnswer = {title: 'Books', section2_items: [['Dune', 'Sand.'], ['Emma', 'Manners.'], ['Ulysses', 'Dublin.']], section1_items: [['Milk', '2 L'], ['Eggs', '12'], ['Bread', '']]}
const lower = 'return query.length() === 0 || strings.contains(strings.toLowerCase(label), strings.toLowerCase(query));'
deepseek.extractTemplateContent = async () => JSON.stringify(Object.assign({holes: {rowMatches2: lower}}, rowsAnswer))

function jev(sections, layout) {
  const answers = {}
  sections.forEach((k, i) => { answers['section' + (i + 1)] = {choice: k, confidence: 0.9} })
  if (layout) answers.__LAYOUT__ = {choice: layout, confidence: 0.9}
  for (const k of ['needs_integration', 'needs_real_data', 'needs_search_or_form', 'needs_live_ticking', 'needs_multiple_counters', 'needs_multiple_series', 'needs_logic']) answers['veto.' + k] = {noul: 0}
  return compose.readSectionPick(JSON.stringify({answers}))
}
// A record for the given kinds, the way the composer stores one: the master list carries the rule a model wrote for it.
const built = async (outcome) => {
  const c = new C.Composition()
  c.layout = outcome.layout || 'stack'; c.prompt = 'books'
  for (const s of outcome.sections.filter(x => x.kind !== 'none')) {
    const spec = T.fragments().find(f => f.kind === s.kind)
    const values = new Map()
    for (const f of spec.slots) values.set(f.token, f.values[0])
    for (const f of spec.contentFields) values.set(f.token, f.fallback)
    for (const f of spec.listFields) values.set(f.token, f.fallbackRows.map(r => r.reduce((t, v, i) => t.split('{' + i + '}').join(v), f.rowTemplate)).join(f.separator))
    const holes = new Map(); if (s.kind === 'master_list') holes.set('rowMatches', lower)
    c.blocks.push(new C.Block(s.kind, values, holes))
  }
  const source = C.composeFrom(c)
  return {action: 'template', layout: c.layout, composition: C.compositionToJson(c), source}
}
const runs = src => { const r = compileVeraSource(src); const vm = new VirtualMachine(deserializeVbc2(r.vbc2 !== undefined ? r.vbc2 : r), new UiHostEnvironment()); decodeVeraUi(vm.execute('view', [vm.execute('init')])); return vm }

;(async () => {
  // the record rebuilds what the pipeline built, holes and layout included
  let b = await built(jev(['filter_box', 'master_list', 'detail_view', 'none'], 'master_detail'))
  assert.equal(b.action, 'template'); assert.equal(b.layout, 'master_detail')
  let c = C.compositionFromJson(b.composition)
  assert.deepEqual(c.kinds(), ['filter_box', 'master_list', 'detail_view'])
  assert.equal(C.composeFrom(c), b.source)
  assert.match(b.source, /strings\.toLowerCase\(label\)/)
  assert.equal(C.compositionToJson(c), b.composition)
  assert.equal(C.compositionFromJson('nonsense'), null); assert.equal(C.compositionFromJson(''), null)
  assert.equal(C.compositionFromJson(b.composition.replace('master_list', 'no_such_kind')), null)

  // a one-block screen
  b = await built(jev(['checklist', 'none', 'none', 'none']))
  const check = C.compositionFromJson(b.composition)
  assert.deepEqual(check.kinds(), ['checklist']); assert.equal(C.composeFrom(check), b.source)

  const edit = (op, target = '', kind = '') => Object.assign(new C.CompositionEdit(), {op, target, kind})
  // add: a summary beside the checklist; both compile, the summary is wired to the checklist
  let next = C.applyEdit(check, edit(C.OP_ADD, '', 'list_summary'))
  assert.deepEqual(next.kinds(), ['checklist', 'list_summary']); runs(C.composeFrom(next))
  assert.match(C.composeFrom(next), /doneCount1\(state\)/)
  assert.equal(C.applyEdit(check, edit(C.OP_ADD, '', 'checklist')), null, 'a kind already there')
  assert.equal(C.applyEdit(check, edit(C.OP_ADD, '', 'nope')), null)
  // remove / replace / move
  assert.equal(C.applyEdit(check, edit(C.OP_REMOVE, 'checklist')), null, 'never the last block')
  let two = C.applyEdit(check, edit(C.OP_ADD, '', 'key_facts'))
  assert.deepEqual(C.applyEdit(two, edit(C.OP_REMOVE, 'checklist')).kinds(), ['key_facts'])
  assert.deepEqual(C.applyEdit(two, edit(C.OP_REPLACE, 'key_facts', 'metrics')).kinds(), ['checklist', 'metrics'])
  assert.deepEqual(C.applyEdit(two, edit(C.OP_TOP, 'key_facts')).kinds(), ['key_facts', 'checklist'])
  assert.deepEqual(C.applyEdit(two, edit(C.OP_BOTTOM, 'checklist')).kinds(), ['key_facts', 'checklist'])
  assert.equal(C.applyEdit(two, edit(C.OP_REMOVE, 'metrics')), null, 'not on the screen')
  for (const e of [edit(C.OP_TOP, 'checklist'), edit(C.OP_REPLACE, 'checklist', 'metrics')]) runs(C.composeFrom(C.applyEdit(two, e)))
  // at most six blocks
  let six = ['key_facts', 'metrics', 'note', 'rating', 'timer'].reduce((acc, k) => C.applyEdit(acc, edit(C.OP_ADD, '', k)), check)
  assert.equal(six.kinds().length, 6); assert.equal(C.applyEdit(six, edit(C.OP_ADD, '', 'spotlight')), null)
  // a layout: removing the detail drops the layout to the stack, holes of the kept blocks survive a move
  const md = C.compositionFromJson((await built(jev(['filter_box', 'master_list', 'detail_view'], 'master_detail'))).composition)
  const noDetail = C.applyEdit(md, edit(C.OP_REMOVE, 'detail_view'))
  assert.equal(noDetail.layout, 'stack'); assert.deepEqual(noDetail.kinds(), ['filter_box', 'master_list'])
  assert.equal(C.applyEdit(md, edit(C.OP_TOP, 'detail_view')), null, 'no moves inside a layout')
  const moved = C.applyEdit(noDetail, edit(C.OP_BOTTOM, 'filter_box'))
  assert.deepEqual(moved.kinds(), ['master_list', 'filter_box'])
  const movedSource = C.composeFrom(moved)
  assert.match(movedSource, /strings\.toLowerCase\(label\)/, 'the model-written rule moves with its block')
  assert.match(movedSource, /\/\/@hole rowMatches1 begin/, 'and its marker follows the new slot number')
  runs(movedSource)

  // reading Jev's answer
  const answer = (op, target, kind, conf = 0.9) => JSON.stringify({answers: {
    'edit.op': {choice: op, confidence: conf}, 'edit.target': {choice: target, confidence: conf}, 'edit.kind': {choice: kind, confidence: conf}}})
  let e = C.readEditAnswer(answer('add_block', 'none', 'list_summary'), check)
  assert.equal(e.op, 'add_block'); assert.equal(e.kind, 'list_summary'); assert.equal(e.target, '')
  e = C.readEditAnswer(answer('remove_block', 'checklist', 'none'), check)
  assert.equal(e.op, 'remove_block'); assert.equal(e.target, 'checklist')
  assert.equal(C.readEditAnswer(answer('add_block', 'none', 'list_summary', 0.3), check).op, 'none', 'unsure')
  assert.equal(C.readEditAnswer(answer('remove_block', 'metrics', 'none'), check).op, 'none', 'a target that is not on the screen')
  assert.equal(C.readEditAnswer(answer('replace_block', 'checklist', 'none'), check).op, 'none', 'replace with nothing')
  assert.equal(C.readEditAnswer(answer('none', 'checklist', 'metrics'), check).op, 'none')
  assert.equal(C.readEditAnswer('not json', check).op, 'none')
  const req = JSON.parse(C.buildEditRequest('add a summary', check))
  assert.deepEqual(Object.keys(req.questions), ['edit.op', 'edit.target', 'edit.kind'])
  assert.deepEqual(Object.keys(req.questions['edit.target'].criteria).sort(), ['checklist', 'none'])

  // end to end with a stub selector: the added block gets its own text, the screen rebuilds, a "none" falls through
  let asked = 0
  deepseek.extractTemplateContent = async () => { asked++; return JSON.stringify({section1_done_label: 'Ticked', section1_total_label: 'All', section1_left_label: 'To go'}) }
  let r = await C.editComposition('show how many are done', check, 'deepseek', async () => e = C.readEditAnswer(answer('add_block', 'none', 'list_summary'), check))
  assert.equal(r.applied, true); assert.equal(asked, 1); assert.match(r.source, /"Ticked"/); assert.ok(r.vbc2.length > 0)
  assert.deepEqual(r.composition.kinds(), ['checklist', 'list_summary'])
  r = await C.editComposition('make the items shorter', check, 'deepseek', async () => C.readEditAnswer(answer('none', 'none', 'none'), check))
  assert.equal(r.applied, false); assert.equal(r.source, '')
  r = await C.editComposition('x', check, 'deepseek', async () => { throw Error('selector down') })
  assert.equal(r.applied, false); assert.match(r.note, /selector down/)
  r = await C.editComposition('remove the list', check, 'deepseek', async () => C.readEditAnswer(answer('remove_block', 'checklist', 'none'), check))
  assert.equal(r.applied, false, 'the last block stays: the model refines instead')
  console.log('composition-check ok')
})().catch(e => { console.error(e); process.exit(1) })
