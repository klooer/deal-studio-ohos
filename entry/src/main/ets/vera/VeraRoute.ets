/**
 * Which way a request went, in words a person can read on the Generate screen: whether Jev chose blocks and how sure it was,
 * whether a second opinion was asked, and whether the result is blocks alone, blocks the model then finished, or a program the
 * model wrote from scratch. Pure functions over what the pipeline already knows, so the page only prints them.
 */

import { SectionPickOutcome } from './VeraSectionCompose'

export const ROUTE_BLOCKS: string = 'blocks'
export const ROUTE_BLOCKS_MODEL: string = 'blocks+model'
export const ROUTE_SCRATCH: string = 'scratch'

/** What Jev said: a section cleared its bar, it named something below the bar, nothing fits, a veto, or no answer. */
export const JEV_SURE: string = 'sure'
export const JEV_UNSURE: string = 'unsure'
export const JEV_NONE: string = 'none'
export const JEV_VETOED: string = 'vetoed'
export const JEV_UNAVAILABLE: string = 'unavailable'

/** The second look at a weak pick: not needed, a yes/no question about a block, or DeepSeek asked (and how it answered). */
export const CHECK_NONE: string = 'none'
export const CHECK_OFF: string = 'off'
export const CHECK_YESNO: string = 'yesno'
export const CHECK_CONFIRMED: string = 'confirmed'
export const CHECK_REJECTED: string = 'rejected'
export const CHECK_FAILED: string = 'failed'

export class RouteInfo {
  route: string = ROUTE_SCRATCH
  jev: string = ''
  check: string = CHECK_NONE
  /** The blocks that were built (or, for a scratch route, the weak candidates Jev named). */
  kinds: string[] = []
  weak: string[] = []
  /** What DeepSeek said the blocks cannot do. */
  missing: string = ''
  /** The block the yes/no question built and its answer. */
  wanted: string = ''
  wantedP: number = 0
  /** The soft vetoes that sent a composed screen to the model, e.g. "needs_logic=0.99". */
  logic: string = ''
  /** A web search supplied real data for the text. */
  searched: boolean = false
  /** The model wrote function bodies for the blocks (holes). */
  holes: boolean = false
  /** A failure after Jev chose (did not compile, did not run, needs real data and no search): overrides the generic reason. */
  failure: string = ''
  /** Jev's own note, for the reasons that quote it. */
  note: string = ''
}

/** How Jev's answer reads: sure, unsure (named something weakly, or a yes/no question had to decide), nothing fits, a veto, no answer. */
export function jevStateOf(outcome: SectionPickOutcome): string {
  if (outcome.sections === null) {
    let note = outcome.note
    if (note.startsWith('vetoed')) { return JEV_VETOED }
    if (note.indexOf('no key') >= 0 || note.indexOf('unreachable') >= 0 || note.indexOf('selector answered') >= 0 ||
        note.indexOf('unreadable') >= 0 || note.indexOf('no answers') >= 0) { return JEV_UNAVAILABLE }
    return outcome.weakKinds.length > 0 ? JEV_UNSURE : JEV_NONE
  }
  return outcome.wanted.length > 0 ? JEV_UNSURE : JEV_SURE
}

/** The soft vetoes in a Jev note: "logic=needs_logic=0.99,needs_integration=0.5" gives "needs_logic=0.99, needs_integration=0.5". */
export function logicOf(note: string): string {
  let at = note.indexOf('logic=')
  if (at < 0) { return '' }
  let rest = note.substring(at + 'logic='.length)
  let end = rest.indexOf(' ')
  if (end >= 0) { rest = rest.substring(0, end) }
  return rest.split(',').join(', ')
}

/** A soft veto tag in plain words: "needs_integration=0.81" gives "a phone API or another app (0.81)". */
export function vetoWords(tag: string): string {
  let parts = tag.split('=')
  let name = parts[0]
  let words = name
  if (name === 'needs_integration') { words = 'a phone API or another app' }
  else if (name === 'needs_logic') { words = 'calculation or logic' }
  else if (name === 'needs_search_or_form') { words = 'search, filtering or a multi-field form' }
  else if (name === 'needs_live_ticking') { words = 'a live ticking display' }
  else if (name === 'needs_multiple_counters') { words = 'several separate counters' }
  else if (name === 'needs_real_data') { words = 'real data' }
  return parts.length > 1 ? words + ' (' + parts[1] + ')' : words
}

export function routeLabel(info: RouteInfo): string {
  if (info.route === ROUTE_BLOCKS) { return info.searched ? 'Blocks: web search + the model fills in text' : 'Blocks: the model only fills in text' }
  if (info.route === ROUTE_BLOCKS_MODEL) { return 'Blocks, then the model finishes it' }
  // The blocks did not build it: the agent did, or nothing did (there is no generation from scratch after the route).
  return 'Not from blocks'
}

