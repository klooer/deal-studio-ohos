// The record of a screen that has blocks outside the catalogue (VeraComposition.ets): the composer's parts, a written section, a
// notice. What the agent and the blocks serve is recorded when, and only when, the record rebuilds exactly that program; an edit
// can add, remove, replace or move the catalogue's blocks and the written ones around the parts, never a part itself.
'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {loadVera} = require('./source-loader')
const {needsOf, asPlan} = require('./needs-lib')
const {AgentHost} = loadVera('agent/AgentHost')
const {AgentRequest, runAgent} = loadVera('agent/VeraAgent')
const {BlockCalls, fillSections} = loadVera('SectionFill')
const rec = loadVera('VeraComposition')
const {compileVeraSource} = loadVera('VeraCompiler')
const {smokeRun} = loadVera('VeraSmoke')

const fixture = (label, file) => fs.readFileSync(path.join(__dirname, 'compose', label, file), 'utf8')
function host(label) {
  const h = new AgentHost()
  h.askPlan = async (s, u, onText) => { const t = asPlan(fixture(label, 'sketch.json')); onText(t); return t }
  h.askJev = async () => fixture(label, 'jev-answer.json')
  // The catalogue's sections filled as the app fills them, with no model to ask: their own defaults.
  const calls = new BlockCalls()
  calls.search = async () => 'No results.'
  h.fillBlocks = request => fillSections(request, calls)
  return h
}
const serve = async label => runAgent(Object.assign(new AgentRequest(), {prompt: label}), host(label))
const runs = source => smokeRun(compileVeraSource(source)) === ''

