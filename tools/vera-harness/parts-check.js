// One format for both builders: VeraCompose.ets's compositions as blocks (compositionParts) through the blocks' composer
// (composeFragments, VeraSectionCompose.ets), the __PASSTHROUGH__ rule that lets a part set another part's field, and
// a composed screen next to catalogue blocks (VeraTemplates.ets) in one program. No network.
'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {loadVera} = require('./source-loader')
const c = loadVera('VeraCompose')
const {composeFragments} = loadVera('VeraSectionCompose')
const {fragments, FragmentSpec, StateFieldSpec} = loadVera('VeraTemplates')
const {expandListRows} = loadVera('VeraTemplateContent')
const {compileVeraSource} = loadVera('VeraCompiler')
const {smokeRun} = loadVera('VeraSmoke')

const fixture = (label, file) => fs.readFileSync(path.join(__dirname, 'compose', label, file), 'utf8')
const compositionOf = (label, widget = false) => {
  const sketch = c.parseSketch(fixture(label, 'sketch.json'))
  return c.readComposition(fixture(label, 'jev-answer.json'), sketch, widget)
}
// A screen with a slot still open has nothing on it until the section is written: it runs, and draws what it has.
const runs = source => { const compiled = compileVeraSource(source); assert.equal(smokeRun(compiled, false), ''); return compiled }

// __PASSTHROUGH__ fills in every field the literal does not set, at the literal's own level: a nested literal's keys,
// a key inside a string and a key in a comment do not count.
{
  const spec = (kind, fields, functions) => {
    const s = new FragmentSpec(kind, '', '', fields.map(([n, t]) => new StateFieldSpec(n, t)), '', fields.map(([n, , v]) => n + ': ' + v).join(', '),
      functions, '{ sections.push(ui.Text("body", "x")); }', [], [])
    s.indexed = false
    return s
  }
  const a = spec('a', [['count', 'number', '0'], ['label', 'string', '"a"']],
    'function bump(state: AppState, v: number): AppState {\n  // flag: not a key\n  let t: string = "{flag: 1}";\n  return {count: state.count + 1, flag: true__PASSTHROUGH__};\n}')
  const b = spec('b', [['flag', 'boolean', 'false']], 'function flip(state: AppState, v: number): AppState {\n  return {flag: !state.flag__PASSTHROUGH__};\n}')
  const source = composeFragments([a, b], new Map([['__HEADER_STYLE__', 'none']]), [new Map(), new Map()])
  assert.match(source, /return \{count: state\.count \+ 1, flag: true, label: state\.label\};/)
  assert.match(source, /return \{flag: !state\.flag, count: state\.count, label: state\.label\};/)
  // A comma written before the token is the passthrough's own, not a second one.
  const c2 = spec('c2', [['note', 'string', '""']], 'function clear(state: AppState, v: number): AppState {\n  return {note: "", __PASSTHROUGH__};\n}')
  const withComma = composeFragments([a, b, c2], new Map([['__HEADER_STYLE__', 'none']]), [new Map(), new Map(), new Map()])
  assert.match(withComma, /return \{note: "", count: state\.count, label: state\.label, flag: state\.flag\};/)
  runs(withComma)
  // A literal that sets nothing keeps the whole state.
  const c3 = spec('c3', [['seen', 'boolean', 'false']], 'function keep(state: AppState, v: number): AppState {\n  return {__PASSTHROUGH__};\n}')
  const keeps = composeFragments([b, c3], new Map([['__HEADER_STYLE__', 'none']]), [new Map(), new Map()])
  assert.match(keeps, /return \{flag: state\.flag, seen: state\.seen\};/)
  runs(keeps)
  assert.doesNotMatch(source, /ui\.Header/)
  runs(source)
}

// A composition is blocks of its own, never renamed, assembled by the blocks' composer.
for (const label of fs.readdirSync(path.join(__dirname, 'compose'))) {
  for (const widget of [false, true]) {
    const comp = compositionOf(label, widget)
    if (comp.unbound.length) continue
    const parts = c.compositionParts(comp)
    assert.ok(parts.every(p => p.indexed === false), label)
    assert.equal(parts.some(p => p.kind === 'widget'), widget, label)
    const source = c.assembleProgram(comp)
    assert.equal(source.includes('ui.Header('), !widget, label)
    runs(source)
  }
}

