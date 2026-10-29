/**
 * Whether Jev answers a refine of a composed screen as a structural edit (add, remove, replace or move a block:
 * VeraComposition.ets) before the model is asked. A new screen is not behind it: that goes through the route
 * (agent/VeraBuildRoute.ets).
 *
 * On by default, and it needs a selector -- a TypeSafe key (settings.hasSelectorKey())
 * or the on-device cloud proxy (settings.useJevProxy()), which answers the same
 * choices with the configured cloud model. `--ps
 * veraTemplateSelect 0` at launch switches it off for that session, for comparing against a plain
 * model refine; `--ps veraTemplateSelect 1` is accepted and changes nothing. Sticky, unlike
 * VeraUiAb.ets's one-shot flag: once switched off it stays off for every generation in the session.
 */

let enabled = true

export function enableTemplateSelect(): void { enabled = true }

export function disableTemplateSelect(): void { enabled = false }

export function templateSelectEnabled(): boolean { return enabled }
