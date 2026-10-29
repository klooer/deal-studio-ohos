// VeraCompose.ets without the network: recorded sketches and Jev answers (tools/vera-harness/compose/,
// from a live compose-proto.js run) through readComposition, assembleProgram, the real compiler and VM;
// the streaming preview (closePartialJson, provisionalProgram) on every prefix of each sketch; and the
// unit filter that keeps a percent operator away from a money operand.
'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {loadVera} = require('./source-loader')
const c = loadVera('VeraCompose')
// The composer's own binding and refusals, as they are without custom sections; the block that hands needs to one says so.
c.setCustomSectionsEnabled(false)
const {compileVeraSource} = loadVera('VeraCompiler')
const {VirtualMachine, deserializeVbc2, decodeRuntimeValue} = loadVera('VeraInterpreter')
const {UiHostEnvironment, decodeVeraUi} = loadVera('VeraUi')

const fixture = (label, file) => fs.readFileSync(path.join(__dirname, 'compose', label, file), 'utf8')
const sketchOf = label => c.parseSketch(fixture(label, 'sketch.json'))
const texts = node => [node.label, node.title, node.text, node.value, node.numberValue].filter(v => v !== undefined && v !== '')
  .map(String).concat((node.children || []).flatMap(texts))

function run(label) {
  const sketch = sketchOf(label)
  const comp = c.readComposition(fixture(label, 'jev-answer.json'), sketch)
  const source = c.assembleProgram(comp)
  const host = new UiHostEnvironment()
  const vm = source ? new VirtualMachine(deserializeVbc2(compileVeraSource(source).vbc2), host) : null
  let state = vm ? vm.execute('init') : null
  return {
    sketch, comp, source, host,
    call(name, tag, value) {
      host.effectsAllowed = true
      try { state = vm.execute(name, [state, decodeRuntimeValue([tag, value])]) } finally { host.effectsAllowed = false }
    },
    screen: () => texts(decodeVeraUi(vm.execute('view', [state]))[0]).join(' | '),
  }
}

// tip: three inputs, three money values, worked out the way the request means.
{
  const t = run('tip')
  assert.deepEqual(t.comp.unbound, [])
  const ids = t.sketch.inputs.map(i => i.id)
  const bill = ids.find(id => /bill/i.test(id)), pct = ids.find(id => /tip/i.test(id)), people = ids.find(id => /people|person/i.test(id))
  t.call('set_' + bill, t.comp.widgets.get(bill) === 'typed_number' ? 's' : 'n', t.comp.widgets.get(bill) === 'typed_number' ? '100' : 100)
  t.call('set_' + pct, 'n', 20)
  t.call('set_' + people, 'n', 4)
  const shown = t.screen() + ' |'
  assert.match(shown, /\| 20 \|/, 'tip 20% of 100')
  assert.match(shown, /\| 120 \|/, 'total 120')
  assert.match(shown, /\| 30 \|/, 'each of 4 pays 30')
}

// egg: a countdown whose length is the chosen option, a vibration when it ends.
{
  const e = run('egg')
  assert.deepEqual(e.comp.unbound, [])
  assert.match(e.source, /SensorServiceKit\.vibrator\.vibrate/)
  e.call('onStart', 'n', 0)
  e.call('onTick', 'n', 1000)
  assert.match(e.screen(), /\d:\d\d/)
  e.call('onTick', 'n', 3600 * 1000)
  assert.match(e.screen(), /0:00/)
  assert.match(e.screen(), /Asking the phone/, 'the effect was asked for')
}

// pill and mortgage: a calendar, and a payment that takes a power, are not in the vocabulary. fuel: litres
// as "distance times consumption divided by 100" with no constant 100, where Jev picked distance x consumption.
for (const label of ['pill', 'mortgage', 'fuel']) {
  const p = run(label)
  assert.ok(p.comp.unbound.length > 0, label + ' is refused')
  assert.equal(p.source, '')
}

// pill-calendar: the bench's pill prompt, composed: a name, a time and a daily switch per medicine; adding one
// asks the calendar with that medicine's own values and a 10-minute reminder; the answer lands on the entry.
{
  const p = run('pill-calendar')
  assert.deepEqual(p.comp.unbound, [])
  p.call('set_draft_medicineName', 's', 'Aspirin'); p.call('set_draft_doseTime', 'n', 1290); p.call('set_draft_repeatsDaily', 'b', true)
  p.call('addEntry', 'n', 0)
  const fx = p.host.pendingEffects.pop()
  assert.equal(fx.rawTarget, 'CalendarKit.Calendar.addEvent')
  assert.deepEqual(Object.fromEntries(fx.values), {title: 'Aspirin', hour: '21', minute: '30', repeat: 'daily', remindBefore: '10'})
  p.call('onEntryAnswer', 's', '7')
  assert.match(p.screen(), /Aspirin/); assert.match(p.screen(), /21:30/); assert.match(p.screen(), /In the calendar/)
}

// soft-egg: a countdown run from the chosen option, a beep at the end, the time shown with no value of its own.
{
  const e = run('soft-egg')
  assert.deepEqual(e.comp.unbound, [])
  assert.match(e.source, /AudioKit\.TonePlayer\.start/)
  assert.match(e.screen(), /\d:\d\d/)
  e.call('onStart', 'n', 0)
  e.call('onTick', 'n', 3600 * 1000)
  assert.match(e.screen(), /0:00/)
}

// stopwatch: counts up, with no end.
{
  const w = run('stopwatch')
  assert.deepEqual(w.comp.unbound, [])
  w.call('onStart', 'n', 0)
  w.call('onTick', 'n', 65000)
  assert.match(w.screen(), /1:05/)
}

// expenses: entries added and removed; the total is their amounts added up.
{
  const x = run('expenses')
  assert.deepEqual(x.comp.unbound, [])
  for (const [text, amount] of [['lunch', '12'], ['taxi', '30']]) {
    x.call('set_draft_words', 's', text)
    x.call('set_draft_amount', 's', amount)
    x.call('addEntry', 'n', 0)
  }
  assert.match(x.screen() + ' |', /\| 42 \|/)
  assert.match(x.screen(), /taxi/)
  x.call('removeEntry', 'n', 0)
  assert.match(x.screen() + ' |', /\| 30 \|/)
  assert.doesNotMatch(x.screen(), /lunch/)
  // An entry with no words is not added.
  x.call('set_draft_words', 's', '  ')
  x.call('addEntry', 'n', 0)
  assert.match(x.screen() + ' |', /\| 30 \|/)
}

