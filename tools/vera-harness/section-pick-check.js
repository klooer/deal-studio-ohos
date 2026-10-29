// readSectionPick against hand-built Jev answers: soft vetoes keep the sections and set needsLogic,
// a hard veto still drops them, a repeated kind is dropped. No network.
'use strict'
const assert = require('node:assert/strict')
const {loadVera} = require('./source-loader')
const {readSectionPick} = loadVera('VeraSectionCompose')
function body(sections, vetoes) {
  const answers = {}
  sections.forEach((k, i) => { answers['section' + (i + 1)] = {choice: k, confidence: 0.9} })
  const keys = ['needs_integration', 'needs_real_data', 'needs_search_or_form', 'needs_live_ticking', 'needs_multiple_counters', 'needs_multiple_series', 'needs_logic']
  keys.forEach(k => { answers['veto.' + k] = {noul: vetoes[k] === undefined ? 0 : vetoes[k]} })
  return JSON.stringify({answers})
}
const SLOTS = 6
const pad = a => a.concat(Array(SLOTS - a.length).fill('none'))
const kinds = o => o.sections ? o.sections.map(s => s.kind) : null
let o = readSectionPick(body(['checklist', 'checklist'], {}))
assert.deepEqual(kinds(o), pad(['checklist', 'none'])); assert.equal(o.needsLogic, false); assert.match(o.note, /duplicate checklist/)
o = readSectionPick(body(['checklist', 'none'], {needs_logic: 0.85}))
assert.deepEqual(kinds(o), pad(['checklist', 'none'])); assert.equal(o.needsLogic, true); assert.match(o.note, /logic=needs_logic=0\.85/)
o = readSectionPick(body(['checklist', 'none'], {needs_search_or_form: 0.9}))
assert.equal(o.needsLogic, true)
o = readSectionPick(body(['checklist', 'none'], {needs_logic: 0.75}))
assert.equal(o.needsLogic, false)
o = readSectionPick(body(['checklist', 'none'], {needs_search_or_form: 0.65}))
assert.equal(o.needsLogic, false); assert.equal(o.sections !== null, true)
o = readSectionPick(body(['checklist', 'none'], {needs_integration: 0.6}))
assert.equal(o.needsLogic, true)
o = readSectionPick(body(['checklist', 'none'], {needs_integration: 0.95}))
assert.equal(o.sections, null); assert.match(o.note, /vetoed needs_integration=0\.95/)
o = readSectionPick(body(['none', 'none'], {needs_logic: 0.85}))
assert.equal(o.sections, null)
o = readSectionPick(body(['checklist', 'none'], {needs_real_data: 0.9}))
assert.equal(o.needsRealData, true); assert.equal(o.needsLogic, false)
o = readSectionPick(body(['search_list', 'none'], {needs_search_or_form: 0.95}))
assert.deepEqual(kinds(o), pad(['search_list', 'none'])); assert.equal(o.needsLogic, false)
o = readSectionPick(body(['search_list', 'none'], {needs_search_or_form: 0.95, needs_logic: 0.9}))
assert.equal(o.needsLogic, true); assert.doesNotMatch(o.note, /needs_search_or_form/)
o = readSectionPick(body(['record_log', 'bar_chart', 'checklist', 'timeline'], {}))
assert.deepEqual(kinds(o), pad(['record_log', 'bar_chart', 'checklist', 'timeline'])); assert.equal(o.needsLogic, false)
// layouts: master_detail puts the list first and the detail second whatever order Jev gave
const withLayout = (sections, layout, conf = 0.9) => {
  const b = JSON.parse(body(sections, {}))
  b.answers.__LAYOUT__ = {choice: layout, confidence: conf}
  return JSON.stringify(b)
}
o = readSectionPick(withLayout(['detail_view', 'metrics', 'master_list', 'none'], 'master_detail'))
assert.deepEqual(kinds(o), ['master_list', 'detail_view', 'metrics']); assert.equal(o.layout, 'master_detail')
// a required slot empty but a free section left: the detail is added after the list
o = readSectionPick(withLayout(['master_list', 'metrics', 'none', 'none'], 'master_detail'))
assert.deepEqual(kinds(o), ['master_list', 'detail_view', 'metrics']); assert.equal(o.layout, 'master_detail')
// too many in 'extra' (max 2): rejected
o = readSectionPick(withLayout(['master_list', 'detail_view', 'metrics', 'timer'], 'master_detail'))
assert.equal(o.layout, 'master_detail')
o = readSectionPick(withLayout(['master_list', 'detail_view', 'metrics', 'timer'], 'master_detail', 0.1))
assert.equal(o.layout, 'stack')   // below the confidence bar: no layout
o = readSectionPick(withLayout(['checklist', 'none', 'none', 'none'], 'none'))
assert.equal(o.layout, 'stack')
// Jev named the layout but answered master_list twice: the missing detail_view is filled in
o = readSectionPick(withLayout(['master_list', 'master_list', 'none', 'none'], 'master_detail'))
assert.deepEqual(kinds(o), ['master_list', 'detail_view']); assert.equal(o.layout, 'master_detail'); assert.match(o.note, /\+detail_view/)
// no empty section left to put it in: rejected, as before
o = readSectionPick(withLayout(['master_list', 'metrics', 'timer', 'checklist'], 'master_detail'))
assert.equal(o.layout, 'stack')
o = readSectionPick(withLayout(['checklist', 'none', 'none', 'none'], 'progress_list'))
assert.deepEqual(kinds(o), ['checklist']); assert.equal(o.layout, 'progress_list', 'the layout only orders; the summary comes when it is asked for')
o = readSectionPick(body(['filter_box', 'master_list', 'detail_view', 'none'], {needs_search_or_form: 0.95}))
assert.equal(o.needsLogic, false, 'a filter box is the search the veto asks for')
// search_list picked on its own, then a master_detail layout: the search becomes the filter wired to the list
o = readSectionPick(withLayout(['search_list', 'none', 'none', 'none'], 'master_detail'))
assert.deepEqual(kinds(o), ['filter_box', 'master_list', 'detail_view']); assert.equal(o.layout, 'master_detail')
assert.equal(o.needsLogic, false)
// log_report: the blocks of the shared-costs example, the vetoes its blocks cover, and the one they do not
// several data series on one chart: a trend_chart draws one line, so the model finishes it (a soft veto, floored at 0.7)
o = readSectionPick(body(['trend_chart', 'none'], {needs_multiple_series: 0.9}))
assert.deepEqual(kinds(o), pad(['trend_chart', 'none'])); assert.equal(o.needsLogic, true); assert.match(o.note, /needs_multiple_series=0\.9/)
o = readSectionPick(body(['trend_chart', 'none'], {needs_multiple_series: 0.6}))
assert.equal(o.needsLogic, false, 'below the floor the single line stands')
const LOG = ['record_log', 'number_strip', 'breakdown_table', 'series_chart', 'settle_up']
const withVetoes = (sections, layout, vetoes) => {
  const b = JSON.parse(body(sections, vetoes))
  if (layout) b.answers.__LAYOUT__ = {choice: layout, confidence: 0.9}
  return JSON.stringify(b)
}
const costs = {needs_logic: 0.99, needs_search_or_form: 0.94, needs_multiple_counters: 0.9}
o = readSectionPick(withVetoes(['settle_up', 'series_chart', 'record_log', 'number_strip', 'breakdown_table'], 'log_report', costs))
assert.deepEqual(kinds(o), ['record_log', 'number_strip', 'series_chart', 'breakdown_table', 'settle_up'], 'by slot; inside a slot, Jev\'s order'); assert.equal(o.layout, 'log_report'); assert.equal(o.needsLogic, false, 'the blocks cover the logic, the form and the counters')
o = readSectionPick(withVetoes(['settle_up', 'none'], 'log_report', costs))
assert.deepEqual(kinds(o), ['record_log', 'settle_up']); assert.match(o.note, /\+record_log/)
o = readSectionPick(withVetoes(['record_log', 'bar_chart'], '', Object.assign({needs_live_ticking: 0.9}, costs)))
assert.equal(o.needsLogic, true); assert.match(o.note, /needs_live_ticking/); assert.doesNotMatch(o.note, /needs_logic/)
o = readSectionPick(withVetoes(['checklist', 'none'], '', {needs_logic: 0.99}))
assert.equal(o.needsLogic, true, 'a block that covers nothing leaves the veto in force')
// independent "does the request ask for this part" answers, applied once a layout is chosen
const withIncludes = (sections, layout, includes, vetoes = {}) => {
  const b = JSON.parse(body(sections, vetoes))
  if (layout) b.answers.__LAYOUT__ = {choice: layout, confidence: 1}
  for (const [k, v] of Object.entries(includes)) b.answers['include.' + k] = {noul: v}
  return JSON.stringify(b)
}
o = readSectionPick(withIncludes(['record_log', 'none', 'none'], 'log_report', {record_log: 0.9, number_strip: 0.8, breakdown_table: 0.7, series_chart: 0.7, settle_up: 0.95, master_list: 0.1, detail_view: 0.05}, costs))
assert.deepEqual(kinds(o), ['record_log', 'number_strip', 'breakdown_table', 'series_chart', 'settle_up'], 'low section confidence no longer loses the parts the request asks for')
assert.equal(o.layout, 'log_report'); assert.equal(o.needsLogic, false)
o = readSectionPick(withIncludes(['none', 'none'], 'log_report', {record_log: 0.9, settle_up: 0.3, series_chart: 0.64}))
assert.deepEqual(kinds(o), ['record_log'], 'below the bar they are not added')
o = readSectionPick(withIncludes(['checklist', 'none'], '', {settle_up: 0.99}))
assert.deepEqual(kinds(o), pad(['checklist']), 'no layout, no include answers read')
o = readSectionPick(withIncludes(['record_log', 'settle_up', 'none'], 'log_report', {settle_up: 0.9}))
assert.deepEqual(kinds(o), ['record_log', 'settle_up'], 'a part Jev already put in a section is not added twice')
// a slot that changes what a block shows needs a surer answer than a cosmetic one
{
  const slotAnswer = noul => { const b = JSON.parse(body(['number_strip', 'none'], {})); b.answers['section1.number_strip.show_count'] = {noul}; b.answers['section1.bar_chart.bar_style'] = {choice: 'accent', confidence: 0.3}; return JSON.stringify(b) }
  o = readSectionPick(slotAnswer(0.4)); assert.equal(o.sections[0].slotValues.get('__SHOW_COUNT_IDX__'), 'false')
  o = readSectionPick(slotAnswer(0.7)); assert.equal(o.sections[0].slotValues.get('__SHOW_COUNT_IDX__'), 'true')
}
// itinerary_day: a hard integration veto is decided after the blocks are known
{
  const day = (slots, vetoes, sections = ['none', 'none']) => {
    const b = JSON.parse(body(sections, vetoes))
    b.answers.__LAYOUT__ = {choice: 'itinerary_day', confidence: 1}
    b.answers['include.itinerary'] = {noul: 0.9}; b.answers['include.progress_line'] = {noul: 0.8}
    for (const [k, v] of Object.entries(slots)) b.answers['section1.itinerary.' + k] = {noul: v}
    return JSON.stringify(b)
  }
  o = readSectionPick(day({navigate: 0.9, calendar: 0.9}, {needs_integration: 0.97, needs_logic: 0.9, needs_real_data: 0.6}))
  assert.deepEqual(kinds(o), ['itinerary', 'progress_line']); assert.equal(o.layout, 'itinerary_day')
  assert.equal(o.needsLogic, false, 'integration and logic are covered'); assert.equal(o.needsRealData, true)
  assert.equal(o.sections[0].slotValues.get('__NAVIGATE_IDX__'), 'true')
  o = readSectionPick(day({navigate: 0.1, calendar: 0.3}, {needs_integration: 0.97}))
  assert.equal(o.sections, null); assert.match(o.note, /vetoed needs_integration=0\.97/, 'the actions it was asked for are off: not covered')
  o = readSectionPick(day({calendar: 0.7}, {needs_integration: 0.95}))
  assert.deepEqual(kinds(o), ['itinerary', 'progress_line'], 'one switched-on action covers the veto')
  o = readSectionPick(withVetoes(['checklist', 'none'], '', {needs_integration: 0.97}))
  assert.equal(o.sections, null, 'a request no block covers (camera, video call) stays rejected')
  o = readSectionPick(day({}, {}, ['itinerary', 'none']))
  assert.deepEqual(kinds(o), ['itinerary', 'progress_line'], 'a section pick and an include do not duplicate')
}
// two readers compete for the one progress slot: the likelier is kept and the layout is not rejected for it
o = readSectionPick(withIncludes(['none', 'none'], 'itinerary_day', {itinerary: 0.97, progress_line: 0.8, list_summary: 0.96}))
assert.deepEqual(kinds(o), ['itinerary', 'list_summary']); assert.equal(o.layout, 'itinerary_day')
o = readSectionPick(withIncludes(['none', 'none'], 'itinerary_day', {itinerary: 0.97, progress_line: 0.96, list_summary: 0.8}))
assert.deepEqual(kinds(o), ['itinerary', 'progress_line'], 'order follows the layout, not the order of the answers')
// what the phone answered for a plain "Grocery list app": a weak layout and weak includes must change nothing
{
  const b = JSON.parse(body(['checklist', 'checklist', 'none', 'none', 'none', 'none'], {}))
  b.answers.__LAYOUT__ = {choice: 'progress_list', confidence: 0.68}
  for (const [k, v] of Object.entries({filter_box: 0.23, master_list: 0.46, detail_view: 0.2, record_log: 0.09, number_strip: 0.08, progress_line: 0.16, list_summary: 0.23, checklist: 0.68})) b.answers['include.' + k] = {noul: v}
  o = readSectionPick(JSON.stringify(b))
  assert.deepEqual(kinds(o), pad(['checklist'])); assert.equal(o.layout, 'stack'); assert.equal(o.needsLogic, false)
  b.answers.__LAYOUT__ = {choice: 'progress_list', confidence: 1}
  b.answers['include.list_summary'] = {noul: 0.9}
  o = readSectionPick(JSON.stringify(b))
  assert.deepEqual(kinds(o), ['list_summary', 'checklist'], 'asked for with a sure layout: the summary comes')
}
const {arrangeInLayout} = loadVera('VeraLayouts')
assert.equal(arrangeInLayout('master_detail', ['master_list', 'detail_view', 'a', 'b', 'c']), null)   // 3 extras > max 2
assert.equal(arrangeInLayout('nope', ['master_list']), null)
assert.deepEqual(arrangeInLayout('master_detail', ['none', 'detail_view', 'master_list']), [2, 1])