;(async () => {
  // Every plan the agent serves has a record that rebuilds exactly its program: parts only, parts and a section, a widget.
  const served = []
  for (const label of fs.readdirSync(path.join(__dirname, 'compose'))) {
    const r = await serve(label)
    if (r.vbc2.length === 0) { assert.equal(r.record, null, label + ': nothing served, nothing recorded'); continue }
    assert.notEqual(r.record, null, label + ': ' + r.note)
    assert.equal(rec.composeFrom(r.record), r.source, label + ': the record rebuilds the served program')
    served.push(label)
  }
  for (const label of ['tip', 'egg', 'bmi', 'stopwatch', 'sections-tipping', 'sections-beach']) assert.ok(served.includes(label), label + ' is served and recorded: ' + served.join(','))
  assert.ok(served.includes('sections-tipping') && served.includes('sections-beach'), 'the plans with a section of the catalogue are among them')

  // What it holds: the parts as they are and the section by kind and values.
  const tipping = await serve('sections-tipping')
  assert.deepEqual(tipping.record.blocks.filter(b => b.literal === null).map(b => b.kind), ['key_facts'])
  assert.ok(tipping.record.blocks.filter(b => b.literal !== null).length >= 3, 'the composer\'s parts, as they are')
  assert.deepEqual(tipping.record.targetKinds(), ['key_facts'], 'an edit may point at the section, not at a part')
  assert.ok(tipping.record.blocks.find(b => b.kind === 'key_facts').values.size > 0)

  // The format: the catalogue's blocks alone are the version a record always was; with a block as it is, version 2; both read back to the same program.
  {
    const parts = tipping.record
    const json = rec.compositionToJson(parts)
    assert.equal(JSON.parse(json).v, 2)
    const back = rec.compositionFromJson(json)
    assert.notEqual(back, null)
    assert.equal(rec.composeFrom(back), tipping.source)
    assert.deepEqual(back.kinds(), parts.kinds())
    assert.equal(back.blocks.find(b => b.literal !== null).literal.indexed, false)
    const plain = new rec.Composition()
    plain.blocks.push(new rec.Block('checklist', new Map(), new Map()))
    assert.equal(JSON.parse(rec.compositionToJson(plain)).v, 1)
    // A literal block in a version 1 record is not one this reader understands.
    const v1 = JSON.parse(json); v1.v = 1
    assert.equal(rec.compositionFromJson(JSON.stringify(v1)), null)
    assert.equal(rec.compositionFromJson(JSON.stringify(Object.assign(JSON.parse(json), {v: 3}))), null)
  }

  // Edits on it: a section is added beside the parts, the added block is the catalogue's and the program still runs.
  {
    const base = tipping.record
    const added = rec.applyEdit(base, Object.assign(new rec.CompositionEdit(), {op: rec.OP_ADD, kind: 'note'}))
    assert.notEqual(added, null)
    assert.equal(added.blocks[added.blocks.length - 1].kind, 'note')
    const source = rec.composeFrom(added)
    assert.ok(runs(source), 'the program with a note added runs')
    assert.ok(source.includes('function view('))
    // The section is put on top of everything, parts included: the numbering of the others follows its place.
    const top = rec.applyEdit(base, Object.assign(new rec.CompositionEdit(), {op: rec.OP_TOP, target: 'key_facts'}))
    assert.equal(top.blocks[0].kind, 'key_facts')
    assert.ok(runs(rec.composeFrom(top)), 'moved to the top, it still runs')
    // Taking the section away leaves the parts.
    const removed = rec.applyEdit(base, Object.assign(new rec.CompositionEdit(), {op: rec.OP_REMOVE, target: 'key_facts'}))
    assert.ok(removed !== null && !removed.kinds().includes('key_facts') && runs(rec.composeFrom(removed)))
    // The count of sections that may be added is the catalogue's, not the parts': the screen has more than six blocks already.
    assert.ok(base.blocks.length >= 4)
    let grown = base
    for (const kind of ['note', 'rating', 'spotlight', 'actions', 'progress_goal']) {
      grown = rec.applyEdit(grown, Object.assign(new rec.CompositionEdit(), {op: rec.OP_ADD, kind}))
      assert.notEqual(grown, null, kind + ' was refused though the catalogue has fewer than six')
    }
    assert.equal(grown.catalogueCount(), 6)
    assert.equal(rec.applyEdit(grown, Object.assign(new rec.CompositionEdit(), {op: rec.OP_ADD, kind: 'metrics'})), null, 'a seventh section of the catalogue is too many')
  }

  // Jev may point at the written section and the notice, never at a part: a part named as the target is no edit.
  {
    const c = tipping.record.copy()
    const written = new rec.Block('custom', new Map(), new Map())
    written.literal = c.blocks.find(b => b.literal !== null).literal
    written.literal = Object.assign(Object.create(Object.getPrototypeOf(written.literal)), written.literal, {kind: 'custom', criteria: 'a part written for this request that does: splits the bill'})
    c.blocks.push(written)
    assert.deepEqual(c.targetKinds(), ['key_facts', 'custom'])
    const req = JSON.parse(rec.buildEditRequest('remove the part that splits the bill', c))
    assert.equal(req.questions['edit.target'].criteria.custom, 'a part written for this request that does: splits the bill')
    assert.ok(!('inputs' in req.questions['edit.target'].criteria) && !('figures' in req.questions['edit.target'].criteria))
    const answer = (op, target, kind) => JSON.stringify({answers: {'edit.op': {choice: op, confidence: 0.9}, 'edit.target': {choice: target, confidence: 0.9}, 'edit.kind': {choice: kind, confidence: 0.9}}})
    assert.equal(rec.readEditAnswer(answer('remove_block', 'custom', 'none'), c).target, 'custom')
    assert.equal(rec.readEditAnswer(answer('remove_block', 'figures', 'none'), c).op, 'none', 'a part is not a target')
  }

  // End to end: the structural edit of a served screen, with no model, rebuilds and runs; the one it cannot do goes back to the model.
  {
    const select = async () => Object.assign(new rec.CompositionEdit(), {op: rec.OP_ADD, kind: 'note', note: 'edit=add_block kind=note'})
    const done = await rec.editComposition('add a note', tipping.record, 'server', select)
    assert.equal(done.applied, true, done.note)
    assert.ok(done.source.includes('function view('))
    assert.ok(done.vbc2.length > 0)
    assert.deepEqual(done.composition.kinds().slice(-1), ['note'])
    const none = await rec.editComposition('make it bigger', tipping.record, 'server', async () => new rec.CompositionEdit())
    assert.equal(none.applied, false)
  }

  console.log('record-check: ok (' + served.length + ' served plans)')
})().catch(e => { console.error(e); process.exit(1) })
