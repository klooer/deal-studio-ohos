# Architecture and generation workflow

How a plain-English prompt becomes a running native ArkUI screen on the phone,
with and without Jev. This document describes the layering, the catalogue, the
plan-of-needs, the two generation paths, and the graceful-degradation guarantees
that hold when Jev is absent. It is the companion to `docs/agent.md`, which is
the shorter operational description; this one is the design and implementation.

## 1. Layering

```
prompt ──► agent route ──► Vera source ──► compiler ──► VM ──► ArkUI (VeraPreview)
              (VeraBuildRoute)    (.vera)   (VeraCompiler)        (renderer)
```

| layer | what it is | where |
|---|---|---|
| **Vera** | the DSL the route emits and the model writes — `ui.*` catalogue calls, `state`, handlers, `intent.call`, `sdk.call` | `docs/examples/shanghai-layover.vera` |
| **VeraCompiler** | parses Vera with recovery, type-checks, emits the VM's program; `compileVeraSource` **throws** `CompileError` carrying `.diagnostics` (it does not return them) | `vera/VeraCompiler.ets` |
| **VM** | runs the compiled program; intent-style targets get real dispatch | `vera/VeraCompiler.ets` (runtime), `vera/VeraVm.ets` |
| **VeraPreview** | renders the running program as native ArkUI; keeps its own hardcoded list of node kinds and **complains on startup if it drifts from the catalogue** | `components/VeraPreview.ets` |
| **ArkTS** | the host language the app itself is written in — compiler, VM, renderer, catalogue. The model and the composer never write ArkTS; they write Vera |

The catalogue is **one pure-data description** (`vera/VeraUiCatalog.ets`). The
compiler interface, the validator and the model's prompt are all generated from
it, so they cannot drift from each other; only the renderer keeps a second list,
and it asserts parity at startup. Adding a component means editing the catalogue,
adding a case in `VeraUi.ets`, and adding a branch in `VeraPreview.ets` — the
compiler, validator and prompt follow from the catalogue on their own.

## 2. The catalogue: sections and parts

A screen is assembled from **blocks**, all in one format, `FragmentSpec`
(`vera/VeraTemplates.ets`): state fields, handlers, a view scaffold
(`sections.push(ui.Section(...))`), and tokens for content, ports and holes.
There are two kinds of block:

- **Sections** — pre-built templates the catalogue owns. There are **29**
  registered in `fragments()` (`VeraTemplates.ets:2422`): checklist, record_log,
  master_list, search_list, detail_view, list_summary, filter_box, bar_chart,
  series_chart, trend_chart, number_strip, breakdown_table, data_table, metrics,
  timer, timeline, itinerary, progress_goal, progress_line, key_facts,
  live_facts, spotlight, note, rating, actions, intent_panel, calendar_event,
  reminders, settle_up. Jev picks among a subset for the needs a section can do
  whole: `READY_KINDS` (10) for ready needs, `LIST_SECTIONS`
  (`record_log, reminders`) for the list, and `timer` for a countdown.
- **Parts** — the composer's own blocks (clock, list, inputs/widgets, computed
  values/formulas, effects). These are **code-assembled** by
  `part(kind, fields, functions, view)` from Jev's per-attribute choices, not
  picked from templates. `compositionParts(comp)` gathers them.

The composer stitches sections + parts into one program with
`assembleProgram(comp)` (`vera/VeraCompose.ets:3763`), which emits the Vera
source. **On the fast path the composer writes the code; the model writes no
whole-program Vera.** The model only fills section text/content (and small
*catalogue holes* — a function body inside a section) and writes the holes
described in §5.

### 2.1 How a part is built

Parts are code-assembled, not template-picked. `part()` (`VeraCompose.ets:2895`)
is a small factory that packages four arrays into a `FragmentSpec`:

