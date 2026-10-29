/**
 * The app's AgentHost: the DeepSeek engine for the plan and the sections, the TypeSafe key for Jev, Exa for searches, and
 * the phone's own lookups (the find_intent_function and find_sdk_function tools generation uses) for what the phone does.
 */

import { AgentHost, HoleRecord } from './AgentHost'
import { BlockRequest, BlockFill, fillSections } from '../SectionFill'
import { appBlockCalls } from '../SectionFillApp'
import { askJev } from '../VeraCompose'
import { deepseek, discoveryToolResult } from '../DeepSeekEngine'
import { settings } from '../SettingsStore'
import { trace } from '../VeraTiming'


/** `language` is the skill prompt the page generates with (UI catalogue spliced in), for a custom section; '' for none. */
export function appAgentHost(status: (text: string) => void, preview: (vbc2: string) => void,
    cancelled: () => boolean = (): boolean => false, language: string = ''): AgentHost {
  let host = new AgentHost()
  host.askPlan = (system: string, user: string, onText: (soFar: string) => void, think: boolean): Promise<string | null> =>
    deepseek.extractSketch(system, user, onText, think)
  host.askJev = (body: string): Promise<string> => askJev(body, settings.getSelectorKey())
  host.fillBlocks = (request: BlockRequest): Promise<BlockFill> => fillSections(request, appBlockCalls(settings.hasExaKey()))
  host.language = language
  host.askCode = (system: string, user: string, budget: number, think: boolean): Promise<string | null> =>
    deepseek.extractTemplateContent(system, user, budget, think ? 'A section of its own, thinking' : 'A section of its own', think)
  host.lookup = async (need: string): Promise<string> => {
    let asked = need.substring(0, 300)
    return 'find_intent_function:\n' + (await discoveryToolResult('find_intent_function', asked, 0, true)) +
      '\nfind_sdk_function:\n' + (await discoveryToolResult('find_sdk_function', asked, 0))
  }
  host.onHole = (r: HoleRecord): void => {
    let fields: Record<string, Object> = {}
    fields['prompt'] = r.prompt
    fields['origin'] = r.origin
    fields['whole'] = r.whole
    fields['needs'] = r.needs
    fields['phone'] = r.phone
    fields['outcome'] = r.outcome
    fields['attempts'] = r.attempts
    fields['thought'] = r.thought
    fields['ms'] = r.ms
    fields['missed'] = r.missed
    fields['why'] = r.why
    fields['code'] = r.code
    fields['lookup'] = r.lookup
    trace('hole', fields)
  }
  host.status = status
  host.preview = preview
  host.cancelled = cancelled
  return host
}
