// The alignment prototype, pure parts (no network): what Jev is shown when it is asked to pick blocks for a *plan*
// rather than for the raw request, and one comparison row per prompt of the three readings that exist today --
//
//   raw   Jev's section pick (VeraSectionCompose.ets) for the request as typed: what the removed blocks path did;
//   plan  the same pick for the request plus the plan DeepSeek drew (Sketch, described by describeSketch);
//   comp  Jev's choices for the plan (VeraCompose.ets readComposition): the composer's parts, and the sections of the
//         plan's `ready` needs: what the agent does now;
//   need  one Jev question per need of the plan (list, countdown, event, ready, other), whose answers include `part`
//         (the screen's own pieces do it) and `none` (nothing ready does it, so it is written): the candidate.
//
// The point of the prototype is to see where they disagree before any pipeline is built on one of them, so a row
// states facts only (kinds, layout, vetoes, what is left over); it does not say which reading is right.
'use strict'
const {loadVera} = require('./source-loader')

const compose = loadVera('VeraCompose')
const sections = loadVera('VeraSectionCompose')

/**
 * The request as the section pick is asked about it when a plan exists: the person's words first, then what the plan
 * says the screen has. The words stay, because the pick's vetoes and its "real data" gate read the request itself.
 */
function alignmentText(prompt, sketch) {
  const plan = compose.describeSketch(sketch)
  return plan.length === 0 ? prompt : prompt + '\n\nThe screen is planned to have:\n' + plan
}

/** What a section pick said, as plain data: the kinds in order, the layout, what fired. */
function describePick(outcome) {
  if (outcome === null || outcome === undefined) return null
  const kinds = outcome.sections === null ? [] : outcome.sections.map(s => s.kind).filter(k => k !== 'none')
  return {
    kinds,
    layout: outcome.layout,
    soft: outcome.softVetoes.slice(),
    realData: outcome.needsRealData,
    weak: outcome.weakKinds.slice(),
    wanted: outcome.wanted,
    // Nothing chosen: the note says why (a hard veto, no answer, nothing above the bar).
    why: kinds.length === 0 ? outcome.note : ''
  }
}

/** What the composition has: the composer's own parts, the catalogue's sections for the ready needs, and what is left over. */
function describeComposition(comp) {
  if (comp === null || comp === undefined) return null
  return {
    parts: compose.compositionParts(comp).map(p => p.kind),
    blocks: comp.blocks.slice(),
    realData: comp.realData,
    // Needs no part and no section does: the model writes them (custom), or the phone is to do them (phone).
    custom: comp.custom.slice(),
    phone: comp.phoneNeeds.slice(),
    unbound: comp.unbound.slice()
  }
}


// ---- alignment per need -------------------------------------------------------------------------------------------------------

/** A section is chosen for a need only when Jev is at least this sure; below it the need is written (the same bar as a section pick). */
const NEED_BAR = 0.5

/** Blocks that can stand on a screen without another: they publish ports at most, and read none from a partner. */
function standaloneKinds() {
  const {fragments} = loadVera('VeraTemplates')
  // filter_box publishes a query but is only useful beside a list.
  return fragments().filter(f => f.ports.every(p => p.dir === 'writes' || p.optional) && f.kind !== 'filter_box').map(f => ({kind: f.kind, criteria: f.criteria}))
}

/**
 * What a plan asks for that is not plainly a part: the list, the countdown or stopwatch, each event and each item of `ready` and
 * `other`. Inputs and figures are always the composer's parts, so they are not asked about.
 */
function needsOf(sketch) {
  const needs = []
  const add = (source, index, text) => { if (text && text.length > 0) needs.push({source, index, text}) }
  if (sketch.list !== null) add('list', 0, 'the person adds entries to a list of ' + sketch.list.label +
    (sketch.list.fields.length ? ', filling in ' + sketch.list.fields.map(f => f.label).join(', ') : ''))
  if (sketch.hasCountdown) add('countdown', 0, 'a countdown: ' + sketch.countdown)
  if (sketch.hasStopwatch) add('stopwatch', 0, 'a stopwatch: ' + sketch.stopwatch)
  sketch.events.forEach((e, i) => add('event', i, 'when ' + e.when + ': ' + e.what))
  sketch.ready.forEach((t, i) => add('ready', i, t))
  sketch.other.forEach((t, i) => add('other', i, t))
  return needs
}

const PART = 'part'
const NONE = 'none'

/** One batched Jev request: one choice per need. */
function buildNeedRequest(prompt, needs) {
  const criteria = {}
  for (const k of standaloneKinds()) criteria[k.kind] = k.criteria
  criteria[PART] = 'the screen\'s own pieces do it: typed inputs, figures worked out from them, a countdown or stopwatch, a list the person adds entries to, a button that makes the phone do something'
  criteria[NONE] = 'no listed part does it'
  const questions = {}
  needs.forEach((n, i) => {
    questions['need.' + i] = {type: 'choice', criteria,
      instructions: 'A person asked for an app. One thing it must do: "' + n.text + '". Which ready-made part of the screen does exactly that on its own, ' +
        'with nothing important missing? Answer part if the screen\'s own pieces do it, none if no listed part does it.'}
  })
  return JSON.stringify({model: 'jev-latest', state: prompt, questions})
}

