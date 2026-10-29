/**
 * The tool calls of a run, for the Metrics tab: the lookups the app wrote itself (find_sdk_function, find_intent_function,
 * find_ui_component and web_search), whoever made them -- the model in its own tool rounds, or the sections' fill for a hole
 * that may call the phone and for a search that grounds a screen. Each call says how long it took and what it found. Cleared
 * when a run starts.
 */

export class ToolCall {
  tool: string = ''
  /** What was asked for: the need or the search query. */
  query: string = ''
  /** When the call started (Date.now()): calls that overlap are one wait, not their sum. */
  at: number = 0
  ms: number = 0
  ok: boolean = true
  /** What came of it, in a few words: 'found 5 via embedding', 'no results', 'HTTP 429'. */
  note: string = ''
}

let calls: ToolCall[] = []

export function resetToolLog(): void { calls = [] }

export function noteTool(tool: string, query: string, ms: number, ok: boolean, note: string): void {
  let call = new ToolCall()
  call.tool = tool
  call.query = query.length > 120 ? query.substring(0, 120) : query
  call.ms = Math.round(ms)
  call.at = Date.now() - call.ms
  call.ok = ok
  call.note = note.length > 140 ? note.substring(0, 140) : note
  calls.push(call)
}

/** The calls of this run, oldest first. */
export function toolCalls(): ToolCall[] {
  let out: ToolCall[] = []
  for (let c of calls) {
    let copy = new ToolCall()
    copy.tool = c.tool
    copy.query = c.query
    copy.at = c.at
    copy.ms = c.ms
    copy.ok = c.ok
    copy.note = c.note
    out.push(copy)
  }
  return out
}

/** Per tool: how many calls and how long they took, in the order each was first called. */
export class ToolTotal {
  tool: string = ''
  count: number = 0
  failed: number = 0
  ms: number = 0
}

export function toolTotals(list: ToolCall[]): ToolTotal[] {
  let out: ToolTotal[] = []
  for (let c of list) {
    let at = out.findIndex((t: ToolTotal): boolean => t.tool === c.tool)
    if (at < 0) {
      let t = new ToolTotal()
      t.tool = c.tool
      out.push(t)
      at = out.length - 1
    }
    out[at].count++
    if (!c.ok) { out[at].failed++ }
    out[at].ms += c.ms
  }
  return out
}

/** How many calls are logged: a mark to measure from. */
export function toolCount(): number { return calls.length }

/**
 * How long the lookups made since `from` (a toolCount() taken earlier) kept something waiting: the union of their time spans, so
 * calls that ran together count once and a pause between two of them does not count at all. The web search is left out, which
 * has a stage of its own.
 */
export function toolSpanSince(from: number): number {
  let spans: number[][] = []
  for (let i = from; i < calls.length; i++) {
    if (calls[i].tool !== 'web_search') { spans.push([calls[i].at, calls[i].at + calls[i].ms]) }
  }
  spans.sort((a: number[], b: number[]): number => a[0] - b[0])
  let total = 0
  let from_ = 0
  let to = 0
  let open = false
  for (let sp of spans) {
    if (!open) {
      from_ = sp[0]
      to = sp[1]
      open = true
    } else if (sp[0] <= to) {
      if (sp[1] > to) { to = sp[1] }
    } else {
      total += to - from_
      from_ = sp[0]
      to = sp[1]
    }
  }
  if (open) { total += to - from_ }
  return total
}

export function toolMs(list: ToolCall[]): number {
  let n = 0
  for (let c of list) { n += c.ms }
  return n
}