// A top choice under the bar is kept when it covers a veto that fired: two answers agree on what the request needs.
// Without the veto, or for a kind that does not cover it, the bar stands.
function low(kind, confidence, vetoes) {
  const b = JSON.parse(body([], vetoes)); b.answers.section1 = {choice: kind, confidence}
  for (let i = 2; i <= SLOTS; i++) b.answers['section' + i] = {choice: 'none', confidence: 0.6}
  return readSectionPick(JSON.stringify(b))
}
o = low('intent_panel', 0.35, {needs_integration: 0.95})
assert.deepEqual(kinds(o), pad(['intent_panel'])); assert.match(o.note, /section1=intent_panel\(covers needs_integration\)/)
o = low('intent_panel', 0.35, {needs_integration: 0.6})
assert.deepEqual(kinds(o), pad(['intent_panel'])); assert.equal(o.needsLogic, false)
assert.equal(low('intent_panel', 0.35, {}).sections, null)
assert.equal(low('intent_panel', 0.2, {needs_integration: 0.95}).sections, null)
assert.equal(low('checklist', 0.35, {needs_integration: 0.95}).sections, null)
assert.equal(low('search_list', 0.35, {needs_search_or_form: 0.6}).sections, null, 'a veto under its bar did not fire')
// A weak pick whose ports connect to nothing on the screen is dropped: a reader would show its fallbacks, a writer
// would publish to nobody. Live host runs served these three alone as finished templates.
assert.equal(low('number_strip', 0.35, {needs_logic: 0.99}).sections, null, 'tip calculator: totals of no records')
assert.equal(low('breakdown_table', 0.35, {needs_logic: 0.99}).sections, null, 'demo-5: a breakdown of no records')
assert.equal(low('filter_box', 0.35, {needs_search_or_form: 0.95}).sections, null, 'inventory-search: a filter of no list')
{
  const weakWith = (weak, strong, layout, vetoes) => {
    const b = JSON.parse(body(['none'].concat(strong), vetoes)); b.answers.section1 = {choice: weak, confidence: 0.35}
    if (layout) b.answers.__LAYOUT__ = {choice: layout, confidence: 0.9}
    return readSectionPick(JSON.stringify(b))
  }
  o = weakWith('number_strip', ['metrics'], '', {needs_logic: 0.99})
  assert.deepEqual(kinds(o), pad(['none', 'metrics'])); assert.equal(o.needsLogic, true, 'the dropped pick no longer covers the veto')
  assert.match(o.note, /section1=none\(number_strip has no partner\)/)
  o = weakWith('number_strip', ['record_log'], '', costs)
  assert.deepEqual(kinds(o), pad(['number_strip', 'record_log']), 'its writer is on the screen: kept')
  o = weakWith('settle_up', ['none'], 'log_report', costs)
  assert.deepEqual(kinds(o), ['record_log', 'settle_up'], 'the layout brings the partner: kept')
  o = weakWith('filter_box', ['none'], 'master_detail', {needs_search_or_form: 0.95})
  assert.deepEqual(kinds(o), ['filter_box', 'master_list', 'detail_view'])
}