// bmi: a value times itself, then a division by it.
{
  const b = run('bmi')
  assert.deepEqual(b.comp.unbound, [])
  assert.match(b.screen(), /22\.9/)
}

// Streaming: every prefix of every sketch either draws nothing yet or a preview that compiles,
// and the preview grows several times along the way.
for (const label of ['tip', 'egg', 'pill', 'soft-egg', 'expenses', 'stopwatch', 'bmi', 'mortgage', 'pill-calendar']) {
  const text = fixture(label, 'sketch.json')
  let shown = '', previews = 0
  for (let i = 1; i <= text.length; i++) {
    const closed = c.closePartialJson(text.slice(0, i))
    if (!closed) continue
    const sketch = c.parseSketch(closed)
    assert.ok(sketch, label + ': prefix ' + i + ' closes to JSON that parses')
    const signature = c.sketchSignature(sketch)
    if (signature === shown) continue
    shown = signature
    const source = c.provisionalProgram(sketch)
    if (source) { compileVeraSource(source); previews++ }
  }
  assert.ok(previews >= 2, label + ': ' + previews + ' previews')
}

// closePartialJson keeps strings intact and cuts only after complete values.
assert.equal(c.closePartialJson('{"a": "x, {y} \\" z", "b": [1, 2'), '{"a": "x, {y} \\" z", "b": [1]}')
assert.equal(c.closePartialJson('{"a": "unfinished'), '')
assert.equal(c.closePartialJson('{"a": 1} trailing'), '{"a": 1}')

// Ids the program uses itself are renamed, not dropped: an input called "duration" keeps its countdown.
{
  const sk = c.parseSketch('{"title": "T", "inputs": [{"id": "duration", "label": "Length", "kind": "count", "measure": "seconds", "value": 60}], ' +
    '"countdown": {"label": "Hold", "length": "duration"}, "values": [{"id": "total", "label": "A"}, {"id": "total", "label": "B"}]}')
  assert.deepEqual(sk.inputs.map(i => i.id), ['durationItem'])
  assert.deepEqual(sk.values.map(v => v.id), ['totalItem', 'totalItem2'])
}

// A choice's numbers are a countdown length only when Jev reads them as seconds or minutes: a tea timer once
// ran from the option's position, 0 to 2.
{
  const sk = c.parseSketch('{"title": "T", "inputs": [{"id": "kind", "label": "Kind", "kind": "choice", "measure": "number", ' +
    '"options": [{"label": "A", "value": 0}, {"label": "B", "value": 1}]}], "countdown": {"label": "Steep"}}')
  const q = JSON.parse(c.buildComposeRequest('x', sk)).questions
  assert.ok(q['unit.kind'].criteria.neither)
  const read = unit => c.readComposition(JSON.stringify({answers: {'countdown.length': {type: 'choice', choice: 'kind', confidence: 0.9},
    'unit.kind': {type: 'choice', choice: unit, confidence: 0.9}}}), sk)
  // Not a length of time, or nothing sets it: the person sets it, in minutes, and is told.
  for (const comp of [read('neither'), c.readComposition('{"answers": {}}', sk)]) {
    assert.deepEqual(comp.unbound, [])
    assert.equal(comp.countdownFrom, 'countdownLength')
    assert.equal(comp.countdownUnit, 'minutes')
    assert.ok(comp.inputs.some(i => i.id === 'countdownLength' && i.measure === 'minutes'))
    assert.deepEqual(comp.defaulted, ['Steep length: set by you, starting at 5 minutes'])
    compileVeraSource(c.assembleProgram(comp))
  }
  assert.equal(sk.inputs.length, 1, 'the sketch itself is not changed')
  assert.equal(read('minutes').countdownFrom, 'kind')
}

// A number nothing reads is left out and named: as not asked for when Jev says so, else as not used on the screen.
{
  const sk = c.parseSketch('{"title": "T", "inputs": [{"id": "eggs", "label": "Eggs", "kind": "count", "value": 2}], "stopwatch": {"label": "Boil"}}')
  const read = answer => c.readComposition(JSON.stringify({answers: answer}), sk)
  const added = read({'asked.eggs': {type: 'choice', choice: 'added', confidence: 0.9}})
  assert.deepEqual(added.unbound, [])
  assert.ok(added.dropped.some(d => /Eggs/.test(d)))
  for (const comp of [read({'asked.eggs': {type: 'choice', choice: 'asked', confidence: 0.9}}),
      read({'asked.eggs': {type: 'choice', choice: 'added', confidence: 0.4}}), read({})]) {
    assert.deepEqual(comp.unbound, [])
    assert.ok(comp.dropped.some(d => /Eggs.*nothing on the screen uses it/.test(d)))
  }
}

// A sketch and hand-written answers through the composer, compiler and VM.
function runSketch(sketchJson, answers, widget = false) {
  const comp = c.readComposition(JSON.stringify({answers}), c.parseSketch(sketchJson), widget)
  assert.deepEqual(comp.unbound, [])
  const host = new UiHostEnvironment()
  const source = c.assembleProgram(comp)
  const vm = new VirtualMachine(deserializeVbc2(compileVeraSource(source).vbc2), host)
  let state = vm.execute('init')
  return {
    source,
    host,
    call(name, tag, value) { host.effectsAllowed = true; try { state = vm.execute(name, [state, decodeRuntimeValue([tag, value])]) } finally { host.effectsAllowed = false } },
    screen: () => texts(decodeVeraUi(vm.execute('view', [state]))[0]).join(' | '),
  }
}
const pick = choice => ({type: 'choice', choice, confidence: 0.95})

