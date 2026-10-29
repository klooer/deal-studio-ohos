// Live prototype of VeraCompose.ets: the plan of needs (NeedsPlan.ets; DeepSeek, thinking off) -> Jev choices -> assembled VERA ->
// (parts only: no choice between a part and a section; agent-run.js runs the whole of it) ->
// the real compiler and VM. Needs the network: $ARKESTR_API_KEY for DeepSeek and $TYPESAFE_API_KEY for Jev.
//
//   node tools/vera-harness/compose-proto.js [-o OUTDIR] [-p PROMPTS.tsv] [-w] [label ...]
//
// -w assembles each screen as a chat widget (Composition.widget), the way buildMiniApp does.
//
// Prompts come from tools/vera-bench/prompts.tsv unless -p names another label<TAB>prompt file. Each run writes sketch.json, jev-request.json,
// jev-answer.json, program.vera and result.json into OUTDIR/<label>/ and prints one summary line.
'use strict'
const fs = require('node:fs')
const path = require('node:path')
const {loadVera} = require('./source-loader')
const compose = loadVera('VeraCompose')
const needs = loadVera('NeedsPlan')
const {compileVeraSource} = loadVera('VeraCompiler')
const {VirtualMachine, deserializeVbc2, decodeRuntimeValue} = loadVera('VeraInterpreter')
const {UiHostEnvironment, decodeVeraUi} = loadVera('VeraUi')

const args = process.argv.slice(2)
let out = path.join(require('node:os').tmpdir(), 'compose-proto')
const oi = args.indexOf('-o')
if (oi >= 0) { out = args[oi + 1]; args.splice(oi, 2) }
let promptFile = path.join(__dirname, '../vera-bench/prompts.tsv')
const pi = args.indexOf('-p')
if (pi >= 0) { promptFile = args[pi + 1]; args.splice(pi, 2) }
const wi = args.indexOf('-w')
const widget = wi >= 0
if (widget) args.splice(wi, 1)
const prompts = fs.readFileSync(promptFile, 'utf8').split('\n')
  .filter(l => l.trim() && !l.startsWith('#')).map(l => l.split('\t')).filter(([label]) => !args.length || args.includes(label))

async function sketchOf(prompt) {
  const res = await fetch('https://api.deepseek.com/chat/completions', {method: 'POST',
    headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.ARKESTR_API_KEY},
    body: JSON.stringify({model: 'deepseek-flash', stream: false, temperature: 0, max_tokens: 1500,
      thinking: {type: 'disabled'}, response_format: {type: 'json_object'},
      messages: [{role: 'system', content: needs.NEEDS_PROMPT}, {role: 'user', content: prompt}]})})
  const body = await res.json()
  if (!res.ok) throw Error('DeepSeek HTTP ' + res.status + ' ' + JSON.stringify(body).slice(0, 200))
  return body.choices[0].message.content
}

async function jev(request) {
  const res = await fetch('https://api.typesafe.ai/v1/systemone', {method: 'POST',
    headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.TYPESAFE_API_KEY}, body: request})
  const text = await res.text()
  if (!res.ok) throw Error('Jev HTTP ' + res.status + ' ' + text.slice(0, 200))
  return text
}

const texts = node => [node.label, node.title, node.text, node.value, node.numberValue, node.eyebrow].filter(v => v !== undefined && v !== '')
  .map(String).concat((node.children || []).flatMap(texts))

