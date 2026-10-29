// List parameters: expandListRows on good, partial and hostile answers, then fillSectionsContent with a
// canned model reply all the way through composeProgram and compileVeraSource. No network.
'use strict'
const assert = require('node:assert/strict')
const {loadVera} = require('./source-loader')
const {fragments} = loadVera('VeraTemplates')
const {expandListRows, fillSectionsContent} = loadVera('VeraTemplateContent')
const {composeProgram} = loadVera('VeraSectionCompose')
const {compileVeraSource} = loadVera('VeraCompiler')
const {deepseek} = loadVera('DeepSeekEngine')
// What GeneratePage does: the style slots come from Jev's answer, merged into the filled content.
function withSlots(kinds, instanceValues) {
  return kinds.map((kind, i) => {
    const merged = new Map(instanceValues[i])
    if (kind !== 'none') fragments().find(f => f.kind === kind).slots.forEach(sl => merged.set(sl.token, sl.values[0]))
    return merged
  })
}
const list = (kind, key) => fragments().find(f => f.kind === kind).listFields.find(l => l.key === key)

// --- expandListRows
const items = list('checklist', 'items')
let r = expandListRows([['Milk', '2 L'], ['Eggs', '12'], ['Bread']], items)
assert.equal(r.rows, 3); assert.equal(r.note, 'items=3')
assert.match(r.text, /label: "Milk", detail: "2 L", done: false/); assert.match(r.text, /label: "Bread", detail: "", done: false/)
r = expandListRows(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'], items)
assert.equal(r.rows, 8, 'cut to maxRows')
r = expandListRows([['x', 'y'], [], 5, null, ['  ', 'z']], items)
assert.equal(r.rows, 1); assert.match(r.note, /short/)
r = expandListRows('not a list', items); assert.match(r.note, /default\(bad shape\)/); assert.equal(r.rows, 3)
r = expandListRows(undefined, items); assert.match(r.note, /default\(missing\)/)
r = expandListRows([['He said "hi" \\ {1} __TOKEN__', '{0}']], items)
assert.doesNotMatch(r.text, /\{[01]\}/, 'braces cannot look like a placeholder'); assert.doesNotMatch(r.text, /__TOKEN__/)
assert.match(r.text, /\\"hi\\"/); assert.match(r.text, /\\\\/)
r = expandListRows([['a'.repeat(100), 'b'.repeat(100)]], items)
assert.ok(r.text.includes('"' + 'a'.repeat(28) + '"') && r.text.includes('"' + 'b'.repeat(20) + '"'), 'column caps')
const table = list('data_table', 'rows')
r = expandListRows([['W', 4, 2.5], ['G', '85', '$4']], table)
assert.equal(r.rows, 2); assert.match(r.text, /ui\.TableRow\("default", \["W", "4", "2\.5"\]\)/)

// --- through the model call, compose and compile
const reply = JSON.stringify({
  title: 'Trip day', section1_tl_title: 'Day plan',
  section1_steps: [['Breakfast', '08:00'], ['Museum', '10:00'], ['Lunch', '13:00'], ['Train', '16:30'], ['Dinner', '19:00']],
  section2_items: [['Passport', ''], ['Charger', 'USB-C'], ['Tickets', '2']],
})
deepseek.extractTemplateContent = async () => reply
;(async () => {
  const kinds = ['timeline', 'checklist']
  const filled = await fillSectionsContent(kinds, 'trip day', 'deepseek')
  assert.match(filled.note, /s1_steps=5/); assert.match(filled.note, /s2_items=3/)
  const globals = new Map([['__THEME__', 'clean'], ['__HEADER_STYLE__', 'default'], ['__BANNER_SECTION__', 'hide'], ['__TITLE__', 'Trip day']])
  const source = composeProgram(kinds, globals, withSlots(kinds, filled.instanceValues))
  assert.match(source, /"Museum", "", "10:00"/); assert.match(source, /label: "Charger", detail: "USB-C"/)
  compileVeraSource(source)
  // a model that answers nothing still yields a program that compiles
  deepseek.extractTemplateContent = async () => null
  const empty = await fillSectionsContent(['search_list', 'data_table', 'timeline', 'checklist'], 'x', 'deepseek')
  assert.match(empty.note, /no response/)
  compileVeraSource(composeProgram(['search_list', 'data_table', 'timeline', 'checklist'], globals, withSlots(['search_list', 'data_table', 'timeline', 'checklist'], empty.instanceValues)))
  // record_log's labels are people when the request has people settle costs, and categories when it asks for a breakdown: the
// hint says both ways (a "roommates split groceries and rent" screen once got groceries and rent as the people).
{
  const hint = loadVera('VeraTemplates').fragments().find(f => f.kind === 'record_log').listFields.find(l => l.key === 'labels').hint
  assert.match(hint, /people share or settle costs/); assert.match(hint, /Roommate 1/); assert.match(hint, /never the kinds of cost/)
  assert.match(hint, /breakdown by\s+category/)
}
console.log('template-content-check: ok')
})().catch(e => { console.error(e.diagnostics ? e.diagnostics.map(d => d.message).join('\n') : e); process.exit(1) })