// Like amounts divided make a fraction for a progress bar; "divided, rounded up" makes a count, offered
// only where the value is a count; add and multiply offer each pair once.
{
  const sk = c.parseSketch('{"title": "T", "inputs": [{"id": "done", "label": "Done", "kind": "count"}, {"id": "area", "label": "Area", "kind": "amount"}], ' +
    '"constants": [{"id": "goal", "label": "Goal", "value": 10, "measure": "count"}, {"id": "per", "label": "Per box", "value": 1.5}], ' +
    '"values": [{"id": "progress", "label": "P", "format": "fraction"}, {"id": "boxes", "label": "B", "format": "count"}, {"id": "plainOne", "label": "X", "format": "plain"}]}')
  assert.ok(c.expressionsFor(sk, 0).has('divide:done:goal'))
  assert.ok(c.expressionsFor(sk, 1).has('divide_up:area:per'))
  const plain = [...c.expressionsFor(sk, 2).keys()]
  assert.ok(!plain.some(k => /^(divide_up|round_up):/.test(k)), 'no rounding to a count for a plain value')
  assert.ok(plain.includes('multiply:area:per') && !plain.includes('multiply:per:area'))
  const b = runSketch(JSON.stringify({title: 'T', inputs: [{id: 'area', label: 'Area', kind: 'amount', value: 28}],
    constants: [{id: 'per', label: 'Per roll', value: 5.3}], values: [{id: 'rolls', label: 'Rolls', format: 'count'}]}),
  {'expr.rolls': pick('divide_up:area:per'), 'steps.rolls': pick('one'), 'widget.area': pick('stepper')})
  assert.match(b.screen() + ' |', /\| 6 \|/)
}

// Minutes: a countdown runs from a length in minutes, and a time in minutes reads as m:ss.
{
  const t = runSketch(JSON.stringify({title: 'T', constants: [{id: 'pasta', label: 'Pasta', value: 11, measure: 'minutes'}],
    countdown: {label: 'Pasta', length: 'pasta'}}), {'countdown.length': pick('pasta'), 'unit.pasta': pick('minutes')})
  assert.match(t.screen(), /11:00/)
  // The unit is Jev's reading of the labels, not the sketch's measure: options in seconds marked minutes.
  const timer = JSON.stringify({title: 'T', inputs: [{id: 'len', label: 'Length', kind: 'choice', measure: 'minutes',
    options: [{label: '1 minute', value: 60}, {label: '5 minutes', value: 300}], value: 1}], countdown: {label: 'Timer', length: 'len'}})
  assert.match(runSketch(timer, {'countdown.length': pick('len'), 'unit.len': pick('seconds')}).screen(), /5:00/)
  // Jev unsure of the unit: read by the numbers' size, and the person told; 300 is no number of minutes for a timer.
  const unsure = c.readComposition(JSON.stringify({answers: {'countdown.length': pick('len'), 'unit.len': {type: 'choice', choice: 'minutes', confidence: 0.3}}}),
    c.parseSketch(timer))
  assert.deepEqual([unsure.unbound, unsure.countdownFrom, unsure.countdownUnit, unsure.defaulted], [[], 'len', 'seconds', ['Length: taken as seconds']])
  const p = runSketch(JSON.stringify({title: 'T', inputs: [{id: 'mins', label: 'Time', kind: 'amount', measure: 'minutes', value: 50},
    {id: 'km', label: 'Distance', kind: 'amount', value: 8}], values: [{id: 'pace', label: 'Pace', format: 'minutes'}]}),
  {'expr.pace': pick('divide:mins:km'), 'steps.pace': pick('one'), 'widget.mins': pick('stepper'), 'widget.km': pick('stepper')})
  assert.match(p.screen(), /6:15/)
  // Seconds left on the countdown, shown as a value in minutes: converted, not read as minutes.
  const left = runSketch(JSON.stringify({title: 'T', constants: [{id: 'pasta', label: 'Pasta', value: 11, measure: 'minutes'}],
    countdown: {label: 'Pasta', length: 'pasta'}, values: [{id: 'left', label: 'Left', format: 'minutes'}]}),
  {'countdown.length': pick('pasta'), 'unit.pasta': pick('minutes'), 'expr.left': pick('copy:remaining:'), 'steps.left': pick('one')})
  assert.match(left.screen(), /Left \| 11:00/)
}

