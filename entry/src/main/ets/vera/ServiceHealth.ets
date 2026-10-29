/**
 * Whether the services a run depends on answered: Jev (Typesafe), Exa (the web search) and DeepSeek. Each call that goes out
 * says how it ended; the Metrics tab reads the tally at the bottom, so a run that was slow or fell back because a service
 * did not answer can be told from one that was slow for its own reasons. The tally is of one run: the page clears it when a
 * run starts.
 */

export const SERVICE_JEV: string = 'Jev'
export const SERVICE_EXA: string = 'Exa'
export const SERVICE_DEEPSEEK: string = 'DeepSeek'

export class ServiceNote {
  service: string = ''
  answered: number = 0
  failed: number = 0
  /** What the last failure said, in a few words: 'HTTP 451 Typesafe is not available in your region', 'timed out'. */
  lastError: string = ''
  constructor(service: string) { this.service = service }
}

let notes: ServiceNote[] = []

export function resetServiceHealth(): void { notes = [] }

/** Says how one call ended. `detail` is what to show when it failed. */
export function noteService(service: string, ok: boolean, detail: string = ''): void {
  let at = notes.findIndex((n: ServiceNote): boolean => n.service === service)
  if (at < 0) {
    notes.push(new ServiceNote(service))
    at = notes.length - 1
  }
  if (ok) {
    notes[at].answered++
  } else {
    notes[at].failed++
    notes[at].lastError = detail.length > 90 ? detail.substring(0, 90) : detail
  }
}

/** What an HTTP answer that was not 200 said: 'HTTP 451 Typesafe is not available in your region'. */
export function httpFailure(code: number, body: string): string {
  let said = ''
  try {
    let parsed = JSON.parse(body) as Record<string, Object>
    let title = parsed['title']
    let message = parsed['message']
    let error = parsed['error']
    if (typeof title === 'string') { said = title as string }
    else if (typeof message === 'string') { said = message as string }
    else if (typeof error === 'string') { said = error as string }
    else if (error !== undefined && error !== null && typeof error === 'object') {
      let inner = (error as Record<string, Object>)['message']
      if (typeof inner === 'string') { said = inner as string }
    }
  } catch (_e) {
    said = ''
  }
  return 'HTTP ' + code.toString() + (said.length > 0 ? ' ' + said : '')
}

/** The tally, one note per service that was called, in the order they were first called. */
export function serviceNotes(): ServiceNote[] {
  let out: ServiceNote[] = []
  for (let n of notes) {
    let copy = new ServiceNote(n.service)
    copy.answered = n.answered
    copy.failed = n.failed
    copy.lastError = n.lastError
    out.push(copy)
  }
  return out
}

/** True when the service answered nothing in this run. */
export function silent(n: ServiceNote): boolean { return n.answered === 0 && n.failed > 0 }

/** One line: 'Jev: no answer, 3 of 3 calls failed (HTTP 451 ...)'; 'DeepSeek: answered 4 calls'. */
export function describeService(n: ServiceNote): string {
  let calls = n.answered + n.failed
  if (n.failed === 0) { return n.service + ': answered ' + n.answered.toString() + ' call(s)' }
  let head = silent(n) ? n.service + ': NO ANSWER, ' : n.service + ': answered ' + n.answered.toString() + ', '
  return head + n.failed.toString() + ' of ' + calls.toString() + ' call(s) failed' + (n.lastError.length > 0 ? ' (' + n.lastError + ')' : '')
}

