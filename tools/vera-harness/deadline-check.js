// A time of day that ends the plan's list of stops (a flight to catch): the itinerary shows only the stops that fit before it, and the
// counts follow. Through runAgent and the program's own VM, with the plan and Jev's answers given. No network.
'use strict'
const assert = require('node:assert/strict')
const {loadVera} = require('./source-loader')
const {AgentHost, defaultBlockFill} = loadVera('agent/AgentHost')
const {AgentRequest, runAgent} = loadVera('agent/VeraAgent')
const {compileVeraSource} = loadVera('VeraCompiler')
const {VirtualMachine, deserializeVbc2} = loadVera('VeraInterpreter')
const {UiHostEnvironment, decodeVeraUi} = loadVera('VeraUi')
const nc = loadVera('NeedsChoose')
const align = loadVera('agent/AgentAlign')

const says = (choice, confidence = 0.95) => ({type: 'choice', choice, confidence})
const REQUEST = 'stops to see in the city'

// A plan whose figure "Leave at" is the start plus the minutes available: 09:00 + span.
const plan = span => ({title: 'City day', eyebrow: 'DAY', subtitle: 'What fits before you leave',
  inputs: [{id: 'beginAt', label: 'Start', kind: 'time', measure: 'minutes', value: 540},
           {id: 'span', label: 'Minutes available', kind: 'amount', measure: 'minutes', min: 0, max: 900, value: span}],
  needs: [{type: 'figure', id: 'leaveAt', label: 'Leave at', means: 'the time of day by which the stops must be over', format: 'time_of_day',
           formula: 'beginAt + span', example: {given: {beginAt: 540, span}, result: 540 + span}},
          {type: 'content', what: 'a list of stops to see in the city', from: REQUEST}]})

async function build(span, answers) {
  const h = new AgentHost()
  h.askPlan = async (system, user, onText) => { const t = JSON.stringify(plan(span)); onText(t); return t }
  h.askJev = async body => JSON.stringify({answers})
  h.fillBlocks = async request => defaultBlockFill(request)
  const r = await runAgent(Object.assign(new AgentRequest(), {prompt: REQUEST}), h)
  return r
}
const base = {'ready.0': says('itinerary'), 'whose.0': says('written'), real_data: says('false'), 'show.leaveAt': says('stat'),
  'written.leaveAt': says('right', 0.9), 'asked.value.leaveAt': says('asked')}

function screen(source) {
  const compiled = compileVeraSource(source)
  const vm = new VirtualMachine(deserializeVbc2(compiled.vbc2), new UiHostEnvironment())
  const texts = []
  const walk = n => { for (const k of Object.keys(n)) { const v = n[k]; if (typeof v === 'string' && v.length) texts.push(v); else if (Array.isArray(v)) v.forEach(c => c && typeof c === 'object' && walk(c)); else if (v && typeof v === 'object') walk(v) } }
  decodeVeraUi(vm.execute('view', [vm.execute('init')])).forEach(walk)
  return texts
}

;(async () => {
align.setAlignEnabled(false)
  // The default stops are five of an hour each, the first at 09:00 with 15 minutes between: they end at 10:00, 11:15, 12:30, 13:45, 15:00.
  for (const [span, shown, label] of [[800, 5, 'a day'], [270, 3, '09:00 + 270 min = 13:30'], [150, 2, '09:00 + 150 min = 11:30'], [30, 0, 'nothing fits']]) {
    const r = await build(span, Object.assign({'deadline.leaveAt': says('yes')}, base))
    assert.equal(r.errors, '', label + ': ' + r.note)
    assert.ok(r.source.length > 0, label + ' (no program): ' + r.note + ' // ' + r.errors)
    const texts = screen(r.source)
    const stops = texts.filter(t => /^Stop \d$/.test(t))
    assert.equal(stops.length, shown, label + ': ' + stops.join(', '))
    assert.equal(texts.some(t => /would run past/.test(t)), shown < 5, label + ' banner')
    assert.equal(texts.some(t => /Nothing fits before/.test(t)), shown === 0, label + ' empty')
  }
  // Jev unsure (below the bar, 0.4): nothing is hidden.
  {
    const r = await build(30, Object.assign({'deadline.leaveAt': says('yes', 0.3)}, base))
    assert.equal(screen(r.source).filter(t => /^Stop \d$/.test(t)).length, 5)
  }
  // Without Jev naming the figure, nothing is hidden: the section stands alone as before.
  {
    const r = await build(30, Object.assign({'deadline.leaveAt': says('no')}, base))
    const texts = screen(r.source)
    assert.equal(texts.filter(t => /^Stop \d$/.test(t)).length, 5)
    assert.ok(!texts.some(t => /would run past|Nothing fits/.test(t)))
  }
  // The itinerary still stands alone: it takes no value it needs from another block.
  {
    const {fragments} = loadVera('VeraTemplates')
    const itinerary = fragments().find(f => f.kind === 'itinerary')
    const reads = itinerary.ports.filter(p => p.dir === 'reads')
    assert.deepEqual(reads.map(p => [p.name, p.optional]), [['deadline', true]])
    assert.ok(align.alignKinds().includes('itinerary'))
  }
align.setAlignEnabled(true)
  console.log('deadline-check ok')
})().catch(e => { console.error(e); process.exit(1) })