// A list with no fields adds an entry per tap.
{
  const l = runSketch(JSON.stringify({title: 'T', list: {label: 'Cups', text: '', number: ''}, values: [{id: 'cups', label: 'Cups', format: 'count'}]}),
    {'expr.cups': pick('copy:entryCount:'), 'steps.cups': pick('one')})
  assert.match(l.screen(), /Tap Add/)
  l.call('addEntry', 'n', 0); l.call('addEntry', 'n', 0)
  assert.match(l.screen(), /#2/)
  assert.match(l.screen() + ' |', /Cups \| 2 \|/)
}

// pill: an entry of words, a time of day and an on/off; adding it asks the calendar with the entry's own
// values, and the calendar's answer lands on that entry.
{
  const sketch = JSON.stringify({title: 'Pills', list: {label: 'Medicines', fields: [
    {id: 'name', label: 'Medicine', kind: 'text'}, {id: 'time', label: 'Time', kind: 'time', value: 480},
    {id: 'daily', label: 'Every day', kind: 'toggle'}]},
  events: [{id: 'cal', when: 'a medicine is added', what: 'put it in the calendar with a reminder', asked: true}]})
  const answers = {'effect.cal': pick('calendar_add'), 'moment.cal': pick('entry_added'),
    'arg.cal.calendar_add.title': pick('entry.name'), 'arg.cal.calendar_add.time': pick('entry.timeItem'),
    'arg.cal.calendar_add.repeat': pick('entry.daily'), 'arg.cal.calendar_add.remind': pick('fixed.zero')}
  const sk = c.parseSketch(sketch)
  assert.deepEqual(sk.list.fields.map(f => f.id), ['name', 'timeItem', 'daily'], 'a field called time is renamed')
  const comp = c.readComposition(JSON.stringify({answers}), sk)
  assert.deepEqual(comp.unbound, [])
  const host = new UiHostEnvironment()
  const vm = new VirtualMachine(deserializeVbc2(compileVeraSource(c.assembleProgram(comp)).vbc2), host)
  let state = vm.execute('init')
  const call = (name, tag, value) => { host.effectsAllowed = true; try { state = vm.execute(name, [state, decodeRuntimeValue([tag, value])]) } finally { host.effectsAllowed = false } }
  const screen = () => texts(decodeVeraUi(vm.execute('view', [state]))[0]).join(' | ')
  call('set_draft_name', 's', 'Aspirin'); call('set_draft_timeItem', 'n', 510); call('set_draft_daily', 'b', true)
  call('addEntry', 'n', 0)
  const fx = host.pendingEffects.pop()
  assert.equal(fx.rawTarget, 'CalendarKit.Calendar.addEvent')
  assert.deepEqual(Object.fromEntries(fx.values), {title: 'Aspirin', hour: '8', minute: '30', repeat: 'daily', remindBefore: '0'})
  assert.equal(fx.resultHandler, 'onEntryAnswer')
  assert.match(screen(), /Aspirin/); assert.match(screen(), /08:30/); assert.match(screen(), /Asking the phone\.\.\. · Every day · Added/)
  call('onEntryAnswer', 's', '42')
  assert.match(screen(), /In the calendar/)
  // A second medicine, switched off, once; an error answer shows as one.
  call('set_draft_name', 's', 'Vitamin D'); call('set_draft_daily', 'b', false); call('addEntry', 'n', 0)
  assert.equal(host.pendingEffects.pop().values.get('repeat'), 'once')
  call('onEntryAnswer', 's', 'error 201: permission denied')
  assert.match(screen(), /Phone: error 201/)
  assert.match(screen(), /In the calendar/, 'the first answer stays on the first entry')
  // The time must come from the entry: a calendar event at a countdown's end has no entry to read.
  const wrong = c.readComposition(JSON.stringify({answers: {...answers, 'moment.cal': pick('countdown_end')}}),
    c.parseSketch(sketch.replace('"events"', '"countdown": {"label": "T"}, "events"')))
  // (The countdown's missing length is now a default the person sets: the event alone is what refuses.)
  assert.ok(wrong.unbound.some(u => /no entry is added or tapped then/.test(u)), wrong.unbound.join('; '))
  // An unsure argument refuses the event.
  const unsure = c.readComposition(JSON.stringify({answers: {...answers, 'arg.cal.calendar_add.time': {type: 'choice', choice: 'entry.timeItem', confidence: 0.2}}}), sk)
  assert.ok(unsure.unbound.some(u => /time of day the event starts/.test(u)))
}

// The unit filter: "increase by a percent" is never offered with a money amount as the percent.
{
  const sketch = sketchOf('tip')
  const total = sketch.values.findIndex(v => /total/i.test(v.id))
  const offered = [...c.expressionsFor(sketch, total).keys()]
  assert.ok(offered.some(k => /^add:/.test(k)), 'bill + tip is offered')
  for (const k of offered) {
    const [formula, , b] = k.split(':')
    if (formula === 'add_percent' || formula === 'percent_of') assert.ok(/percent/i.test(b), k + ' takes a percent')
  }
}

// A written formula: only the screen's names, numbers, arithmetic and a few of std/math get in.
{
  const names = ['weightKg', 'heightM']
  assert.equal(c.parseFormula('weightKg / (heightM * heightM)', names).error, '')
  assert.deepEqual(c.parseFormula('math.round(weightKg) + pow(heightM, 2) - -1', names).reads, ['weightKg', 'heightM'])
  assert.match(c.parseFormula('weightKg / height', names).error, /reads height/)
  assert.match(c.parseFormula('Date.now()', names).error, /uses Date\.now/)
  assert.match(c.parseFormula('weightKg; state', names).error, /has ;/)
  assert.match(c.parseFormula('(weightKg', names).error, /without its \)/)
  assert.match(c.parseFormula('sqrt(weightKg, heightM)', names).error, /takes 1/)
  // A comparison is 1 or 0, once: "ready" is remaining <= 0.
  assert.equal(c.parseFormula('(weightKg >= 100) * 2 + (heightM !== 2)', names).error, '')
  assert.match(c.parseFormula('weightKg < heightM < 3', names).error, /compares twice/)
}

// A written length in the countdown's seconds, for a value shown in minutes, is divided: 6 minutes reads 6:00, not 6:00:00.
{
  const egg = runSketch(JSON.stringify({title: 'Egg', inputs: [],
    constants: [{id: 'boil', label: 'Boil', value: 360, measure: 'seconds'}], countdown: {label: 'Egg', length: 'boil'},
    values: [{id: 'left', label: 'Time left', means: 'seconds remaining', format: 'minutes', formula: 'remaining',
      example: {given: {remaining: 360}, result: 360}}]}),
  {'written.left': pick('right'), 'show.left': pick('stat'), 'countdown.length': pick('boil'), 'unit.boil': pick('seconds')})
  assert.match(egg.screen(), /Time left \| 6:00(?!:)/)
}

// A written comparison runs as 1 or 0 on the screen.
{
  const heavy = runSketch(JSON.stringify({title: 'Load', inputs: [{id: 'kg', label: 'Weight', kind: 'amount', min: 0, max: 500, value: 80}],
    values: [{id: 'over', label: 'Over the limit', means: '1 when the weight is above 100 kg', format: 'count', formula: 'kg > 100',
      example: {given: {kg: 120}, result: 1}}]}), {'written.over': pick('right'), 'widget.kg': pick('slider')})
  assert.match(heavy.screen(), /Over the limit \| 0/)
  heavy.call('set_kg', 'n', 150)
  assert.match(heavy.screen(), /Over the limit \| 1/)
}

