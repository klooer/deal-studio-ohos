/**
 * The app's calls for filling sections (SectionFill.ets): DeepSeek for the content and the hole bodies, Exa for the search,
 * the phone's own lookup for a hole that may call the phone. The agent makes them.
 */

import { BlockCalls } from './SectionFill'
import { deepseek, discoveryToolResult } from './DeepSeekEngine'
import { webSearch } from './VeraWebSearch'

/** `canSearch` is whether a search can be made at all (an Exa key, and a mode that grounds in one). */
export function appBlockCalls(canSearch: boolean, status: (text: string) => void = (_text: string): void => {},
    cancelled: () => boolean = (): boolean => false): BlockCalls {
  let calls = new BlockCalls()
  if (canSearch) { calls.search = (query: string, chars: number): Promise<string> => webSearch(query, chars) }
  calls.content = (system: string, user: string, budget: number): Promise<string | null> => deepseek.extractTemplateContent(system, user, budget)
  calls.hole = (system: string, user: string): Promise<string | null> =>
    deepseek.extractTemplateContent(system, user, 500, 'Function bodies for the blocks')
  // The same lookup the model's own find_sdk_function tool makes, so a hole copies a real target instead of guessing one.
  calls.sdkContext = async (prompt: string): Promise<string> =>
    (await discoveryToolResult('find_sdk_function', prompt.substring(0, 300), 0)).substring(0, 2500)
  calls.status = status
  calls.cancelled = cancelled
  return calls
}