/** The route in one or two words, for a metrics tile. */
export function routeShort(info: RouteInfo): string {
  if (info.route === ROUTE_BLOCKS) { return 'Blocks' }
  if (info.route === ROUTE_BLOCKS_MODEL) { return 'Blocks + model' }
  return 'No blocks'
}

/** The second look in one or two words, for a metrics tile. */
export function checkShort(info: RouteInfo): string {
  if (info.check === CHECK_YESNO) { return 'yes/no' }
  if (info.check === CHECK_CONFIRMED) { return 'confirmed' }
  if (info.check === CHECK_REJECTED) { return 'rejected' }
  if (info.check === CHECK_FAILED) { return 'no answer' }
  if (info.check === CHECK_OFF) { return 'off' }
  return 'not needed'
}

export function jevLabel(info: RouteInfo): string {
  if (info.jev === JEV_SURE) { return 'Jev: chose ' + info.kinds.join(' + ') }
  if (info.jev === JEV_UNSURE) { return 'Jev: unsure' }
  if (info.jev === JEV_NONE) { return 'Jev: nothing fits' }
  if (info.jev === JEV_VETOED) { return 'Jev: vetoed blocks' }
  if (info.jev === JEV_UNAVAILABLE) { return 'Jev: no answer' }
  return ''
}

export function checkLabel(info: RouteInfo): string {
  if (info.check === CHECK_YESNO) { return 'Check: yes/no question picked ' + info.wanted + ' (' + info.wantedP.toFixed(2) + ')' }
  if (info.check === CHECK_CONFIRMED) { return 'Check: the model confirmed ' + info.kinds.join(' + ') }
  if (info.check === CHECK_REJECTED) { return 'Check: the model rejected it' }
  if (info.check === CHECK_FAILED) { return 'Check: the model did not answer' }
  if (info.check === CHECK_OFF) { return 'Check: off' }
  return 'Check: not needed'
}

/** What the model did on a blocks-only route: it wrote no program, but it did fill in text. */
export function whatTheModelDid(info: RouteInfo): string {
  let text = 'The model wrote no program: it only filled in the text'
  if (info.searched) { text = text + ' from a web search for real data' }
  if (info.holes) { text = text + ' and wrote a few small function bodies' }
  return text + '.'
}

/** One or two sentences saying why the route is what it is. */
export function routeWhy(info: RouteInfo): string {
  let built = info.kinds.join(' + ')
  let weak = info.weak.join(', ')
  if (info.route === ROUTE_BLOCKS || info.route === ROUTE_BLOCKS_MODEL) {
    let first = ''
    if (info.jev === JEV_SURE) {
      first = 'Jev was sure: it chose ' + built + '.'
    } else if (info.check === CHECK_CONFIRMED) {
      first = 'Jev was unsure (' + weak + '), the model checked it and confirmed ' + built + '.'
    } else if (info.check === CHECK_YESNO) {
      first = 'Jev was unsure which block, but its yes/no question "does the request ask for ' + info.wanted + '" answered ' +
        info.wantedP.toFixed(2) + ', so ' + built + ' was built.'
    } else {
      first = 'Jev chose ' + built + '.'
    }
    if (info.route === ROUTE_BLOCKS_MODEL) {
      let words: string[] = []
      for (let tag of info.logic.split(', ')) { if (tag.length > 0) { words.push(vetoWords(tag)) } }
      let because = words.length > 0 ? 'the request also needs ' + words.join(' and ') : 'the screen did not cover the request'
      return first + ' Then the model finishes it because ' + because + '.'
    }
    return first + ' ' + whatTheModelDid(info)
  }
  if (info.failure.length > 0) { return info.failure }
  if (info.jev === JEV_VETOED) { return 'Jev vetoed building this from blocks (' + info.note.replace('vetoed ', '') + ').' }
  if (info.jev === JEV_UNAVAILABLE) { return 'Jev did not answer (' + info.note + ').' }
  if (info.jev === JEV_UNSURE) {
    if (info.check === CHECK_REJECTED) {
      return 'Jev was unsure about ' + weak + '. The model checked and rejected it' +
        (info.missing.length > 0 ? ': it cannot do ' + info.missing : '') + '.'
    }
    if (info.check === CHECK_FAILED) { return 'Jev was unsure about ' + weak + ' and the model check did not answer.' }
    if (info.check === CHECK_OFF) { return 'Jev was unsure about ' + weak + ' and the model check is off.' }
    return 'Jev was unsure about ' + weak + '.'
  }
  return 'Jev found no block that fits this request.'
}