// Where no formula of the vocabulary fits, the sketch's own is used once it reproduces its worked example and Jev reads
// it as right; a mistake in either refuses the screen.
{
  const bmi = (formula, result, extra = []) => JSON.stringify({title: 'BMI',
    inputs: [{id: 'weightKg', label: 'Weight', kind: 'amount', min: 30, max: 200, value: 70, unit: 'kg'},
      {id: 'heightM', label: 'Height', kind: 'amount', min: 1, max: 2.5, value: 1.75, unit: 'm'}],
    values: [{id: 'bmi', label: 'BMI', means: 'weight divided by height squared', format: 'plain', formula,
      example: {given: {weightKg: 70, heightM: 1.75}, result}}, ...extra]})
  const answers = {'expr.bmi': pick('unavailable'), 'steps.bmi': pick('more'), 'written.bmi': pick('right'),
    'widget.weightKg': pick('slider'), 'widget.heightM': pick('slider')}
  const b = runSketch(bmi('weightKg / (heightM * heightM)', 22.86), answers)
  assert.match(b.screen(), /BMI \| 22\.857/)
  b.call('set_weightKg', 'n', 80)
  assert.match(b.screen(), /BMI \| 26\.12/)
  const refused = (sketch, ans, why) => {
    const comp = c.readComposition(JSON.stringify({answers: ans}), c.parseSketch(sketch))
    assert.ok(comp.unbound.some(u => why.test(u)), comp.unbound.join('; '))
  }
  refused(bmi('weightKg / heightM', 22.86), answers, /gives 40 for its worked example, not 22\.86/)
  refused(bmi('weightKg / (heightM * heightM)', 22.86), {...answers, 'written.bmi': pick('wrong')}, /Jev does not read/)
  refused(bmi('weightKg / (heightM * heightM)', 22.86), {...answers, 'written.bmi': {type: 'choice', choice: 'right', confidence: 0.3}}, /Jev does not read/)
  refused(bmi('weightKg / heightCm', 22.86), answers, /reads heightCm/)
  // A later value's example runs through the earlier value as bound.
  const twice = runSketch(bmi('weightKg / (heightM * heightM)', 22.86,
    [{id: 'dbl', label: 'Double', means: 'twice the BMI', format: 'plain', formula: 'bmi * 2', example: {given: {weightKg: 70, heightM: 1.75}, result: 45.71}}]),
    {...answers, 'expr.dbl': pick('unavailable'), 'written.dbl': pick('right')})
  assert.match(twice.screen(), /Double \| 45\.71/)

  // A value nothing can work out is left out when the request did not ask for it and nothing kept reads it.
  const category = {id: 'band', label: 'Category', means: 'under, normal or over weight', format: 'plain', formula: 'bmi < 18.5',
    example: {given: {weightKg: 70, heightM: 1.75}, result: 0}}
  const withBand = bmi('weightKg / (heightM * heightM)', 22.86, [category])
  const dropped = runSketch(withBand, {...answers, 'asked.value.band': pick('added')})
  assert.match(dropped.screen(), /BMI \| 22\.857/)
  assert.doesNotMatch(dropped.screen(), /Category/)
  refused(withBand, {...answers, 'asked.value.band': pick('asked')}, /Category/)
  refused(withBand, {...answers, 'asked.value.band': {type: 'choice', choice: 'added', confidence: 0.4}}, /Category/)
  // One a value reads takes that value down with it: refused when the request asked for the reader, else both go.
  const reader = {id: 'shown', label: 'Shown', means: 'the category again', format: 'plain', formula: 'band',
    example: {given: {weightKg: 70, heightM: 1.75, band: 0}, result: 0}}
  const chain = bmi('weightKg / (heightM * heightM)', 22.86, [{...category, formula: 'bmi * 0', example: {given: {weightKg: 70, heightM: 1.75}, result: 5}}, reader])
  refused(chain, {...answers, 'asked.value.band': pick('added'), 'written.band': pick('right'), 'written.shown': pick('right')},
    /"Shown": reads "Category", which nothing works out/)
  const both = c.readComposition(JSON.stringify({answers: {...answers, 'asked.value.band': pick('added'), 'asked.value.shown': pick('added'),
    'written.band': pick('right'), 'written.shown': pick('right')}}), c.parseSketch(chain))
  assert.deepEqual(both.unbound, [])
  assert.deepEqual(both.sketch.values.map(v => v.id), ['bmi'])
  // Nothing left to show refuses.
  const alone = JSON.stringify({title: 'Band', inputs: [], values: [category]})
  refused(alone, {'asked.value.band': pick('added')}, /nothing left to show/)
}