// Parts publish what they hold as ports (name and type, as a catalogue block's do), so a section that reads a name finds it
// without being told: what the person sets and the list's entries and count always; the figures only when a section on the
// screen reads a port, as functions of the state (they are locals of view() otherwise).
{
  const tip = compositionOf('tip')
  const published = comp => c.compositionParts(comp).flatMap(p => p.ports.map(x => [p.kind, x.dir, x.name, x.type]))
  assert.deepEqual(published(tip).map(x => x.join(':')), ['inputs:writes:tipPercent:number', 'inputs:writes:people:number'])
  assert.ok(!/function port_/.test(c.assembleProgram(tip)), 'no section reads: no figure functions')
  assert.deepEqual(published(compositionOf('expenses')).map(x => x.join(':')),
    ['list:writes:entries:LogEntry[]', 'list:writes:count:number'])
  assert.ok(published(compositionOf('pill')).some(x => x.join(':') === 'inputs:writes:repeatsDaily:boolean'))
  // A choice is its option's index and typed digits are text: neither is published as a number under the input's name.
  assert.ok(!published(compositionOf('bmi')).some(x => x[2] === 'heightSquared'))

  // A value named like a port number_strip reads: the section is bound to the part's figure, and the program runs.
  const rename = text => text.split('perPerson').join('average')
  const sketch = c.parseSketch(rename(fixture('tip', 'sketch.json')))
  const comp = c.readComposition(rename(fixture('tip', 'jev-answer.json')), sketch, false)
  comp.blocks.push('number_strip')
  const source = c.assembleProgram(comp)
  assert.match(source, /function port_average\(state: AppState\): number \{/)
  assert.match(source, /ui\.NumberStat\("default", "Average", port_average\(state\), cur,/)
  // A name nothing publishes keeps the section's own fallback.
  assert.match(source, /ui\.NumberStat\("accent", "Total", 0, cur,/)
  runs(source)
  const plan = c.screenPlan(comp)
  assert.ok(plan.components.some(x => x.spec && x.spec.kind === 'figures' && x.spec.ports.some(q => q.name === 'average')))
}

// A total of minutes over the list's entries is a number with its unit, not a time: 150 min, not 2:30:00 (nor 0:00 when empty).
{
  const sketch = JSON.parse(fixture('expenses', 'sketch.json'))
  sketch.values[0].format = 'minutes'; sketch.values[0].unit = ''; sketch.list.measure = 'minutes'; sketch.list.unit = ''
  const comp = c.readComposition(fixture('expenses', 'jev-answer.json'), c.parseSketch(JSON.stringify(sketch)))
  const source = c.assembleProgram(comp)
  assert.match(source, /ui\.NumberStat\("default", "[^"]*", totalSpent, "", " min", 1, "", "chart", 0\)/)
  assert.doesNotMatch(source, /durationToString/)
  assert.match(source, /ui\.formatNumber\(e\.amount, 0\) \+ " min"/, 'the entries too: 30 min, not 30:00')
  runs(source)
  // The same number from a countdown stays a time: it is on a clock.
  const egg = compositionOf('egg')
  assert.match(c.assembleProgram(egg), /durationToString/)
}

// Next to catalogue blocks: a composed screen with each block in one program, then with a checklist and a note, each
// keeping its own state -- their names and ours never meet: our view is one block, as each of theirs is.
{
  const defaults = kind => {
    const spec = fragments().find(f => f.kind === kind)
    const values = new Map()
    spec.slots.forEach(s => values.set(s.token, s.values[0]))
    spec.contentFields.forEach(f => values.set(f.token, f.fallback))
    spec.listFields.forEach(l => values.set(l.token, expandListRows(undefined, l).text))
    return values
  }
  for (const label of fs.readdirSync(path.join(__dirname, 'compose'))) {
    const comp = compositionOf(label)
    if (comp.unbound.length) continue
    const parts = c.compositionParts(comp)
    for (const block of fragments()) {
      try { compileVeraSource(composeFragments(parts.concat([block]), new Map(), parts.map(() => new Map()).concat([defaults(block.kind)]))) }
      catch (e) { assert.fail(label + ' + ' + block.kind + ': ' + (e.diagnostics ? e.diagnostics[0].message : e.message)) }
    }
  }
  for (const label of ['tip', 'egg', 'expenses', 'pill']) {
    const parts = c.compositionParts(compositionOf(label))
    const blocks = ['checklist', 'note'].map(k => fragments().find(f => f.kind === k))
    const specs = parts.concat(blocks)
    const values = parts.map(() => new Map()).concat(['checklist', 'note'].map(defaults))
    const source = composeFragments(specs, new Map([['__TITLE__', 'Mixed']]), values)
    const compiled = runs(source)
    assert.ok(compiled.handlers.has('toggle' + (parts.length + 1)), label + ': the checklist keeps its handler')
  }
}
console.log('parts-check: ok')
