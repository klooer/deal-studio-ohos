// A section the model was to write that it answers it cannot: the input kept for it has nothing to do and is not on the screen; the
// notice is. Through runAgent with the plan and Jev's answers given. No network.
'use strict'
const assert = require('node:assert/strict')
const {loadVera} = require('./source-loader')
const {AgentHost, defaultBlockFill} = loadVera('agent/AgentHost')
const {AgentRequest, runAgent} = loadVera('agent/VeraAgent')
const nc = loadVera('NeedsChoose')
const align = loadVera('agent/AgentAlign')
const {compileVeraSource} = loadVera('VeraCompiler')
const {VirtualMachine, deserializeVbc2} = loadVera('VeraInterpreter')
const {UiHostEnvironment, decodeVeraUi} = loadVera('VeraUi')

const says = (choice, confidence = 0.95) => ({type: 'choice', choice, confidence})
const REQUEST = 'what is the weather today'
const plan = {title: 'Weather', eyebrow: 'WEATHER', subtitle: 'Today',
  inputs: [{id: 'place', label: 'Place', kind: 'text'}],
  needs: [{type: 'content', what: 'the weather in the place the person types, fetched live', from: REQUEST}]}

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
  const h = new AgentHost()
  h.askPlan = async (system, user, onText) => { const t = JSON.stringify(plan); onText(t); return t }
  h.askJev = async body => JSON.stringify({answers: {'ready.0': says('none', 0.9), 'whose.0': says('written'), real_data: says('false'),
    'asked.place': says('asked')}})
  h.fillBlocks = async request => defaultBlockFill(request)
  h.askCode = async () => '<cannot>This app cannot look up the weather: no phone function does it.</cannot>'
  h.lookup = async () => ''
  h.language = 'the language'
  const r = await runAgent(Object.assign(new AgentRequest(), {prompt: REQUEST}), h)
  assert.ok(r.source.length > 0, r.note + ' // ' + r.errors)
  assert.equal(r.errors, '', r.note)
  const texts = screen(r.source)
  assert.ok(texts.some(t => /cannot look up the weather/.test(t)), 'the notice is on the screen: ' + texts.join(' | '))
  assert.ok(!texts.includes('Place'), 'the input kept for the section nobody wrote is not: ' + texts.join(' | '))
  assert.equal(r.screen.open().length, 0)
align.setAlignEnabled(true)
  console.log('dead-input-check ok')
})().catch(e => { console.error(e); process.exit(1) })
