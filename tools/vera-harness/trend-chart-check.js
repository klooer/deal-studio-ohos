// trend_chart in the real VM: a line of as many points as the request gives (2 to 12), each a label and a plain number,
// fractions and a thousands separator kept. No fixed four slots to pad with zeros or junk, and no canned banner.
'use strict'
const assert = require('node:assert/strict')
const {loadVera} = require('./source-loader')
const {fragments} = loadVera('VeraTemplates')
const {expandListRows} = loadVera('VeraTemplateContent')
const {composeProgram} = loadVera('VeraSectionCompose')
const {compileVeraSource} = loadVera('VeraCompiler')
const {VirtualMachine, deserializeVbc2} = loadVera('VeraInterpreter')
const {UiHostEnvironment, decodeVeraUi} = loadVera('VeraUi')
const globals = new Map([['__THEME__', 'clean'], ['__HEADER_STYLE__', 'default'], ['__BANNER_SECTION__', 'hide'], ['__TITLE__', 'Check']])
const spec = fragments().find(f => f.kind === 'trend_chart')
const points = spec.listFields.find(l => l.key === 'points')
function chart(raw) {
  const m = new Map()
  spec.slots.forEach(s => m.set(s.token, s.values[0]))
  spec.contentFields.forEach(c => m.set(c.token, c.fallback))
  m.set(points.token, expandListRows(raw, points).text)
  const r = compileVeraSource(composeProgram(['trend_chart'], globals, [m]))
  const vm = new VirtualMachine(deserializeVbc2(r.vbc2 !== undefined ? r.vbc2 : r), new UiHostEnvironment())
  const out = []
  const walk = n => { out.push(n); (n.children || []).forEach(walk) }
  walk(decodeVeraUi(vm.execute('view', [vm.execute('init')]))[0])
  return out
}
const spark = nodes => nodes.find(n => n.kind === 'sparkline')
let s = spark(chart([['1896', '167'], ['1996', '176.5']]))
assert.ok(s, 'a sparkline is drawn')
assert.deepEqual(s.series, [167, 176.5], 'the fraction is kept, and only the two points given are drawn')
assert.deepEqual(s.categories, ['1896', '1996'])
assert.ok(s.maximum > 176.5 && s.minimum < 167 && s.minimum > 150, 'room above and below the data: ' + s.minimum + '..' + s.maximum)
s = spark(chart([['1950', 102700000], ['1980', '139,000,000'], ['2000', '146.6 million'], ['2020', 144104100]]))
assert.deepEqual(s.series, [102700000, 139000000, 146.6, 144104100], 'big numbers are not cut to six digits; a comma is dropped; a unit is ignored')
s = spark(chart([['a', '-3'], ['b', '4'], ['c', 'x']]))
assert.deepEqual(s.series, [-3, 4, 0], 'a negative number is kept, no number at all is 0')
assert.equal(s.minimum < -3, true)
s = spark(chart(Array.from({length: 20}, (_, i) => ['p' + i, String(i)])))
assert.equal(s.series.length, 12, 'cut to 12 points')
s = spark(chart(undefined))
assert.deepEqual(s.series, [1, 2], 'no usable list: the default two points, drawn')
assert.match(expandListRows(undefined, points).note, /default\(missing\)/, 'and the note says it was defaulted')
assert.doesNotMatch(JSON.stringify(chart([['a', '1'], ['b', '2']])), /Demo banner|canned template/)
console.log('trend-chart-check ok')
