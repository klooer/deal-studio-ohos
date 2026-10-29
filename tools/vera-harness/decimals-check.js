// A sketch may say how many digits after the point a plain number is shown with (a list's number field, a value): one digit is the
// default and rounds a measurement into nonsense. Whole numbers from 0 to 6 only; anything else is the default.
'use strict'
const assert = require('node:assert/strict')
const {loadVera} = require('./source-loader')
const c = loadVera('VeraCompose')
const {compileVeraSource} = loadVera('VeraCompiler')
const {smokeRun} = loadVera('VeraSmoke')

const sketchOf = (fieldExtra, valueExtra = {}) => c.parseSketch(JSON.stringify({
  title: 'Places', eyebrow: 'PLACES', subtitle: 'Saved places',
  inputs: [], constants: [],
  list: {label: 'places', fields: [
    {id: 'name', label: 'Name', kind: 'text'},
    Object.assign({id: 'lat', label: 'Latitude', kind: 'number', measure: 'number'}, fieldExtra)]},
  values: [Object.assign({id: 'count', label: 'Places', means: 'how many places', format: 'plain', formula: 'entryCount', example: {given: {entryCount: 3}, result: 3}}, valueExtra)],
  events: [], ready: [], other: [], questions: []
}))
const programOf = sketch => {
  const comp = c.readComposition(JSON.stringify({answers: {theme: {choice: 'clean', confidence: 1}}}), sketch)
  assert.deepEqual(comp.unbound, [])
  const source = c.assembleProgram(comp)
  assert.equal(smokeRun(compileVeraSource(source)), '', 'the program runs')
  return source
}

// Asked for: the digits are the sketch's.
assert.match(programOf(sketchOf({decimals: 4})), /ui\.formatNumber\(e\.lat, 4\)/)
assert.match(programOf(sketchOf({decimals: 0})), /ui\.formatNumber\(e\.lat, 0\)/)
// Not asked for, or asked for nonsense: one digit, as before.
for (const bad of [{}, {decimals: 7}, {decimals: -1}, {decimals: 1.5}, {decimals: '3'}, {decimals: null}])
  assert.match(programOf(sketchOf(bad)), /ui\.formatNumber\(e\.lat, 1\)/, JSON.stringify(bad))
// Money and percent keep their own digits whatever is asked.
assert.match(programOf(sketchOf({measure: 'money', unit: '$', decimals: 5})), /ui\.formatNumber\(e\.lat, 2\)/)
assert.match(programOf(sketchOf({measure: 'percent', decimals: 5})), /ui\.formatNumber\(e\.lat, 1\) \+ "%"/)
// A count is whole unless asked.
assert.match(programOf(sketchOf({measure: 'count'})), /ui\.formatNumber\(e\.lat, 0\)/)
// A value: the figure's own digits, on a recorded plan whose formulas are bound (BMI: plain numbers).
{
  const fs = require('node:fs'), path = require('node:path')
  const fixture = file => fs.readFileSync(path.join(__dirname, 'compose', 'bmi', file), 'utf8')
  const withDecimals = decimals => {
    const raw = JSON.parse(fixture('sketch.json'))
    if (decimals !== undefined) raw.values.find(v => v.id === 'bmi').decimals = decimals
    const comp = c.readComposition(fixture('jev-answer.json'), c.parseSketch(JSON.stringify(raw)))
    assert.deepEqual(comp.unbound, [])
    return c.assembleProgram(comp)
  }
  const shown = source => source.split('\n').filter(l => /BMI/i.test(l) && /NumberStat|NumberListItem|formatNumber/.test(l)).join('\n')
  assert.match(shown(withDecimals(3)), /, 3\)/, shown(withDecimals(3)))
  assert.match(shown(withDecimals()), /, 1\)/, shown(withDecimals()))
  assert.doesNotMatch(shown(withDecimals(9)), /, 9\)/)
}
const parsed = sketchOf({decimals: 4}, {decimals: 2})
assert.equal(parsed.list.fields[1].decimals, 4); assert.equal(parsed.values[0].decimals, 2)
assert.equal(sketchOf({}).list.fields[1].decimals, -1)
// The plan is asked for them, in the schema, without an example drawn from a request.
const {NEEDS_PROMPT} = loadVera('NeedsPlan')
assert.match(NEEDS_PROMPT, /"decimals": for a plain number, how many digits after the point to show, 0 to 6/)
assert.doesNotMatch(NEEDS_PROMPT, /latitude|coordinate/i)
console.log('decimals-check: ok')