// An item of "other" that names how a part is drawn is that part, drawn so; one the request did not ask for is left out
// only when Jev is sure, and one nothing does refuses as before.
{
  const sketch = c.parseSketch(JSON.stringify({title: 'Steps',
    inputs: [{id: 'steps', label: 'Steps today', kind: 'count', min: 0, max: 30000, value: 4000}],
    constants: [{id: 'goal', label: 'Goal', value: 10000, measure: 'number'}],
    values: [{id: 'progress', label: 'Progress', means: 'steps today over the goal', format: 'fraction',
      formula: 'steps / goal', example: {given: {steps: 4000}, result: 0.4}}],
    other: ['a progress bar toward the goal', 'a slider for the steps', 'a weekly history chart']}))
  const parts = Object.keys(JSON.parse(c.buildComposeRequest('steps vs goal', sketch)).questions['covers.0'].criteria)
  assert.ok(parts.includes('bar.progress') && parts.includes('widget.steps.slider') && parts.includes('value.progress'), parts.join(' '))
  // Whether an item of "other" is the person's is asked with the plan's own questions to the person in view.
  {
    const asked = JSON.parse(c.buildComposeRequest('steps vs goal', sketch)).questions['asked.other.2'].instructions
    assert.doesNotMatch(asked, /plan also asked/)
    const withQuestion = c.parseSketch(JSON.stringify({title: 'T', other: ['a weekly history chart'],
      questions: [{id: 'q', ask: 'How should history be shown?', options: ['a chart', 'a list']}]}))
    assert.match(JSON.parse(c.buildComposeRequest('x', withQuestion)).questions['asked.other.0'].instructions,
      /plan also asked the person: "How should history be shown\?" \(a chart \/ a list\)/)
  }
  {
    const withQ = c.parseSketch(JSON.stringify({title: 'T', inputs: [{id: 'n', label: 'N', kind: 'count', min: 0, max: 9, value: 1}],
      values: [{id: 'v', label: 'V', means: 'm', format: 'number', formula: 'n', example: {given: {n: 1}, result: 1}}],
      questions: [{id: 'q', ask: 'How should it be shown?', options: ['a', 'b']}]}))
    const qs = JSON.parse(c.buildComposeRequest('x', withQ)).questions
    assert.match(qs['asked.n'].instructions, /plan also asked the person/)
    assert.match(qs['asked.value.v'].instructions, /plan also asked the person/)
  }
  // An action a chosen section does itself is not also kept as a part: the same button would be on the screen twice.
  {
    const comp = {events: [{id: 'a', what: 'opens the calendar'}, {id: 'b', what: 'vibrates'}], effects: new Map([['a', 'calendar_open'], ['b', 'vibrate']]),
      args: new Map([['a', new Map()], ['b', new Map()]]), moments: new Map([['a', 'button'], ['b', 'button']]), dropped: [],
      customEffects: new Map(), custom: [], phoneNeeds: [], unboundNeeds: []}
    assert.deepEqual(c.dropProvided(comp, ['calendar_add', 'calendar_open']), ['opens the calendar'])
    assert.deepEqual(comp.events.map(e => e.id), ['b'])
    assert.ok(!comp.effects.has('a') && comp.effects.has('b') && !comp.moments.has('a') && !comp.args.has('a'))
    assert.deepEqual(c.dropProvided(comp, []), [])
    const spec = loadVera('VeraTemplates').fragments().find(f => f.kind === 'itinerary')
    assert.deepEqual(spec.slots.find(x => x.token === '__CALENDAR_IDX__').provides, ['calendar_add', 'calendar_open', 'calendar_clear'])
  }
  const base = {'written.progress': pick('right'), 'show.progress': pick('stat'),
    'widget.steps': pick('typed_number'), 'covers.0': pick('bar.progress'), 'covers.1': pick('widget.steps.slider'), 'covers.2': pick('none')}
  const read = extra => c.readComposition(JSON.stringify({answers: {...base, ...extra}}), sketch)
  c.setCustomSectionsEnabled(true)
  const added = read({'asked.other.2': pick('added')})
  assert.deepEqual(added.unbound, [])
  assert.equal(added.bindings.get('progress').show, 'progress')
  assert.equal(added.widgets.get('steps'), 'slider')
  assert.ok(added.dropped.some(d => /weekly history/.test(d)))
  // One nothing does is left to a custom section the model writes (agent/AgentCustom.ets); with those off, it refuses.
  const hesitant = read({'asked.other.2': {type: 'choice', choice: 'added', confidence: 0.6}})
  assert.deepEqual(hesitant.unbound, [])
  assert.ok(hesitant.custom.some(u => /weekly history/.test(u)), 'a hesitant "added" goes to a custom section')
  assert.ok(read({'asked.other.2': pick('asked')}).custom.some(u => /weekly history/.test(u)))
  c.setCustomSectionsEnabled(false)
  assert.ok(read({'asked.other.2': {type: 'choice', choice: 'added', confidence: 0.6}}).unbound.some(u => /weekly history/.test(u)), 'a hesitant "added" refuses')
  assert.ok(read({'asked.other.2': pick('asked')}).unbound.some(u => /weekly history/.test(u)))
}

