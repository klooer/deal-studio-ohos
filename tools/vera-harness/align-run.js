// The alignment prototype, live on the host: for each prompt the three readings of align-lib.js side by side.
//
//   node tools/vera-harness/align-run.js [-o OUTDIR] [-p PROMPTS.tsv] [-s dev|test|all] [-j JOBS] [-n COUNT] [--plan] [label ...]
//
// Needs $ARKESTR_API_KEY (DeepSeek, the plan) and $TYPESAFE_API_KEY (Jev); it reads no key from a file and stops without
// them. Per prompt it makes 1 DeepSeek call for the plan (more if the plan is asked for again), and 3 Jev calls: the
// composer's choices for the plan, the section pick for the request as typed, and one question per need of the plan
// (align-lib.js needsOf). --plan adds a 4th: the section pick for the request with its plan text, which the first pilot
// found to give false matches.
// Nothing is written, no screen is built, no Exa search is made.
//
// Prompts come from tools/vera-bench/prompts.tsv unless -p names a label<TAB>prompt[<TAB>...] file. compose-fresh.tsv
// has a split column (5th) and says it must not be tuned against: this reads only its `dev` rows unless -s names another,
// and `-s test` is for the one report at the end, not for looking at while the prototype changes.
'use strict'
const fs = require('node:fs')
const path = require('node:path')
const {loadVera} = require('./source-loader')
const lib = require('./align-lib')
const {compose, sections} = lib
const needs = loadVera('NeedsChoose')

const args = process.argv.slice(2)
const option = (flag, fallback) => { const i = args.indexOf(flag); if (i < 0) return fallback; const v = args[i + 1]; args.splice(i, 2); return v }
const out = option('-o', path.join(require('node:os').tmpdir(), 'align-run'))
const promptFile = option('-p', path.join(__dirname, '../vera-bench/prompts.tsv'))
const split = option('-s', 'dev')
const jobs = Number(option('-j', '3'))
const limit = Number(option('-n', '0'))
const withPlan = (() => { const i = args.indexOf('--plan'); if (i < 0) return false; args.splice(i, 1); return true })()

for (const key of ['ARKESTR_API_KEY', 'TYPESAFE_API_KEY']) {
  if (!process.env[key]) { console.error('align-run: $' + key + ' is not set; nothing was asked.'); process.exit(2) }
}
if (!['dev', 'test', 'all'].includes(split)) { console.error('align-run: -s is dev, test or all'); process.exit(2) }

let prompts = fs.readFileSync(promptFile, 'utf8').split('\n').filter(l => l.trim() && !l.startsWith('#')).map(l => l.split('\t'))
// The 5th column, when it is dev or test, is the split.
prompts = prompts.filter(cols => split === 'all' || !['dev', 'test'].includes(cols[4]) || cols[4] === split)
prompts = prompts.filter(([label]) => !args.length || args.includes(label))
if (limit > 0) prompts = prompts.slice(0, limit)

async function deepseek(system, user, maxTokens, json, think = false) {
  const res = await fetch('https://api.deepseek.com/chat/completions', {method: 'POST',
    headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.ARKESTR_API_KEY},
    body: JSON.stringify(Object.assign({model: 'deepseek-flash', stream: false, temperature: 0, max_tokens: maxTokens,
      thinking: {type: think ? 'enabled' : 'disabled'}, messages: [{role: 'system', content: system}, {role: 'user', content: user}]},
      think ? {reasoning_effort: 'low'} : {}, json ? {response_format: {type: 'json_object'}} : {}))})
  const body = await res.json()
  if (!res.ok) throw Error('DeepSeek HTTP ' + res.status + ' ' + JSON.stringify(body).slice(0, 200))
  return body.choices[0].message.content
}

async function jev(body) {
  const res = await fetch('https://api.typesafe.ai/v1/systemone', {method: 'POST',
    headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.TYPESAFE_API_KEY}, body})
  const text = await res.text()
  if (!res.ok) throw Error('Jev HTTP ' + res.status + ' ' + text.slice(0, 200))
  return text
}

/** The section pick for `text`, as the removed blocks path asked for it. null when Jev did not answer. */
async function sectionPick(text) {
  try {
    const body = await jev(sections.buildSectionRequest(text))
    const outcome = sections.readSectionPick(body)
    outcome.rawBody = body
    return {outcome, body}
  } catch (e) {
    return {outcome: null, body: '', error: e.message}
  }
}

async function one([label, prompt]) {
  const dir = path.join(out, label)
  fs.mkdirSync(dir, {recursive: true})
  const log = {label, prompt}
  const started = Date.now()
  try {
    // The composition (the agent's reading) and the pick for the request as typed do not wait for each other.
    const asks = []
    const askJev = async body => { const t = await jev(body); asks.push({body, answer: t}); return t }
    const [composed, raw] = await Promise.all([
      needs.composeNeeds(prompt, async (system, user, onText, think) => {
        const text = await deepseek(system, user, think ? 6000 : 1500, true, think); onText(text); return text
      }, askJev, () => {}, false, async () => ''),
      sectionPick(prompt)
    ])
    log.note = composed.note
    const sketch = composed.parsed
    let plan = {outcome: null}
    if (sketch !== null && withPlan) {
      log.planText = lib.alignmentText(prompt, sketch)
      plan = await sectionPick(log.planText)
    }
    // One question per need of the plan; a plan with no such need asks nothing.
    let needs = null
    if (sketch !== null) {
      const wanted = lib.needsOf(sketch)
      needs = []
      if (wanted.length > 0) {
        try {
          log.needBody = await jev(lib.buildNeedRequest(prompt, wanted))
          needs = lib.readNeedAnswers(log.needBody, wanted)
        } catch (e) { log.error = e.message }
      }
    }
    log.rawBody = raw.body; log.planBody = plan.body; log.error = log.error || raw.error || plan.error || ''
    fs.writeFileSync(path.join(dir, 'sketch.json'), JSON.stringify(sketch, (k, v) => v instanceof Map ? Object.fromEntries(v) : v, 2))
    fs.writeFileSync(path.join(dir, 'raw-answer.json'), raw.body)
    fs.writeFileSync(path.join(dir, 'plan-answer.json'), plan.body || '')
    fs.writeFileSync(path.join(dir, 'needs-answer.json'), log.needBody || '')
    if (asks.length) fs.writeFileSync(path.join(dir, 'composition-answer.json'), asks[asks.length - 1].answer)
    log.row = lib.row(label, prompt, raw.outcome, plan.outcome, composed.composition, needs)
  } catch (e) {
    log.error = e.message
    log.row = lib.row(label, prompt, null, null, null)
  }
  log.ms = Date.now() - started
  fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify(log, null, 2))
  console.log(log.row.label + '  ' + (log.error ? 'ERROR ' + log.error.slice(0, 80) : (log.row.notes.length ? log.row.notes.length + ' note(s)' : 'agree')) + '  ' + (log.ms / 1000).toFixed(1) + ' s')
  return log
}

;(async () => {
  console.log('align-run: ' + prompts.length + ' prompt(s), split ' + split + ', ' + jobs + ' at a time -> ' + out)
  const results = []
  const queue = prompts.slice()
  await Promise.all(Array.from({length: Math.max(1, jobs)}, async () => { for (let p = queue.shift(); p; p = queue.shift()) results.push(await one(p)) }))
  results.sort((a, b) => a.label < b.label ? -1 : 1)
  const table = lib.table(results.map(r => r.row))
  fs.writeFileSync(path.join(out, 'table.txt'), table.text)
  console.log('\n' + table.text)
})().catch(e => { console.error(e); process.exit(1) })
