// The second opinion on a weak pick: Jev's weak candidates are reported, a confirmed one is built as if it had cleared
// the bar, the model's answer is read strictly (only named candidates, anything odd confirms nothing). No network.
'use strict'
const assert = require('node:assert/strict')
const {loadVera} = require('./source-loader')
const {readSectionPick, buildSectionRequest} = loadVera('VeraSectionCompose')
const {layoutKinds} = loadVera('VeraLayouts')
const {fragments} = loadVera('VeraTemplates')
const {readVerifyAnswer, buildVerifyUser} = loadVera('VeraPickVerify')

function body(sections, vetoes = {}, extra = {}) {
  const answers = {}
  sections.forEach(([k, c], i) => { answers['section' + (i + 1)] = {choice: k, confidence: c} })
  for (let i = sections.length; i < 6; i++) answers['section' + (i + 1)] = {choice: 'none', confidence: 0.6}
  const keys = ['needs_integration', 'needs_real_data', 'needs_search_or_form', 'needs_live_ticking', 'needs_multiple_counters', 'needs_multiple_series', 'needs_logic']
  keys.forEach(k => { answers['veto.' + k] = {noul: vetoes[k] === undefined ? 0 : vetoes[k]} })
  Object.assign(answers, extra)
  return JSON.stringify({answers})
}
const kinds = o => o.sections.map(s => s.kind).filter(k => k !== 'none')

// the shape of "List for 10 people for birthday cake": checklist 0.30, nothing else
let weak = readSectionPick(body([['checklist', 0.30], ['none', 0.5]]))
assert.equal(weak.sections, null); assert.deepEqual(weak.weakKinds, ['checklist'])
// below the weak floor is not a candidate
assert.deepEqual(readSectionPick(body([['checklist', 0.20]])).weakKinds, [])
// several sections naming the same or different weak kinds: distinct, in section order
assert.deepEqual(readSectionPick(body([['checklist', 0.3], ['note', 0.4], ['checklist', 0.45]])).weakKinds, ['checklist', 'note'])
// a strong pick leaves nothing weak and is untouched
let strong = readSectionPick(body([['checklist', 0.8]]))
assert.deepEqual(kinds(strong), ['checklist']); assert.deepEqual(strong.weakKinds, [])
// a hard veto reports nothing weak: it must not be second-guessed
let vetoed = readSectionPick(body([['checklist', 0.3]], {needs_integration: 0.95}))
assert.equal(vetoed.sections, null); assert.deepEqual(vetoed.weakKinds, [])
// confirmed: built as picked; an unconfirmed other kind stays out
let confirmed = readSectionPick(body([['checklist', 0.3], ['note', 0.4]]), ['checklist'])
assert.deepEqual(kinds(confirmed), ['checklist']); assert.deepEqual(confirmed.weakKinds, [])
// confirming a kind that was never a candidate changes nothing
assert.equal(readSectionPick(body([['checklist', 0.3]]), ['timeline']).sections, null)
// a confirmed kind below the weak floor is still not picked
assert.equal(readSectionPick(body([['checklist', 0.1]]), ['checklist']).sections, null)

// the model's answer
const cand = ['checklist', 'note']
assert.deepEqual(readVerifyAnswer('{"confirm": ["checklist"], "missing": ""}', cand).confirmed, ['checklist'])
assert.deepEqual(readVerifyAnswer('```json\n{"confirm": ["note", "checklist", "note"], "missing": "x"}\n```', cand).confirmed, ['note', 'checklist'])
assert.deepEqual(readVerifyAnswer('{"confirm": ["timeline", "key_facts"]}', cand).confirmed, [], 'only named candidates')
assert.deepEqual(readVerifyAnswer('{"confirm": "checklist"}', cand).confirmed, [], 'not an array')
assert.deepEqual(readVerifyAnswer('sure, the checklist is fine', cand).confirmed, [], 'prose')
assert.deepEqual(readVerifyAnswer('', cand).confirmed, [])
assert.equal(readVerifyAnswer('{"confirm": [], "missing": "  scaling by the number of people  "}', cand).missing, 'scaling by the number of people')
assert.equal(readVerifyAnswer('{"confirm": [], "missing": ' + JSON.stringify('x'.repeat(200)) + '}', cand).missing.length, 80)

// the question names the request and each candidate's criteria text
const user = buildVerifyUser('List for 10 people for birthday cake', ['checklist', 'nonsense'])
assert.match(user, /^Request: List for 10 people for birthday cake/); assert.match(user, /- checklist: /); assert.doesNotMatch(user, /nonsense/)

// the yes/no "does the request ask for this block" rescue: nothing cleared a section bar, one block clears its own question
const yes = p => ({noul: p})
let r = readSectionPick(body([['checklist', 0.30]], {}, {'include.checklist': yes(0.6)}))
assert.deepEqual(kinds(r), ['checklist']); assert.match(r.note, /section1=checklist\(wanted 0\.60\)/); assert.deepEqual(r.weakKinds, [])
r = readSectionPick(body([['none', 0.5]], {}, {'want.timer': yes(0.7)}))
assert.deepEqual(kinds(r), ['timer'], 'a kind outside every layout is asked as want.*')
r = readSectionPick(body([['none', 0.5]], {}, {'include.checklist': yes(0.55), 'want.timer': yes(0.7), 'include.record_log': yes(0.6)}))
assert.deepEqual(kinds(r), ['timer'], 'the likeliest block wins')
assert.equal(readSectionPick(body([['none', 0.5]], {}, {'include.checklist': yes(0.45)})).sections, null, 'below the bar')
assert.equal(readSectionPick(body([['none', 0.5]], {}, {'include.number_strip': yes(0.95), 'include.progress_line': yes(0.9)})).sections, null, 'a reader does not stand alone')
r = readSectionPick(body([['timeline', 0.8]], {}, {'include.checklist': yes(0.9)}))
assert.deepEqual(kinds(r), ['timeline'], 'a section pick is left alone')
r = readSectionPick(body([['none', 0.5]], {needs_logic: 0.9}, {'include.checklist': yes(0.6)}))
assert.deepEqual(kinds(r), ['checklist']); assert.equal(r.needsLogic, true, 'soft veto: composed, then finished by the model')
r = readSectionPick(body([['none', 0.5]], {needs_integration: 0.95}, {'include.checklist': yes(0.6)}))
assert.equal(r.sections, null, 'a hard veto still rejects a rescued block'); assert.match(r.note, /vetoed needs_integration/)
// the request: every kind is asked once, as include.* for layout kinds and want.* for the others
const asked = Object.keys(JSON.parse(buildSectionRequest('x')).questions)
const inLayout = layoutKinds()
for (const spec of fragments()) {
  assert.equal(asked.includes('include.' + spec.kind), inLayout.includes(spec.kind), spec.kind + ' include')
  assert.equal(asked.includes('want.' + spec.kind), !inLayout.includes(spec.kind), spec.kind + ' want')
}
// the itinerary block already carries stops with several fields (name, minutes, coordinates), so needs_search_or_form is not left
// for the model to finish; a block that does not cover it still is
r = readSectionPick(body([['itinerary', 0.8]], {needs_search_or_form: 0.75}))
assert.deepEqual(kinds(r), ['itinerary']); assert.equal(r.needsLogic, false)
r = readSectionPick(body([['checklist', 0.8]], {needs_search_or_form: 0.75}))
assert.equal(r.needsLogic, true)
console.log('verify-check ok')
