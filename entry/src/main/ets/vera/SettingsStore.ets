/**
 * Device-local settings: the cloud API key, the model to call and where to call it.
 *
 * The key is written by EntryAbility from a launch parameter, so it never has
 * to be typed on the phone:
 *
 *   hdc shell aa start -a EntryAbility -b com.vera.probe.dyn \
 *     --ps deepseekKey sk-...
 *
 * `cloudKey` is a provider-neutral alias for the same stored key, for when the
 * provider is not DeepSeek:
 *
 *   hdc shell aa start -a EntryAbility -b com.vera.probe.dyn \
 *     --ps cloudKey sk-... --ps apiBase https://api.openai.com/v1 --ps apiModel gpt-4o
 *
 * `apiBase` and `apiModel` override the DeepSeek defaults and persist like the
 * key, so a provider switch survives restarts without a rebuild. The engine is
 * OpenAI-compatible chat-completions: it POSTs {apiBase}/chat/completions with a
 * Bearer key, so any endpoint that speaks that shape works. DeepSeek-specific
 * request fields (thinking, reasoning_effort) are sent only when isDeepSeek()
 * says the configured base URL is DeepSeek's -- otherwise they are omitted, so a
 * standard OpenAI-compatible provider does not receive fields it does not know.
 *
 * It lives in the app sandbox ({filesDir}/vera/settings.json), not in the HAP
 * and not in this repository. Only maskedKey() is ever shown or logged.
 */

import fs from '@ohos.file.fs'

export const DEFAULT_DEEPSEEK_BASE_URL: string = 'https://api.deepseek.com'
export const DEFAULT_DEEPSEEK_MODEL: string = 'deepseek-flash'
/**
 * reasoning_effort when none is set. On the generation benchmark (5 prompts x 3
 * runs) 'low' cut reasoning from 185k to 124k tokens and total time by a fifth
 * against the API's default, with the same first-attempt compile rate once the
 * compiler's assignment check was fixed.
 */
export const DEFAULT_REASONING_EFFORT: string = 'low'

function readText(path: string): string {
  try {
    let stat = fs.statSync(path)
    if (stat.size === 0) { return '' }
    return fs.readTextSync(path)
  } catch (_e) {
    return ''
  }
}

function writeText(path: string, content: string): void {
  let file: fs.File | null = null
  let failed = false
  try {
    file = fs.openSync(path, fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC)
    fs.writeSync(file.fd, content)
  } catch (e) {
    failed = true
    throw e as Error
  } finally {
    if (file !== null) {
      try {
        fs.closeSync(file)
      } catch (e) {
        if (!failed) { throw e as Error }
      }
    }
  }
}

export class SettingsStore {
  private root: string = ''
  private apiKey: string = ''
  private model: string = DEFAULT_DEEPSEEK_MODEL
  private baseUrl: string = DEFAULT_DEEPSEEK_BASE_URL
  /**
   * Where vera-server lives, for the Server generation mode.
   *
   * There is no default. It used to be one person's machine written into the
   * source -- a bare address that meant nothing to anyone else and had no
   * business in a shared repository. Supply it the way the key is supplied and
   * it is remembered; leave it out and Server mode simply says it is not
   * configured.
   */
  private serverUrl: string = ''
  /**
   * The TypeSafe key, for the step that picks which intents a request needs.
   *
   * Supplied like the others -- `--ps typesafeKey ...` -- and optional in a way
   * the DeepSeek key is not: without it the whole intent catalogue goes into
   * the prompt, which is what happened before there was a selection step.
   */
  private selectorKey: string = ''
  /**
   * The Exa key, for the chat's web search. Supplied like the others,
   * `--ps exaKey ...`; without it the assistant simply has no search tool.
   */
  private exaKey: string = ''
  /**
   * DeepSeek's reasoning_effort for requests with thinking on; '' means
   * DEFAULT_REASONING_EFFORT. Supplied as `--ps reasoningEffort high` (EntryAbility).
   */
  private reasoningEffort: string = ''
  private loaded: boolean = false

  init(filesDir: string): void {
    this.root = filesDir + '/vera'
    try { fs.mkdirSync(this.root, true) } catch (_e) {}
    this.load()
  }

  isReady(): boolean { return this.root.length > 0 }

  private path(): string { return this.root + '/settings.json' }

  private load(): void {
    let text = readText(this.path())
    if (text.length > 0) {
      try {
        let obj = JSON.parse(text) as Record<string, Object>
        this.apiKey = (obj['apiKey'] as string) || ''
        this.model = (obj['model'] as string) || DEFAULT_DEEPSEEK_MODEL
        this.baseUrl = (obj['baseUrl'] as string) || DEFAULT_DEEPSEEK_BASE_URL
        this.serverUrl = (obj['serverUrl'] as string) || ''
        this.selectorKey = (obj['selectorKey'] as string) || ''
        this.exaKey = (obj['exaKey'] as string) || ''
        this.reasoningEffort = (obj['reasoningEffort'] as string) || ''
      } catch (_e) {}
    }
    this.loaded = true
  }

  private save(): void {
    if (this.root.length === 0) { return }
    let obj: Record<string, Object> = {}
    obj['apiKey'] = this.apiKey
    obj['model'] = this.model
    obj['baseUrl'] = this.baseUrl
    obj['serverUrl'] = this.serverUrl
    obj['selectorKey'] = this.selectorKey
    obj['exaKey'] = this.exaKey
    obj['reasoningEffort'] = this.reasoningEffort
    try { writeText(this.path(), JSON.stringify(obj)) } catch (_e) {}
  }