// Drives the program: every input setter with a middle value, then a countdown run to its end.
function exercise(vbc2, sketch, comp) {
  const host = new UiHostEnvironment()
  const vm = new VirtualMachine(deserializeVbc2(vbc2), host)
  let state = vm.execute('init')
  // Handlers may call sdk.call, as on the phone (VeraPreview allows effects only around a handler).
  const handle = (name, arg) => { host.effectsAllowed = true; try { return vm.execute(name, [state, arg]) } finally { host.effectsAllowed = false } }
  const screen = () => texts(decodeVeraUi(vm.execute('view', [state]))[0]).join(' | ')
  const steps = ['init: ' + screen()]
  // Only the inputs the screen kept: one nothing reads is left out, with no setter.
  for (const input of comp.inputs) {
    let arg
    if (input.kind === 'toggle') arg = decodeRuntimeValue(['b', true])
    else if (input.kind === 'choice') arg = decodeRuntimeValue(['n', input.options.length - 1])
    else {
      // A typed field holds the text the person typed.
      const mid = Math.round((input.min + input.max) / 2)
      const typed = comp.widgets.get(input.id) === 'typed_number'
      state = handle('set_' + input.id, decodeRuntimeValue(typed ? ['s', String(mid)] : ['n', mid]))
      steps.push('set ' + input.id + '=' + mid + ': ' + screen())
      continue
    }
    state = handle('set_' + input.id, arg)
    steps.push('set ' + input.id + ': ' + screen())
  }
  if (sketch.list) {
    // Each field filled the way a person would: words, a typed number, 08:30, switched on. Only the fields the
    // screen kept: one not asked for that nothing reads is left out of the form.
    const list = (comp.sketch || sketch).list
    for (const [text, amount] of [['first', '12'], ['second', '30']]) {
      for (const f of list.fields) {
        const value = f.kind === 'text' ? ['s', text] : f.kind === 'number' ? ['s', amount] : f.kind === 'time' ? ['n', 510] : ['b', true]
        state = handle('set_draft_' + f.id, decodeRuntimeValue(value))
      }
      state = handle('addEntry', decodeRuntimeValue(['n', 0]))
    }
    steps.push('two entries added: ' + screen())
    state = handle('removeEntry', decodeRuntimeValue(['n', 0]))
    steps.push('first removed: ' + screen())
  }
  if (sketch.hasStopwatch) {
    state = handle('onStart', decodeRuntimeValue(['n', 0]))
    state = handle('onTick', decodeRuntimeValue(['n', 65000]))
    steps.push('65 s in: ' + screen())
  }
  if (sketch.hasCountdown) {
    state = handle('onStart', decodeRuntimeValue(['n', 0]))
    state = handle('onTick', decodeRuntimeValue(['n', 1000]))
    steps.push('1 s in: ' + screen())
    try { state = handle('onTick', decodeRuntimeValue(['n', 3600 * 1000])) } catch (e) { steps.push('tick to end threw: ' + e.message) }
    steps.push('at the end: ' + screen())
  }
  return steps
}

;(async () => {
  fs.mkdirSync(out, {recursive: true})
  for (const [label, prompt] of prompts) {
    const dir = path.join(out, label)
    fs.mkdirSync(dir, {recursive: true})
    const result = {label}
    try {
      let t = Date.now()
      const sketchText = await sketchOf(prompt)
      result.sketchMs = Date.now() - t
      fs.writeFileSync(path.join(dir, 'sketch.json'), sketchText)
      const plan = needs.parseNeedsPlan(sketchText)
      const sketch = plan === null ? null : needs.sketchFrom(plan)
      if (!sketch) throw Error('sketch did not parse')
      const request = compose.buildComposeRequest(prompt, sketch, widget)
      fs.writeFileSync(path.join(dir, 'jev-request.json'), JSON.stringify(JSON.parse(request), null, 2))
      result.questions = Object.keys(JSON.parse(request).questions).length
      t = Date.now()
      const answer = await jev(request)
      result.jevMs = Date.now() - t
      fs.writeFileSync(path.join(dir, 'jev-answer.json'), answer)
      const comp = compose.readComposition(answer, sketch, widget)
      result.answers = comp.answers
      result.unbound = comp.unbound
      result.dropped = comp.dropped
      const source = compose.assembleProgram(comp)
      fs.writeFileSync(path.join(dir, 'program.vera'), source)
      if (source) {
        let compiled = null
        try {
          compiled = compileVeraSource(source)
          result.compiled = true
        } catch (e) {
          result.compiled = false
          result.errors = e.diagnostics ? e.diagnostics.map(d => `${d.span.start.line}:${d.span.start.column} ${d.message}`) : [e.message]
        }
        if (compiled) {
          try { result.run = exercise(compiled.vbc2 !== undefined ? compiled.vbc2 : compiled, sketch, comp) }
          catch (e) { result.runError = e.message }
        }
      }
    } catch (e) {
      result.error = e.message
    }
    fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify(result, null, 2))
    const verdict = result.error ? 'ERROR ' + result.error : result.unbound.length ? 'unbound: ' + result.unbound.join('; ')
      : result.compiled ? (result.runError ? 'compiled, run failed: ' + result.runError : 'compiled and ran') : 'compile failed: ' + (result.errors || []).slice(0, 3).join(' / ')
    console.log(`${label.padEnd(9)} sketch ${result.sketchMs}ms  jev ${result.jevMs}ms (${result.questions} questions)  ${verdict}`)
  }
})()