/** Jev's answers as one decision per need: a section, part, none, or a weak candidate that did not clear the bar. */
function readNeedAnswers(body, needs) {
  let answers = {}
  try { answers = (JSON.parse(body).answers) || {} } catch (_e) { /* no answer: every need is undecided below */ }
  const allowed = standaloneKinds().map(k => k.kind).concat([PART, NONE])
  return needs.map((n, i) => {
    const a = answers['need.' + i]
    const choice = a && typeof a.choice === 'string' && allowed.includes(a.choice) ? a.choice : ''
    const p = a && typeof a.confidence === 'number' ? a.confidence : 1
    let decision = choice === '' ? 'undecided' : choice === PART ? 'part' : choice === NONE ? 'none' : (p >= NEED_BAR ? 'section' : 'weak')
    return Object.assign({}, n, {choice, p, decision})
  })
}

const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i])

/** One row: the three readings, and what differs between them. */
function row(label, prompt, raw, plan, comp, needs = null) {
  const r = describePick(raw), p = describePick(plan), c = describeComposition(comp)
  const notes = []
  if (r !== null && p !== null) {
    if (!same(r.kinds, p.kinds)) notes.push('the plan changes the pick: ' + (r.kinds.join('+') || 'none') + ' -> ' + (p.kinds.join('+') || 'none'))
    if (r.layout !== p.layout) notes.push('layout ' + r.layout + ' -> ' + p.layout)
    if (!same(r.soft, p.soft)) notes.push('vetoes ' + (r.soft.join(',') || '-') + ' -> ' + (p.soft.join(',') || '-'))
  }
  // The reading to hold the composition against: the plan's pick when there is one, else the request's; none when nothing was picked at all.
  const pickKinds = p !== null ? p.kinds : r !== null ? r.kinds : null
  if (c !== null && pickKinds !== null) {
    // Sections the pick names that the composition does not, and the reverse: where the two builders would build different screens.
    for (const k of pickKinds) if (!c.blocks.includes(k)) notes.push('pick has ' + k + ', composition does not')
    for (const k of c.blocks) if (!pickKinds.includes(k)) notes.push('composition has ' + k + ', pick does not')
  }
  if (needs !== null) {
    for (const n of needs) {
      // A section for a need the agent's composition builds with parts (or the reverse) is where the two would build different screens.
      if (n.decision === 'section' && c !== null && !c.blocks.includes(n.choice)) notes.push('need "' + n.text.slice(0, 50) + '": ' + n.choice + ' (' + n.p.toFixed(2) + '), composition does not')
      if (n.decision === 'weak') notes.push('need "' + n.text.slice(0, 50) + '": weak ' + n.choice + ' (' + n.p.toFixed(2) + ') -> written')
      if (n.source === 'ready' && c !== null) {
        const mine = n.decision === 'section' ? n.choice : ''
        const theirs = (comp.readyKinds || [])[n.index] || ''
        if (mine !== theirs) notes.push('ready need "' + n.text.slice(0, 40) + '": need=' + (mine || n.decision) + ' composition=' + (theirs || 'none'))
      }
    }
  }
  return {label, prompt, raw: r, plan: p, comp: c, needs, notes}
}

/** The rows as text, one block per prompt, then the counts. */
function table(rows) {
  const out = []
  const count = {prompts: rows.length, planChanges: 0, disagree: 0, pickOnly: 0, compOnly: 0, leftOver: 0}
  for (const r of rows) {
    out.push(r.label + ': ' + r.prompt.slice(0, 90))
    if (r.raw) out.push('  raw   ' + (r.raw.kinds.join('+') || 'none') + ' [' + r.raw.layout + ']' + (r.raw.soft.length ? ' soft=' + r.raw.soft.join(',') : '') + (r.raw.why ? '  (' + r.raw.why.slice(0, 70) + ')' : ''))
    if (r.plan) out.push('  plan  ' + (r.plan.kinds.join('+') || 'none') + ' [' + r.plan.layout + ']' + (r.plan.soft.length ? ' soft=' + r.plan.soft.join(',') : ''))
    if (r.needs) out.push('  needs ' + (r.needs.length ? r.needs.map(n => n.source + ':' + (n.decision === 'section' || n.decision === 'weak' ? n.decision + ' ' + n.choice + '@' + n.p.toFixed(2) : n.decision)).join(' | ') : '(none)'))
    if (r.comp) out.push('  comp  parts=' + (r.comp.parts.join('+') || '-') + ' blocks=' + (r.comp.blocks.join('+') || '-') +
      (r.comp.custom.length ? ' custom=' + r.comp.custom.length : '') + (r.comp.unbound.length ? ' UNBOUND=' + r.comp.unbound.join('; ') : ''))
    for (const n of r.notes) out.push('  ! ' + n)
    if (r.notes.some(n => n.startsWith('the plan changes'))) count.planChanges++
    if (r.notes.some(n => n.includes('composition does not') || n.includes('pick does not'))) count.disagree++
    if (r.notes.some(n => n.includes('composition does not'))) count.pickOnly++
    if (r.notes.some(n => n.includes('pick does not'))) count.compOnly++
    if (r.comp && (r.comp.custom.length || r.comp.phone.length || r.comp.unbound.length)) count.leftOver++
  }
  out.push('', 'prompts ' + count.prompts + ' | the plan changes the pick ' + count.planChanges + ' | pick and composition disagree on sections ' + count.disagree +
    ' (pick-only ' + count.pickOnly + ', composition-only ' + count.compOnly + ') | something left over for the model to write ' + count.leftOver)
  return {text: out.join('\n'), count}
}

module.exports = {NEED_BAR, standaloneKinds, needsOf, buildNeedRequest, readNeedAnswers, alignmentText, describePick, describeComposition, row, table, compose, sections}
