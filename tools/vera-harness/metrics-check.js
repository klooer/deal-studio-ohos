// The figures of the Metrics tab that the app keeps for one run: the stages (RunStages.ets), the lookups (ToolLog.ets) and
// which of Jev, Exa and DeepSeek answered (ServiceHealth.ets). No network.
'use strict'
const assert = require('node:assert/strict')
const {loadVera} = require('./source-loader')

// Stages: a step that took no time has no row; the app's time leaves the person's waiting out; per party, in first-met order.
{
  const st = loadVera('RunStages')
  const stages = []
  st.addStage(stages, 'Plan of needs', st.WHO_MODEL, 4000, 'the request as a list of needs')
  st.addStage(stages, 'Choosing parts and sections', st.WHO_JEV, 1000)
  st.addStage(stages, 'Your answers', st.WHO_YOU, 6000)
  st.addStage(stages, 'Skipped', st.WHO_PHONE, 10)
  st.addStage(stages, 'Looking up real data', st.WHO_SEARCH, 2000)
  st.addStage(stages, 'Compile and run once', st.WHO_PHONE, 3000)
  assert.equal(stages.length, 5, 'a step that took no time has no row')
  assert.equal(st.appMs(stages), 10000); assert.equal(st.yourMs(stages), 6000)
  assert.deepEqual(st.byWho(stages).map(w => [w.who, w.ms]), [['Model', 4000], ['Jev', 1000], ['Search', 2000], ['Phone', 3000]])
  assert.equal(stages[0].note, 'the request as a list of needs')
}

// Services: a tally of who answered, with what the failure said.
{
  const h = loadVera('ServiceHealth')
  h.resetServiceHealth()
  assert.deepEqual(h.serviceNotes(), [])
  h.noteService(h.SERVICE_JEV, false, h.httpFailure(451, '{"title":"Typesafe is not available in your region.","status":451}'))
  h.noteService(h.SERVICE_JEV, false, 'timed out')
  h.noteService(h.SERVICE_DEEPSEEK, true); h.noteService(h.SERVICE_DEEPSEEK, true)
  h.noteService(h.SERVICE_EXA, true); h.noteService(h.SERVICE_EXA, false, h.httpFailure(429, 'not json'))
  const notes = h.serviceNotes()
  assert.deepEqual(notes.map(n => n.service), ['Jev', 'DeepSeek', 'Exa'], 'in the order first called')
  assert.ok(h.silent(notes[0]) && !h.silent(notes[1]) && !h.silent(notes[2]))
  assert.equal(h.describeService(notes[0]), 'Jev: NO ANSWER, 2 of 2 call(s) failed (timed out)')
  assert.equal(h.describeService(notes[1]), 'DeepSeek: answered 2 call(s)')
  assert.equal(h.describeService(notes[2]), 'Exa: answered 1, 1 of 2 call(s) failed (HTTP 429)')
  assert.equal(h.httpFailure(451, '{"title":"Typesafe is not available in your region.","status":451}'), 'HTTP 451 Typesafe is not available in your region.')
  assert.equal(h.httpFailure(500, '<html>'), 'HTTP 500')
  assert.equal(h.httpFailure(401, '{"error":{"message":"bad key"}}'), 'HTTP 401 bad key')
  notes[0].failed = 99; assert.equal(h.serviceNotes()[0].failed, 2, 'the tally handed out is a copy')
  h.resetServiceHealth()
  assert.deepEqual(h.serviceNotes(), [])
}

// Tool calls: logged by whoever makes them, summed per tool.
{
  const t = loadVera('ToolLog')
  t.resetToolLog()
  t.noteTool('find_sdk_function', 'battery level', 340, true, 'found 5 via embedding')
  t.noteTool('web_search', 'x'.repeat(300), 900, false, 'HTTP 429')
  t.noteTool('find_sdk_function', 'vibrate', 60, true, 'found 2 via keywords')
  const calls = t.toolCalls()
  assert.equal(calls.length, 3); assert.equal(calls[1].query.length, 120, 'a long query is cut')
  assert.deepEqual(t.toolTotals(calls).map(x => [x.tool, x.count, x.failed, x.ms]), [['find_sdk_function', 2, 0, 400], ['web_search', 1, 1, 900]])
  assert.equal(t.toolMs(calls), 1300)
  calls[0].ms = 1; assert.equal(t.toolCalls()[0].ms, 340, 'the log hands out a copy')
  t.resetToolLog()
  assert.deepEqual(t.toolCalls(), [])
  // Lookups that ran together are one wait; the web search has its own stage and is left out of the span.
  const mark = t.toolCount()
  const now = Date.now()
  t.noteTool('find_intent_function', 'a', 300, true, '')
  t.noteTool('find_sdk_function', 'a', 200, true, '')
  t.noteTool('web_search', 'q', 5000, true, '')
  const span = t.toolSpanSince(mark)
  assert.ok(span >= 300 && span < 360, 'two calls started together are one wait of about the longer: ' + span)
  assert.equal(t.toolSpanSince(t.toolCount()), 0, 'nothing since the mark')
  t.resetToolLog()
}

// A pause between two lookups is not waiting on one: two calls of 100 ms with 400 ms between them are 200 ms.
;(async () => {
  const t = loadVera('ToolLog')
  t.resetToolLog()
  const mark = t.toolCount()
  t.noteTool('find_sdk_function', 'b', 100, true, '')
  await new Promise(r => setTimeout(r, 400))
  t.noteTool('find_sdk_function', 'c', 100, true, '')
  const gap = t.toolSpanSince(mark)
  assert.ok(gap >= 200 && gap <= 230, 'the pause is not counted: ' + gap)
  t.resetToolLog()
  console.log('metrics-check: ok')
})()