  getApiKey(): string {
    if (!this.loaded) { this.load() }
    return this.apiKey
  }

  hasApiKey(): boolean { return this.getApiKey().length > 0 }

  getServerUrl(): string {
    if (!this.loaded) { this.load() }
    return this.serverUrl
  }

  hasServerUrl(): boolean { return this.getServerUrl().length > 0 }

  setServerUrl(url: string): void {
    if (!this.loaded) { this.load() }
    this.serverUrl = url
    this.save()
  }

  getSelectorKey(): string {
    if (!this.loaded) { this.load() }
    return this.selectorKey
  }

  hasSelectorKey(): boolean { return this.getSelectorKey().length > 0 }

  getExaKey(): string {
    if (!this.loaded) { this.load() }
    return this.exaKey
  }

  hasExaKey(): boolean { return this.getExaKey().length > 0 }

  getReasoningEffort(): string {
    if (!this.loaded) { this.load() }
    return this.reasoningEffort.length > 0 ? this.reasoningEffort : DEFAULT_REASONING_EFFORT
  }

  setReasoningEffort(effort: string): void {
    if (!this.loaded) { this.load() }
    this.reasoningEffort = effort.trim()
    this.save()
  }

  setExaKey(key: string): void {
    if (!this.loaded) { this.load() }
    this.exaKey = key.trim()
    this.save()
  }

  setSelectorKey(key: string): void {
    if (!this.loaded) { this.load() }
    this.selectorKey = key.trim()
    this.save()
  }

  setApiKey(key: string): void {
    this.apiKey = key.trim()
    this.save()
  }

  getModel(): string {
    if (!this.loaded) { this.load() }
    return this.model.length > 0 ? this.model : DEFAULT_DEEPSEEK_MODEL
  }

  setModel(model: string): void {
    this.model = model.trim()
    this.save()
  }

  getBaseUrl(): string {
    if (!this.loaded) { this.load() }
    return this.baseUrl.length > 0 ? this.baseUrl : DEFAULT_DEEPSEEK_BASE_URL
  }

  setBaseUrl(url: string): void {
    if (!this.loaded) { this.load() }
    this.baseUrl = url.trim()
    this.save()
  }

  /**
   * Whether the active model speaks DeepSeek's request dialect -- the
   * `thinking` ({type: enabled|disabled}) and `reasoning_effort` fields a plain
   * OpenAI-compatible endpoint does not know. The request builders send those
   * only when this is true.
   *
   * True when the base URL is DeepSeek's own endpoint OR when the model name is
   * a DeepSeek model: dashscope serves deepseek-v4-flash-0731 and
   * deepseek-v4.1-flash-1017 through its OpenAI-compatible endpoint, and those
   * models accept the same DeepSeek fields as api.deepseek.com does -- so the
   * original DeepSeek configuration is reused for them regardless of which
   * endpoint fronts the call. Detected from host + model rather than a separate
   * flag so that pointing `apiBase`/`apiModel` elsewhere switches the dialect by
   * itself, with no extra launch parameter to forget.
   */
  isDeepSeek(): boolean {
    if (this.getBaseUrl().indexOf('deepseek.com') >= 0) { return true }
    return this.getModel().toLowerCase().indexOf('deepseek') >= 0
  }

  /**
   * A short, human-friendly name for the configured cloud provider, derived from
   * the base URL host so the Generate UI's mode chip shows what is actually
   * configured (e.g. "DashScope", "OpenAI") rather than the hardcoded
   * "DeepSeek" the cloud path used to say. Falls back to the bare host when no
   * known host matches, so a self-hosted or uncommon endpoint still reads as
   * itself rather than as someone else.
   */
  providerLabel(): string {
    let url = this.getBaseUrl()
    if (url.indexOf('deepseek.com') >= 0) { return 'DeepSeek' }
    if (url.indexOf('dashscope.aliyuncs.com') >= 0 || url.indexOf('aliyuncs.com') >= 0) { return 'DashScope' }
    if (url.indexOf('api.openai.com') >= 0) { return 'OpenAI' }
    if (url.indexOf('bigmodel.cn') >= 0) { return 'GLM' }
    if (url.indexOf('api.anthropic.com') >= 0) { return 'Anthropic' }
    // Bare host, stripped of scheme and path, for anything not recognised above.
    let host = url
    let scheme = host.indexOf('://')
    if (scheme >= 0) { host = host.substring(scheme + 3) }
    let slash = host.indexOf('/')
    if (slash >= 0) { host = host.substring(0, slash) }
    if (host.startsWith('api.')) { host = host.substring(4) }
    if (host.startsWith('www.')) { host = host.substring(4) }
    return host.length > 0 ? host : 'Cloud'
  }

  /** 'sk-...abcd' — enough to tell whether the key arrived, useless if leaked. */
  maskedKey(): string {
    let key = this.getApiKey()
    if (key.length === 0) { return '(no key)' }
    if (key.length <= 7) { return 'sk-...' }
    return key.substring(0, 3) + '...' + key.substring(key.length - 4)
  }
}

export const settings: SettingsStore = new SettingsStore()