// A chat widget: a detail of how it looks or is worked is left out only in widget mode and only when Jev is sure, and the
// screen has no header or hero and at most two sections, the result first.
{
  const sketch = c.parseSketch(JSON.stringify({title: 'Tip',
    inputs: [{id: 'bill', label: 'Bill', kind: 'amount', min: 0, max: 1000, value: 50}],
    constants: [{id: 'rate', label: 'Tip rate', value: 18, measure: 'percent'}],
    values: [{id: 'tip', label: 'Tip', means: 'the bill times the tip rate', format: 'money', unit: '$',
      formula: 'bill * rate / 100', example: {given: {bill: 50}, result: 9}}],
    other: ['a reference line: $100 tips $18', 'shows nearby restaurants']}))
  const questions = sketch => Object.keys(JSON.parse(c.buildComposeRequest('tip', sketch, true)).questions)
  assert.ok(questions(sketch).includes('detail.0') && !Object.keys(JSON.parse(c.buildComposeRequest('tip', sketch)).questions).includes('detail.0'))
  const answers = {'written.tip': pick('right'), 'show.tip': pick('hero'), 'widget.bill': pick('typed_number'), 'covers.0': pick('none'),
    'covers.1': pick('none'), 'detail.0': pick('detail'), 'detail.1': pick('core')}
  const read = (extra, widget) => c.readComposition(JSON.stringify({answers: {...answers, ...extra}}), sketch, widget)
  assert.ok(read({}, true).unbound.some(u => /restaurants/.test(u)), 'a core item still refuses')
  assert.deepEqual(read({'detail.1': pick('detail')}, false).unbound.length, 2, 'only a widget leaves details out')
  assert.ok(read({'detail.0': {type: 'choice', choice: 'detail', confidence: 0.6}}, true).unbound.some(u => /reference line/.test(u)))
  const widget = read({'asked.other.1': pick('added')}, true)
  assert.deepEqual(widget.unbound, [])
  assert.ok(widget.dropped.some(d => /reference line.*a detail/.test(d)))
  const source = c.assembleProgram(widget)
  assert.doesNotMatch(source, /ui\.Header|ui\.Hero/)
  assert.equal((source.match(/ui\.Section\(/g) || []).length, 2)
  assert.ok(source.indexOf('"Tip"') < source.indexOf('"Bill"'), 'the result comes before its control')
}

// The figures as a table: an item asking for one is the figures part, drawn as rows with the fixed numbers first; a
// display-only screen shows its fixed numbers anyway. A table or chart is never a detail to leave out.
{
  const split = JSON.stringify({title: 'Split', inputs: [],
    constants: [{id: 'bill', label: 'Bill', value: 187, measure: 'money'}, {id: 'rate', label: 'Tip', value: 12, measure: 'percent'},
      {id: 'people', label: 'People', value: 4, measure: 'count'}, {id: 'unused', label: 'Unused', value: 9, measure: 'number'}],
    values: [{id: 'tip', label: 'Tip amount', means: 'the bill times the rate', format: 'money', unit: '$', formula: 'bill * rate / 100',
      example: {given: {bill: 187, rate: 12}, result: 22.44}},
      {id: 'each', label: 'Each pays', means: 'bill plus tip over the people', format: 'money', unit: '$', formula: '(bill + tip) / people',
        example: {given: {bill: 187, tip: 22.44, people: 4}, result: 52.36}}],
    other: ['a table with rows Bill, Tip, Each']})
  const sketch = c.parseSketch(split)
  const request = JSON.parse(c.buildComposeRequest('split', sketch, true))
  assert.ok(Object.keys(request.questions['covers.0'].criteria).includes('figures'))
  assert.match(request.questions['detail.0'].criteria.core, /a table/)
  const answers = {'written.tip': pick('right'), 'written.each': pick('right'), 'show.tip': pick('stat'), 'show.each': pick('stat')}
  const table = runSketch(split, {...answers, 'covers.0': pick('figures')}, true)
  assert.match(table.screen(), /Bill \| 187 \| Tip \| 12 \| People \| 4 \| Tip amount \| 22\.44 \| Each pays \| 52\.36/)
  assert.doesNotMatch(table.screen(), /Unused/)
  assert.match(table.source, /ui\.ListGroup\("default", "", \[ui\.NumberListItem\("default", "Bill", "", bill, "\$"/)
  // Without the item, a screen with nothing to set still shows the bill, as a figure.
  const plain = runSketch(JSON.stringify({...JSON.parse(split), other: []}), answers, true)
  assert.match(plain.screen(), /Bill \| 187/)
}

// In a widget, an event no effect does that Jev reads as a detail ("show 'ready' at zero") is left out; elsewhere it refuses.
{
  const sketch = c.parseSketch(JSON.stringify({title: 'Egg', inputs: [], constants: [{id: 'boil', label: 'Boil', value: 360, measure: 'seconds'}],
    countdown: {label: 'Egg', length: 'boil'}, values: [],
    events: [{id: 'ready', when: 'the countdown reaches zero', what: "show the message 'Egg is ready'", asked: true}]}))
  assert.ok(Object.keys(JSON.parse(c.buildComposeRequest('egg', sketch, true)).questions).includes('detail.event.ready'))
  const answers = {'countdown.length': pick('boil'), 'unit.boil': pick('seconds'), 'effect.ready': pick('unavailable'),
    'moment.ready': pick('countdown_end'), 'detail.event.ready': pick('detail')}
  const widget = c.readComposition(JSON.stringify({answers}), sketch, true)
  assert.deepEqual(widget.unbound, [])
  assert.ok(widget.dropped.some(d => /Egg is ready.*a detail/.test(d)))
  assert.ok(c.readComposition(JSON.stringify({answers}), sketch, false).unbound.some(u => /Egg is ready/.test(u)))
  assert.ok(c.readComposition(JSON.stringify({answers: {...answers, 'detail.event.ready': pick('core')}}), sketch, true).unbound.length > 0)
}

// Money shows its currency's sign, whatever the sketch called it; one not known keeps its word, apart from the number.
{
  assert.equal(c.currencySign('dollars'), '$')
  assert.equal(c.currencySign('USD'), '$')
  assert.equal(c.currencySign(' Euros '), '€')
  assert.equal(c.currencySign('GBP'), '£')
  assert.equal(c.currencySign('Canadian dollars'), 'CA$')
  assert.equal(c.currencySign('$'), '$')
  assert.equal(c.currencySign('kr'), 'kr ')
  const tip = runSketch(JSON.stringify({title: 'Tip', inputs: [{id: 'bill', label: 'Bill', kind: 'amount', measure: 'money', min: 0, max: 500, value: 50, unit: 'dollars'}],
    values: [{id: 'tip', label: 'Tip', means: '18% of the bill', format: 'money', unit: 'dollars', formula: 'bill * 18 / 100',
      example: {given: {bill: 50}, result: 9}}]}), {'written.tip': pick('right'), 'show.tip': pick('hero'), 'widget.bill': pick('typed_number')})
  assert.match(tip.screen(), /\$9\.00/)
  assert.doesNotMatch(tip.screen(), /dollars/)
}

// Buttons: on each entry (navigate to it, put it in the calendar) and on the screen (clear what this app added, open the
// calendar). The calendar events' IDs are kept, so clearing deletes exactly those.
{
  const stops = JSON.stringify({title: 'Day plan', inputs: [], constants: [{id: 'lead', label: 'Reminder', value: 15, measure: 'minutes'}],
    list: {label: 'Stops', fields: [{id: 'name', label: 'Stop', kind: 'text'}, {id: 'lat', label: 'Latitude', kind: 'number', measure: 'number'},
      {id: 'lon', label: 'Longitude', kind: 'number', measure: 'number'}, {id: 'at', label: 'Time', kind: 'time'}]},
    values: [], events: [
      {id: 'go', when: 'the stop\'s button is tapped', what: 'navigate to the stop', asked: true},
      {id: 'cal', when: 'the stop\'s button is tapped', what: 'add the stop to the calendar with a reminder', asked: true},
      {id: 'wipe', when: 'its button is tapped', what: 'delete every calendar event this app added', asked: true},
      {id: 'open', when: 'its button is tapped', what: 'open the phone\'s calendar', asked: true}]})
  const sketch = c.parseSketch(stops)
  const request = JSON.parse(c.buildComposeRequest('day plan', sketch))
  assert.ok(Object.keys(request.questions['moment.go'].criteria).includes('row_button'))
  assert.ok(Object.keys(request.questions['moment.go'].criteria).includes('button'))
  assert.ok(Object.keys(request.questions['arg.go.navigate.latitude'].criteria).includes('entry.lat'))
  const answers = {'effect.go': pick('navigate'), 'moment.go': pick('row_button'), 'arg.go.navigate.place': pick('entry.name'),
    'arg.go.navigate.latitude': pick('entry.lat'), 'arg.go.navigate.longitude': pick('entry.lon'),
    'effect.cal': pick('calendar_add'), 'moment.cal': pick('row_button'), 'arg.cal.calendar_add.title': pick('entry.name'),
    'arg.cal.calendar_add.time': pick('entry.at'), 'arg.cal.calendar_add.repeat': pick('fixed.once'), 'arg.cal.calendar_add.remind': pick('const.lead'),
    'effect.wipe': pick('calendar_clear'), 'moment.wipe': pick('button'), 'effect.open': pick('calendar_open'), 'moment.open': pick('button')}
  const day = runSketch(stops, answers)
  const calls = () => day.host.pendingEffects.splice(0).map(e => e.rawTarget + ' ' + JSON.stringify(e.rawParams || ''))
  day.call('set_draft_name', 's', 'Yu Garden'); day.call('set_draft_lat', 's', '31.2272'); day.call('set_draft_lon', 's', '121.4921')
  day.call('set_draft_at', 'n', 600); day.call('addEntry', 'n', 0)
  assert.match(day.screen(), /Yu Garden/)
  assert.match(day.screen(), /Navigate \| .*Add to calendar \| .*Remove/)
  assert.match(day.screen(), /Clear calendar \| .*Open calendar/)
  calls()
  day.call('row_go', 'n', 0)
  assert.match(day.source, /sdk\.call\("com\.huawei\.hmos\.maps\.app\/entry\/EntryAbility\/StartNavigate", \["trafficType", "Drive", "dstLocation\.locationName", entry\.name, "dstLocation\.latitude", ui\.numberToString\(entry\.lat\)/)
  assert.match(calls().join(), /StartNavigate/)
  day.call('do_wipe', 'n', 0)
  assert.match(day.screen(), /No calendar events added yet/)
  day.call('row_cal', 'n', 0)
  day.call('onCalendarAdded', 's', '41')
  day.call('row_cal', 'n', 0)
  day.call('onCalendarAdded', 's', 'error 13900020: denied')
  calls()
  day.call('do_wipe', 'n', 0)
  assert.match(day.source, /if \(state\.calendarIds !== ""\) \{ sdk\.call\("CalendarKit\.Calendar\.deleteEvents", \["ids", state\.calendarIds\], "onCalendarCleared"\); \}/)
  assert.match(calls().join(), /deleteEvents/)
  day.call('onCalendarCleared', 's', 'ok')
  day.call('do_wipe', 'n', 0)
  assert.match(day.screen(), /No calendar events added yet/)
  day.call('do_open', 'n', 0)
  assert.match(calls().join(), /com\.huawei\.hmos\.calendar\/phone\/MainAbility/)
  // A row's field outside an entry moment is refused, as before.
  assert.ok(c.readComposition(JSON.stringify({answers: {...answers, 'moment.go': pick('button')}}), sketch).unbound.some(u => /navigate/.test(u)))
}

// A number the vocabulary cannot reach (no constant 100) is written instead of refused; a time of day adds up and wraps
// past midnight.
{
  const fuel = runSketch(JSON.stringify({title: 'Fuel', inputs: [{id: 'km', label: 'Distance', kind: 'amount', value: 300, max: 1000},
    {id: 'per100', label: 'Litres per 100 km', kind: 'amount', value: 6.5, max: 20}],
    values: [{id: 'litres', label: 'Fuel needed', means: 'distance times litres per 100 km divided by 100', format: 'plain',
      formula: 'km * per100 / 100', example: {given: {km: 300, per100: 6.5}, result: 19.5}}]}),
  {'expr.litres': pick('multiply:km:per100'), 'steps.litres': pick('one'), 'written.litres': pick('right'),
    'widget.km': pick('slider'), 'widget.per100': pick('slider')})
  assert.match(fuel.screen(), /Fuel needed \| 19\.5/)
  const flight = runSketch(JSON.stringify({title: 'Layover', inputs: [{id: 'landing', label: 'Landing', kind: 'time', value: 540},
    {id: 'hours', label: 'Hours until the flight', kind: 'count', value: 11, max: 24}],
    values: [{id: 'flightAt', label: 'Next flight', means: 'landing time plus the hours', format: 'time_of_day',
      formula: 'landing + hours * 60', example: {given: {landing: 540, hours: 11}, result: 1200}}]}),
  {'written.flightAt': pick('right'), 'widget.hours': pick('stepper')})
  assert.match(flight.screen(), /20:00/)
  flight.call('set_hours', 'n', 16)
  assert.match(flight.screen(), /01:00/)
}


// With custom sections on, a figure nothing can work out that the request wants goes to the custom section, and the
// inputs its formula reads stay on the screen for it; with them off, it refuses as before.
{
  const sketch = c.parseSketch(JSON.stringify({title: 'Dice', inputs: [{id: 'dice', label: 'Dice', kind: 'count', min: 1, max: 6, value: 2}],
    values: [{id: 'total', label: 'Total', means: 'the sum of the dice rolled', format: 'count', formula: 'dice * 3.5',
      example: {given: {dice: 2}, result: 7}}]}))
  const answers = JSON.stringify({answers: {'written.total': {type: 'choice', choice: 'wrong', confidence: 0.9},
    'asked.value.total': {type: 'choice', choice: 'asked', confidence: 0.9}}})
  assert.ok(c.readComposition(answers, sketch).unbound.some(u => /Total/.test(u)))
  c.setCustomSectionsEnabled(true)
  const comp = c.readComposition(answers, sketch)
  c.setCustomSectionsEnabled(false)
  assert.deepEqual(comp.unbound, [])
  // The plan's own formula and worked example go with the need, for the one who writes it.
  assert.deepEqual(comp.custom, ['the figure "Total": the sum of the dice rolled (the plan works it out as dice * 3.5; for dice = 2 that is 7)'])
  assert.deepEqual(comp.inputs.map(i => i.id), ['dice'])
  assert.equal(comp.sketch.values.length, 0)
}
// An input nothing else reads, on a screen with a need left to the custom section, stays for that section (the dice
// to roll), and the section is told which state field it is in.
{
  const sketch = c.parseSketch(JSON.stringify({title: 'Dice', inputs: [{id: 'dice', label: 'Dice', kind: 'count', min: 1, max: 6, value: 2}],
    other: ['roll the dice and show each face']}))
  const answers = JSON.stringify({answers: {'covers.0': pick('none'), 'asked.other.0': pick('asked'), 'asked.dice': pick('asked'),
    'widget.dice': pick('stepper')}})
  // Without the custom section the request's item refuses the screen, and the input is left out with a note.
  const without = c.readComposition(answers, sketch)
  assert.ok(without.unbound.some(u => /roll the dice/.test(u)))
  assert.ok(without.dropped.some(d => /Dice.*nothing on the screen uses it/.test(d)))
  c.setCustomSectionsEnabled(true)
  const comp = c.readComposition(answers, sketch)
  c.setCustomSectionsEnabled(false)
  assert.deepEqual(comp.unbound, [])
  assert.deepEqual(comp.custom, ['roll the dice and show each face'])
  assert.deepEqual(c.customInputs(comp), ['"Dice": state.dice'])
}
console.log('compose-check: ok')
