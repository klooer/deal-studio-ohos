/**
 * Where the time of a run went, stage by stage, for the Metrics tab and the record kept for the next session (LastRun.ets).
 * A stage is one step of building a screen, with who did the work in it: the model that writes (DeepSeek), Jev, the web
 * search, the phone, or the person answering a question. The person's own time is a stage but not part of the app's time.
 */

export const WHO_MODEL: string = 'Model'
export const WHO_JEV: string = 'Jev'
export const WHO_SEARCH: string = 'Search'
export const WHO_PHONE: string = 'Phone'
export const WHO_YOU: string = 'You'

/** Shorter than this is not worth a row of its own. */
const MIN_STAGE_MS: number = 50

export class Stage {
  name: string = ''
  who: string = ''
  ms: number = 0
  /** What the stage did, in a few words ('3 attempts', 'real data'); '' when there is nothing to add. */
  note: string = ''
  constructor(name: string, who: string, ms: number, note: string = '') {
    this.name = name
    this.who = who
    this.ms = ms
    this.note = note
  }
}

/** Adds a stage unless it took no time at all (a step that was skipped). */
export function addStage(stages: Stage[], name: string, who: string, ms: number, note: string = ''): void {
  if (ms >= MIN_STAGE_MS) { stages.push(new Stage(name, who, Math.round(ms), note)) }
}

/** What the app spent: every stage but the person's own waiting. */
export function appMs(stages: Stage[]): number {
  let n = 0
  for (let s of stages) { if (s.who !== WHO_YOU) { n += s.ms } }
  return n
}

/** The person's own time: waiting for answers to the plan's questions. */
export function yourMs(stages: Stage[]): number {
  let n = 0
  for (let s of stages) { if (s.who === WHO_YOU) { n += s.ms } }
  return n
}

/** Time per party, in the order it is first met: [['Model', 12000], ['Jev', 3000]...]; the person is left out. */
export function byWho(stages: Stage[]): Stage[] {
  let out: Stage[] = []
  for (let s of stages) {
    if (s.who === WHO_YOU) { continue }
    let at = out.findIndex((o: Stage): boolean => o.who === s.who)
    if (at < 0) { out.push(new Stage(s.who, s.who, s.ms)) } else { out[at].ms += s.ms }
  }
  return out
}