// Only an answer about the service pauses the selector: not this request's own (a 400, a 401), but a throttle, a region refusal or a server error.
{
  const {pausesSelector} = loadVera('VeraSectionCompose')
  for (const code of [429, 451, 500, 502, 503]) assert.equal(pausesSelector(code), true, String(code))
  for (const code of [400, 401, 403, 404, 422]) assert.equal(pausesSelector(code), false, String(code))
}
// a failed call to Jev is not repeated for a minute: the first pays the timeout, the next ones go straight on
{
  const real = loadVera('VeraSectionCompose')
  ;(async () => {
    const first = await real.selectSections('grocery', 'key')
    assert.match(first.note, /^none \(selector unreachable\)$/)
    const second = await real.selectSections('grocery', 'key')
    assert.match(second.note, /not asked again for a minute/)
  })().catch(e => { console.error(e); process.exit(1) })
}
// The slots of sections chosen elsewhere are asked on their own and read the same way; unreadable answers are the defaults.
{
  const {buildSlotRequest, readSlotValues} = loadVera('VeraSectionCompose')
  const body = JSON.parse(buildSlotRequest('a layover with directions', ['itinerary']))
  const keys = Object.keys(body.questions)
  assert.ok(keys.includes('section1.itinerary.navigate') && keys.includes('section1.itinerary.calendar'), keys.join(' '))
  assert.equal(body.state, 'a layover with directions')
  const yes = {answers: {'section1.itinerary.navigate': {noul: 0.9}, 'section1.itinerary.calendar': {noul: 0.2}}}
  const read = readSlotValues(JSON.stringify(yes), ['itinerary'])[0]
  assert.equal(read.get('__NAVIGATE_IDX__'), 'true'); assert.equal(read.get('__CALENDAR_IDX__'), 'false')
  assert.equal(readSlotValues('not json', ['itinerary'])[0].get('__NAVIGATE_IDX__'), 'false')
}
console.log('section-pick-check: ok')
