/**
 * Which builder makes a new screen, the same for the Generate screen and the chat: the agent (VeraAgent.ets), then the whole
 * screen as one hole. When neither serves, the screen is not built and the outcome says why: the route itself never generates
 * from scratch, and neither does a caller: the Generate screen and the chat both show the reason. The caller turns the outcome into its
 * own state; this file decides nothing about pages.
 *
 * The agent chooses among the composer's parts and the catalogue's sections together (VeraCompose.ets's chooseSections, AgentAlign.ets),
 * so there is no second planner behind it: a separate pick of sections and a layout from the request alone (the blocks pipeline, removed)
 * used to follow the agent and was never the one that served -- none of 121 prompts, none of 22 on the merged choice.
 *
 * When no part of the screen can be built from what is ready, the hole widens to the whole screen: the model writes it
 * as one section against the agent's plan of it, looked up and checked the same way (AgentHole.ets), and Jev reads it
 * against everything the plan says the screen does. Only then does the route return OUTCOME_NOT_BUILT. Never throws.
 */

import { AgentHost } from './AgentHost'
import { AgentRequest, AgentResult, runAgent } from './VeraAgent'
import { writeHole } from './AgentHole'
import { assemblePlan, ScreenPlan } from '../ScreenPlan'
import { wholeScreenPlan, sketchConstants } from '../VeraCompose'
import { settleProgram } from './AgentRepair'
import { compositionFromPlan, rebuilds } from '../VeraComposition'
import { addStage, WHO_MODEL, WHO_PHONE } from '../RunStages'
import { toolCount, toolSpanSince } from '../ToolLog'

/** The agent's program is the result. */
export const OUTCOME_AGENT: string = 'agent'
/**
 * Nothing served: the screen is not built, and `reason` says why. The route does not generate, and nor does the caller: the chat and
 * the Generate screen both show the reason as an error.
 */
export const OUTCOME_NOT_BUILT: string = 'not-built'
export const OUTCOME_CANCELLED: string = 'cancelled'

/** The whole screen as one hole before any generation; `--ps veraWhole 0` turns it off, for comparison. */
let wholeScreen: boolean = true
export function setWholeScreenEnabled(on: boolean): void { wholeScreen = on }
export function wholeScreenEnabled(): boolean { return wholeScreen }

export class RouteRequest {
  /** What the agent builds from; null when the agent is not to be tried. */
  agent: AgentRequest | null = null
  /** The Generate screen's generation mode; the chat is always 'deepseek'. */
  mode: string = 'deepseek'
}

export class RouteOutcome {
  kind: string = OUTCOME_NOT_BUILT
  /** The agent's answer when it ran, served or not. */
  agent: AgentResult | null = null
  /** Why nothing was built, for the person to see: what the agent said; '' when something was. */
  reason: string = ''
}

/**
 * The whole screen as one hole, against the agent's sketch of it (or the request alone when there is none): true when
 * it served, with the agent's result then holding the program.
 */
async function writeWholeScreen(request: RouteRequest, host: AgentHost, outcome: RouteOutcome): Promise<boolean> {
  let agent = outcome.agent
  if (!wholeScreen || request.agent === null || agent === null || request.mode !== 'deepseek') { return false }
  let prompt = request.agent!.prompt
  let sketch = agent!.composed.parsed
  let plan: ScreenPlan
  if (sketch !== null) {
    plan = wholeScreenPlan(sketch!, request.agent!.widget)
  } else {
    plan = new ScreenPlan()
    plan.widget = request.agent!.widget
    plan.globals.set('__HEADER_STYLE__', 'none')
    plan.addToWrite('screen.0', 'everything the request asks', true)
  }
  plan.prompt = prompt
  host.status('Writing the whole screen...')
  let facts: string[] = sketch !== null ? sketchConstants(sketch!) : []
  if (plan.widget) { facts.push('This is a small widget inside a chat reply: no header of its own, at most two sections, compact') }
  let writeStart = Date.now()
  let writeTools = toolCount()
  let written = await writeHole(plan, prompt, [], host, facts)
  let wrote = Date.now() - writeStart
  let lookups = Math.min(toolSpanSince(writeTools), wrote)
  addStage(agent!.stages, 'Looking up phone functions', WHO_PHONE, lookups, 'before the model writes')
  addStage(agent!.stages, 'Model writes the whole screen', WHO_MODEL, wrote - lookups,
    written !== null ? written.attempts.toString() + ' attempt(s)' : '')
  agent!.whole = written
  if (written === null || written.section === null) {
    agent!.note += '; whole screen: ' + (written !== null ? written.failed : 'nothing to write')
    return false
  }
  let settleStart = Date.now()
  let settled = await settleProgram(assemblePlan(plan), prompt, host)
  addStage(agent!.stages, 'Compile and run once', WHO_PHONE, settled.checkMs)
  addStage(agent!.stages, 'Repair by edits', WHO_MODEL, Date.now() - settleStart - settled.checkMs)
  agent!.checkMs += settled.checkMs
  if (settled.repair !== null) { agent!.repair = settled.repair }
  agent!.note += settled.note
  if (settled.errors.length > 0) {
    agent!.note += '; whole screen: ' + settled.errors
    return false
  }
  agent!.vbc2 = settled.vbc2
  agent!.source = settled.source
  agent!.composed.source = settled.source
  agent!.errors = ''
  agent!.screen = plan
  // The whole screen is one written section: a record of it lets a section be added beside it, or it be taken away.
  let record = compositionFromPlan(plan, prompt, [], [])
  agent!.record = settled.repair === null && rebuilds(record, settled.source) ? record : null
  agent!.note += '; whole screen written in ' + written.attempts.toString() + ' attempt(s)'
  return true
}

export async function buildScreen(request: RouteRequest, host: AgentHost): Promise<RouteOutcome> {
  let outcome = new RouteOutcome()
  if (host.cancelled()) { outcome.kind = OUTCOME_CANCELLED; return outcome }
  if (request.agent !== null) {
    let result = await runAgent(request.agent!, host)
    outcome.agent = result
    if (host.cancelled()) { outcome.kind = OUTCOME_CANCELLED; return outcome }
    if (result.vbc2.length > 0) { outcome.kind = OUTCOME_AGENT; return outcome }
  }
  if (await writeWholeScreen(request, host, outcome)) {
    outcome.kind = host.cancelled() ? OUTCOME_CANCELLED : OUTCOME_AGENT
    return outcome
  }
  if (host.cancelled()) { outcome.kind = OUTCOME_CANCELLED; return outcome }
  outcome.kind = OUTCOME_NOT_BUILT
  outcome.reason = notBuiltReason(outcome)
  return outcome
}

/** What the agent said, for a screen it did not build. */
function notBuiltReason(outcome: RouteOutcome): string {
  if (outcome.agent === null) { return 'nothing was tried' }
  return 'agent: ' + (outcome.agent!.note.length > 0 ? outcome.agent!.note : 'no answer')
}