```ts
function part(kind: string, fields: Field[], functions: string[], view: string[],
             supportClass: string = '', initStatements: string = ''): FragmentSpec {
  // fields → state fields + init values; functions → handler bodies; view → view lines
  let state: StateFieldSpec[] = []
  let inits: string[] = []
  for (let f of fields) { state.push(new StateFieldSpec(f.name, f.type)); inits.push(f.name + ': ' + f.init) }
  let spec = new FragmentSpec(kind, '', supportClass, state, initStatements,
                              inits.join(', '), functions.join('\n\n'), view.join('\n'), [], [])
  spec.indexed = false   // a part, not a catalogue section
  return spec
}
```

The four inputs map onto the four things a `FragmentSpec` carries: `fields` →
state, `functions` → handlers, `view` → view lines, `kind` → the part's name.
Nothing is filled into a template — the arrays are built in code from the sketch
and Jev's answers.

A family of builders turns a slice of the `Composition` into one part each:

- `figuresPart` (`:3110`) — the `let`-locals every other part draws from (each
  input, the clock's time, the list's count/total, each value's formula), and
  port functions so a catalogue section can read a value through a port.
- `inputsPart` (`:3170`) — one control and one setter per input; **the widget
  Jev chose** (`comp.widgets.get(input.id)`) picks the `ui.*` call (`ui.Select`,
  `ui.Slider`, `ui.Toggle`, `ui.TextField`, …).
- `clockPart` (`:3065`), `listPart` (`:3239`), `effectsPart` (`:3485`) — the
  clock's ticker and start/stop/reset, the list's `LogEntry` class and
  add/remove handlers, and the screen buttons + phone-answer banner.
- `heroPart` (`:3145`), `summaryPart` (`:3227`) — layout only, no state or
  handlers (`part('hero', [], [], view)`).
- `widgetPart` (`:3489`) — the two-section shell for a chat widget.

`compositionParts(comp)` (`:3495`) gathers them in screen order, then does one
deliberate thing: it **empties every part's `viewBlock` and stitches the lines
into one trailing `screen` part**:

```ts
let view: string[] = ['{']
for (let p of parts) {
  for (let line of p.viewBlock.split('\n')) { if (line.length > 0) { view.push('  ' + line) } }
  p.viewBlock = ''
}
view.push('}')
parts.push(part('screen', [], [], view))
```

The `figures` part emits locals (`let duration = …; let tip = …;`) that the
hero, summary and list parts' view lines reference, so they must share one
scope. Folding all view lines into a single `{ … }` block keeps those locals in
scope and out of the way of any catalogue section on the same screen.

`assembleProgram(comp)` (`:3763`) then turns the parts + the catalogue sections
Jev picked (`comp.blocks`) into Vera source:

```ts
export function assembleProgram(comp: Composition, blockValues: Map<string, string>[] = [],
                               custom: FragmentSpec | null = null): string {
  if (comp.unbound.length > 0) { return '' }   // open slot → no program
  return assemblePlan(screenPlan(comp, blockValues, custom), true)
}
```

The guard is the "a plan with an open slot is not served" rule: any unbound
value aborts assembly. `screenPlan` interleaves parts with sections;
`assemblePlan` emits the state block, handlers and the merged view.

So on the fast path the composer writes the code — Jev only decided which
widget, formula, effect and moment goes in each slot; the builders assemble the
strings field by field, handler by handler, `ui.*` call by `ui.*` call.

## 3. Jev

Jev is TypeSafe's System One model (`jev-latest`,
`https://api.typesafe.ai/v1/systemone`), called with a Bearer key — the
**TypeSafe key**, supplied as the `--ps typesafeKey ...` launch parameter and
persisted in `{filesDir}/vera/settings.json` as `selectorKey`
(`vera/SettingsStore.ets`, `EntryAbility.extractSelectorKey`).

Every live Jev call goes through one of two entry points:
**`askJev`** (`vera/VeraCompose.ets:3909`), wired as `host.askJev` in
`agent/AgentAppHost.ets:21`; and **`selectEdit`** (`vera/VeraComposition.ets:446`),
used only on the refine path. Jev is used for, all in the shape *one question per
item, answered with a probability/confidence*:

1. **Composition choices** — the two Jev calls in `composeNeeds`
   (`vera/NeedsChoose.ets`): a **section-or-part** call
   (`buildChooseRequest`) that puts a section and a part side by side for every
   need both can do (the countdown → `timer` section or clock part; the list → a
   `LIST_SECTIONS` section or list part; each ready need → a `READY_KINDS`
   section, or the person's own records), then a **per-attribute** call
   (`buildComposeRequest` in `VeraCompose.ets`) for what is left — a widget for
   each input, a formula for each value, an effect and a moment for each event,
   the theme, and whether a section needs real data.
2. **Questions** (`agent/AgentQuestions.ets`, `askBlocking`) — settles the
   sketch's questions, keeping only those a default cannot stand in for.
3. **Leftover alignment** (`agent/AgentAlign.ets`, `alignLeftovers`) — aligns what
   the agent's sections leave open with the catalogue first, so a detail a section
   already does is not written again.
4. **Slot values** (`buildSlotRequest` in `VeraSectionCompose.ets`, via
   `host.askJev` at `VeraAgent.ets:196`) — reads the values for the blocks'
   slots.
5. **Verification** (`agent/AgentClaims.ets`, `agent/AgentHole.ets`) — Jev reads
   the model-written code against each need: which claimed needs the program does
   not yet do (`claimsUndone`), which open slots the screen already covers
   (`claimsDone`), and the hole's own verify.
6. **Refine** (`vera/VeraComposition.ets`, `selectEdit`) — when an existing
   composition is edited rather than rebuilt from scratch.

**Jev never writes text or code.** It picks among ready-made options the
catalogue or the composer owns. This is the design rule borrowed from
json-render's Jev composer, generalised here to programs with logic: Jev answers
independent questions, the composer assembles the result in code, and nothing
computes until the program runs.

**Jev is not used for intent or SDK function finding.** Which phone intents and
SDK functions a request needs is found by **embeddings**, not Jev:
`findIntentFunction` (keyword and embedding rankings together) and
`findSdkFunction` (embedding, then keyword cache) run per phone slot in the hole
path (`vera/VeraIntentIndex.ets`, `vera/VeraSdkIndex.ets`, and the
`*EmbeddingCache` modules). The UI catalogue itself is narrowed for the prompt by
`selectUiForPrompt` (embeddings), not Jev. The older Jev intent pre-selection
(`vera/JevSelector.ets`'s `selectDomains`/`selectTargets`) and the blocks section
pick (`vera/VeraSectionCompose.ets`'s `selectSections`) were orphaned by the
blocks-pipeline removal and have **no callers** in the current tree — they remain
in the source but are not on the live path.

## 4. The plan of needs

Both paths produce a **`ScreenPlan`** (`vera/ScreenPlan.ets`): the screen's
*state* (named values), its *slots* (each thing it does, with what it reads and
writes, and whether it is a phone action), and the *components* that fill them.
A component's fill is one of `FILL_OPEN`, `FILL_PART`, `FILL_BLOCK`,
`FILL_EFFECT`, `FILL_HOLE`, `FILL_REPORTED`. A slot is *open* until something
fills it; **a plan with an open slot is not served.**

The plan starts as a **sketch** — JSON the generating model writes with thinking
off: inputs, constants, values with formulas, a countdown or stopwatch, a list,
events (what the phone does, and when), ready needs, other items, and at most
two questions. The model is prompted with `NEEDS_PROMPT`
(`vera/NeedsPlan.ets:64`) and the reply is parsed by `parseSketch`
(`vera/VeraCompose.ets:225`). The sketch is model work, not Jev. It is asked for
until there is one: the first try, then once more with what was wrong quoted,
then once with thinking on.

The sketch is the pivot between the paths: it is drawn in both, and it is what
the slow path writes against when the fast path cannot assemble a program.

## 5. The two paths

The route (`agent/VeraBuildRoute.ets`, `buildScreen`) is the single entry for a
new screen — the Generate screen and the chat both go through it. It decides
which builder serves and never generates from scratch itself; neither does the
caller.

### 5.1 The fast path — with Jev

`runAgent` (`agent/VeraAgent.ets`) → `composeNeeds` (`vera/NeedsChoose.ets`):

1. **Plan.** The model writes the sketch (thinking off, retried as above).
2. **Questions.** The sketch's questions are shown to the person on a card; a
   non-default answer replans.
3. **Jev call #1 — section or part.** One Jev call over the sketch. What a
   section cannot stand in for is removed from the options *before* asking, from
   the plan's own facts, so a choice is never taken back. A choice Jev does not
   give leaves the part.
4. **Jev call #2 — per-attribute.** One Jev call for the widgets, formulas,
   effects and moments, not re-asking what call #1 settled. Asked twice if it
   does not answer.
5. **Assemble.** `readComposition` → `Composition` → `assembleProgram` emits the
   Vera source from the chosen sections + parts.
6. **Fill.** The sections' text/content is written (from a web search when it
   must be real) and their small catalogue holes filled
   (`vera/SectionFill.ets`, `SectionFillApp.ets`).
7. **Check.** The assembled program is compiled and run once with every handler
   tapped; failures are quoted back for a repair with SEARCH/REPLACE edits, at
   most twice (`agent/AgentRepair.ets`, `settleProgram`).

If the composer yields a program, `result.vbc2` is non-empty and the route
returns `OUTCOME_AGENT`. **No model-written whole-program code on this path** —
the composer emits it; the model only filled text and small holes.

### 5.2 The slow path — without Jev, or when the fast path cannot serve

When the composer produces no program (Jev did not answer, or the sketch left
slots nothing ready fills), the route falls through to `writeWholeScreen`
(`VeraBuildRoute.ets:59`):

1. The **model writes the whole screen as one hole** — Vera source, against the
   sketch the plan already drew (or the bare request if there is no sketch).
   `writeHole` (`agent/AgentHole.ets`) is the writer; it writes against the Vera
   skill the Generate page loaded (`rawfile/vera-skill.txt` with `{{UI_CATALOG}}`
   spliced in) and passed into the host as `host.language` — `AgentHole` gates on
   `host.language.length === 0` (no skill, no hole).
2. For each **phone slot**, the app's own lookups run first —
   `findIntentFunction` (keyword and embedding rankings together) and
   `findSdkFunction` (embedding, then keyword cache) — and the section may call
   only targets they returned. Every `sdk.call` target is checked before
   serving.
3. The written section is compiled and run once with every handler tapped;
   failures are quoted back for a repair, at most twice; one more try with
   thinking on after the quick tries.
4. **Jev reads it** against each need (`claimsUndone`/`claimsDone`); a need read
   as not done is asked for again. Still failing, the best try that works and
   does part of it is served with a notice for what it misses; none, a notice in
   its place; `<cannot>` (nothing on this phone does it) is reported as the
   writer says and not retried.

If the whole-screen hole serves, the route returns `OUTCOME_AGENT` (the screen
is built, just by the model alone). If it too fails, the route returns
`OUTCOME_NOT_BUILT` with the reason — the route never generates from scratch,
and neither does the caller; the chat and the Generate screen both show the
reason.

The slow path requires `request.mode === 'deepseek'` (cloud) and the
whole-screen hole enabled (default). In `MODE_LOCAL` (on-device Qwen) or
`MODE_SERVER` there is no whole-screen fallback, so without Jev those modes
return `OUTCOME_NOT_BUILT`.

## 6. Graceful degradation — what happens without Jev

**A selector that cannot answer must not stop a generation.** This is the rule
every live Jev call site obeys, and it is what makes the no-Jev case a slow path
rather than a failure.

| Jev role | no key / unreachable | effect on the pipeline |
|---|---|---|
| composition choices (`NeedsChoose`, `VeraCompose`) | `askJev` returns `''` (401 on empty bearer, or caught exception); retried once; `composeFromSketch` returns `'Jev did not answer twice'` with no composition | composer yields nothing → route falls to `writeWholeScreen` |
| questions / align / slot-values (`AgentQuestions`, `AgentAlign`, `VeraSectionCompose`) | empty answer → defaults kept, no alignment applied, no slot values read | proceeds; the plan's own defaults stand |
| verification (`AgentClaims`, `AgentHole`) | empty answer → `claimsUndone`/`claimsDone` return `[]` (documented: "[] when Jev did not answer") | "no unmet claims, nothing to fix" — the written screen is served as-is |
| refine (`VeraComposition.selectEdit`) | empty answer → the edit is not applied | the existing composition stands |

`askJev` (`vera/VeraCompose.ets:3909`) never throws: non-200 or exception →
`noteService(SERVICE_JEV, false, ...)` and `return ''`. The live callers all
tolerate the empty string as above. (`selectDomains`/`selectTargets` in
`JevSelector.ets` and `selectSections` in `VeraSectionCompose.ets` also fail
wide, but they have no callers — see §3.)

Net effect: **without Jev, screens are still built** — via the model-written
whole-screen hole (the slow path, ~30 s+, the pre-Jev generation cost). With
Jev, the fast path assembles from picked sections/parts in ~2-7 s median
(`docs/agent.md` results: 2.0 s for composer-parts-only, up to 6.7 s with a
written section). The 23-commit `dev/main` merge made Jev more central to the
*fast* path (the needs-plan section/part choices) but did **not** add a new Jev
dependency to the *slow* path: the whole-screen hole's Jev-verify predates the
merge and already tolerated absence.

Intent and SDK function finding does not depend on Jev at all: it is
embedding-based (`findIntentFunction`, `findSdkFunction`), with a keyword
fallback when the embedding model is absent (a stub build without `llama.cpp`).
So even on a stub build, phone functions are still found — just ranked by keyword
match rather than by meaning.

## 7. Switches and launch parameters

All launch parameters are persisted (`{filesDir}/vera/settings.json`) and
survive restarts; none is compiled in.

| parameter | effect |
|---|---|
| `--ps cloudKey sk-...` | the cloud model's API key (provider-neutral alias; `deepseekKey` is the historical name) |
| `--ps apiBase URL` | the chat-completions base URL; the engine appends `/chat/completions` |
| `--ps apiModel NAME` | the model name sent in the request |
| `--ps typesafeKey KEY` | **enables Jev.** Without it, every Jev call falls back per §6 |
| `--ps reasoningEffort low\|high\|max` | how hard the model reasons before a generation |
| `--ps exaKey KEY` | the chat's web-search key (optional; without it, no search tool) |
| `--ps veraServer URL` | the vera-server address, for Server generation mode |
| `--ps veraTemplateSelect 0` | disable the Jev template path for the session (to compare against plain generation) |
| `--ps veraOrder blocks-first` | run the blocks before the agent |
| `--ps veraCustom 0` | turn off written (model) sections |
| `--ps veraWhole 0` | turn off the whole-screen hole — **do not combine with no Jev**, or nothing serves |

`apiBase`/`apiModel` point at any OpenAI-compatible chat-completions endpoint;
DeepSeek-native fields (`thinking`, `reasoning_effort`) are sent only when
`settings.isDeepSeek()` is true (the base URL is DeepSeek's, or the model name
contains `deepseek`), so pointing `apiBase` elsewhere switches the dialect off by
itself. Jev always calls `api.typesafe.ai` regardless of the cloud provider.

## 8. Observability

- **Stages** (`vera/RunStages.ets`): each step is tagged with who did it —
  `WHO_MODEL`, `WHO_PHONE`, `WHO_JEV` — and its wall time. The Generate screen's
  metrics tab renders these through `attemptsPanel()`, `tokensPanel()`,
  `toolsPanel()`, `servicesPanel()` (`pages/GeneratePage.ets`).
- **Service health** (`vera/ServiceHealth.ets`): `noteService(SERVICE_DEEPSEEK,
  ok, ...)`, `noteService(SERVICE_JEV, ok, ...)` ping per call; the services
  panel shows reachability.
- **Tool log** (`vera/ToolLog.ets`): `toolCount`/`toolSpanSince` attribute phone
  lookup time inside a model stage.
- **Trace**: every written hole is recorded — a `hole` event in the app's trace,
  `holes.jsonl` beside each host run; `tools/vera-harness/hole-report.py` groups
  the needs that recur (the blocks the catalogue lacks).

## 9. File map

| file | what it is |
|---|---|
| `vera/VeraUiCatalog.ets` | the one pure-data description of `std/ui`; compiler, validator and prompt generated from it |
| `vera/VeraTemplates.ets` | the 29 `FragmentSpec` section templates, registered in `fragments()` |
| `vera/VeraCompose.ets` | the composer: the sketch, Jev's per-attribute choices, `assembleProgram`, `askJev` |
| `vera/NeedsPlan.ets` | the plan-of-needs prompt and parser |
| `vera/NeedsChoose.ets` | the section-or-part Jev call and `composeNeeds` (the fast-path orchestrator) |
| `vera/ScreenPlan.ets` | the one plan format both paths produce (state, slots, components) |
| `vera/JevSelector.ets` | intent pre-selection (domain + intent passes) — **orphaned by the blocks-pipeline removal, no callers**; kept in source |
| `vera/VeraIntentIndex.ets` / `VeraSdkIndex.ets` | live intent/SDK function finding (keyword), with the `*EmbeddingCache` modules for the embedding rankings |
| `vera/VeraCompiler.ets` | parses and compiles Vera; `compileVeraSource` throws `CompileError` |
| `components/VeraPreview.ets` | renders the running program as ArkUI; drift-checks against the catalogue |
| `agent/VeraBuildRoute.ets` | the route: `runAgent` → `writeWholeScreen` → `OUTCOME_NOT_BUILT` |
| `agent/VeraAgent.ets` | runs the agent: plan, choices, align leftovers, claims |
| `agent/AgentHole.ets` | `writeHole` — the model-written section / whole-screen hole, with lookups and verify |
| `agent/AgentRepair.ets` | `settleProgram` — compile, run, repair by edits |
| `agent/AgentClaims.ets` | `claimsUndone`/`claimsDone` — Jev verification of written code |
| `agent/AgentQuestions.ets` | `askBlocking` — settles the sketch's questions via Jev |
| `agent/AgentAlign.ets` | `alignLeftovers` — aligns open slots with the catalogue via Jev |
| `vera/SettingsStore.ets` | device-local settings (keys, model, base URL, selectorKey); `isDeepSeek`, `providerLabel` |
| `entryability/EntryAbility.ets` | reads the launch parameters into `SettingsStore` and the feature flags |

## 10. Key ideas, in one line each

- **Jev picks, the composer assembles, the model writes only holes.** Jev never
  writes text or code; it answers independent questions over ready-made options.
- **One block format** (`FragmentSpec`) for both catalogue sections and composer
  parts, so the assembler treats them the same.
- **The catalogue is pure data.** Compiler, validator and prompt are generated
  from it; only the renderer keeps a second list, and it drift-checks at startup.
- **Planning and building each have a fast path and a slow path.** Jev picks
  something ready (fast); the model writes what nothing ready does (slow), down
  to the whole screen as one hole.
- **The sketch is the pivot.** Model-written in both paths, it is what the slow
  path writes against when the fast path cannot assemble.
- **A selector that cannot answer must not stop a generation.** Every Jev call
  site falls back — to the whole catalogue, to the parts, to `[]` — so no-Jev is
  a slow path, not a failure.
- **Intent finding is embedding-based, not Jev.** `findIntentFunction`/
  `findSdkFunction` rank phone functions by meaning (keyword fallback on a stub
  build), so a phone need is found without Jev — Jev's job is picking among
  ready-made options, not finding phone functions.
- **The route never generates from scratch, and neither does the caller.** The
  whole-screen hole is the last model-written resort; past it, `OUTCOME_NOT_BUILT`
  with the reason.
- **A plan with an open slot is not served.** Everything the plan says the screen
  does must be filled — by a section, a part, a written hole, or a notice.
