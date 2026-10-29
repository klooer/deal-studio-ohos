// A recorded sketch (compose/<label>/sketch.json) as the needs plan the model would write for it (NeedsPlan.ets): the same facts,
// each under a type, the composer's quantities under their neutral names.
'use strict'
// The quantities under their neutral names, as the needs prompt asks the model to write them.
const NEUTRAL = [['remaining', 'clock.remaining'], ['elapsed', 'clock.elapsed'], ['duration', 'clock.duration'],
  ['entryCount', 'entries.count'], ['entryTotal', 'entries.total']]
const neutral = s => NEUTRAL.reduce((t, [from, to]) => t.replace(new RegExp('\\b' + from + '\\b', 'g'), to), s)

// A recorded sketch as a needs plan: the same facts, each under a type. A need quotes its own words as the request's, unless `quote` is
// false: then `from` is empty, and an empty quote is never dropped as unasked (NeedsPlan.ets's dropUnasked).
function needsOf(old, quote = true) {
  const out = {title: old.title, eyebrow: old.eyebrow, subtitle: old.subtitle, inputs: old.inputs || [], constants: old.constants || [],
    questions: old.questions || [], needs: []}
  for (const v of old.values || []) {
    const n = {type: 'figure', ...v, formula: neutral(v.formula || '')}
    if (v.example && v.example.given) n.example = {...v.example, given: Object.fromEntries(Object.entries(v.example.given).map(([k, x]) => [neutral(k), x]))}
    out.needs.push(n)
  }
  if (old.countdown) out.needs.push({type: 'countdown', ...old.countdown})
  if (old.stopwatch) out.needs.push({type: 'stopwatch', ...old.stopwatch})
  if (old.list) out.needs.push({type: 'entries', ...old.list})
  for (const r of old.ready || []) { const what = typeof r === 'string' ? r : Object.values(r).join('. '); out.needs.push({type: 'content', what, from: quote ? what : ''}) }
  for (const e of old.events || []) out.needs.push({type: 'action', ...e, from: quote ? e.when + ' ' + e.what : '', on: /\bends?\b|zero/.test(e.when) ? 'countdown_end' : /added/.test(e.when) ? 'entry_added' : /\btap/.test(e.when) ? 'row_tap' : 'other'})
  for (const o of old.other || []) out.needs.push({type: 'other', what: o})
  return out
}


// A recorded sketch's text as the text of the needs plan the model would answer with: for a host that stands in for DeepSeek.
const asPlan = text => JSON.stringify(needsOf(JSON.parse(text), false))

module.exports = {needsOf, neutral, asPlan}
