/** Shared palette, typography, and geometry for generated interfaces.
 * Presets define a coherent visual direction. Renderers consume these values.
 * This module has no compiler or platform dependencies.
 */

/** The six presets, in the order the prompt lists them. */
export const PRESET_NAMES: string[] = [
  'clean', 'soft', 'expressive', 'editorial', 'technical', 'playful']

/** Resolved semantic colors, type roles, and layout dimensions. */
export class ResolvedTheme {
  preset: string = 'clean'

  // --- palette -------------------------------------------------------------
  primary: string = '#2563EB'
  onPrimary: string = '#FFFFFF'
  /** The primary's container: what an 'accent' surface is filled with. */
  primaryFill: string = '#EBF0FF'
  /** Accent text has separate contrast requirements from filled controls. */
  primaryInk: string = '#2563EB'
  secondaryFill: string = '#E0E0E0'
  secondaryInk: string = '#333333'

  /** Behind the whole program. */
  background: string = '#F8FAFC'
  /** A grouped area: card, surface column, image placeholder. */
  surface: string = '#FFFFFF'
  /** A row or cell sitting on top of a surface. */
  surfaceRaised: string = '#FFFFFF'
  surfaceDisabled: string = '#F5F5F5'

  ink: string = '#000000'
  inkStrong: string = '#333333'
  inkSoft: string = '#666666'
  inkMuted: string = '#888888'
  inkDisabled: string = '#CCCCCC'

  line: string = '#D8E1ED'
  lineSoft: string = '#E4EAF2'
  lineStrong: string = '#CBD6E4'

  success: string = '#4CAF50'
  successInk: string = '#2E7D32'
  successFill: string = '#E8F8E8'
  warning: string = '#E65100'
  warningInk: string = '#E65100'
  warningFill: string = '#FFF8E0'
  danger: string = '#F44336'
  dangerInk: string = '#C62828'
  dangerFill: string = '#FFECEC'

  /** Vector shapes, which have their own two names outside the tone set. */
  pathDefault: string = '#37474F'
  pathMuted: string = '#B0BEC5'

  // --- type scale ----------------------------------------------------------
  sizeDisplay: number = 32
  sizeTitle: number = 24
  sizeHeading: number = 20
  sizeBody: number = 16
  sizeCaption: number = 13
  sizeMetric: number = 40
  sizeEyebrow: number = 11
  weightDisplay: number = 700
  weightTitle: number = 700
  weightHeading: number = 500
  weightBody: number = 400
  weightMetric: number = 700
  /** Applied to eyebrows only; 0 leaves the text alone. */
  eyebrowSpacing: number = 1
  /** Body text always uses the system font. Generic families need no download. */
  fontFamily: string = ''
  headingFontFamily: string = ''
  metricFontFamily: string = ''

  // --- geometry ------------------------------------------------------------
  radiusCard: number = 16
  radiusControl: number = 10
  radiusSmall: number = 8
  borderWidth: number = 1

  /** What an input is filled with and edged by: a step off the card it sits on, so it reads as a field. */
  fieldFill: string = '#F8FAFC'
  fieldLine: string = '#CBD6E4'

  /** The lift under a card. Radius 0 draws none; editorial and technical stay flat on purpose. */
  shadowRadius: number = 16
  shadowOffsetY: number = 5
  shadowColor: string = '#2B1A2440'

  padTight: number = 6
  padBase: number = 10
  padLoose: number = 16
  padCard: number = 16
  padRow: number = 6
  padGrid: number = 4
  padListX: number = 14
  padListY: number = 12

  gapTight: number = 4
  gapBase: number = 8
  gapLoose: number = 12
  /** How far one Section stands off the next. */
  gapSection: number = 24

  spacerSmall: number = 8
  spacerBase: number = 18
  spacerLarge: number = 32

  controlHeight: number = 44
  chipHeight: number = 36
}

/**
 * A fresh theme for a preset name. Called when the program's AppTheme changes,
 * never per node, so it may do as much work as it likes.
 */
export function makeTheme(preset: string): ResolvedTheme {
  let t = new ResolvedTheme()
  t.preset = 'clean'
  if (preset === 'soft') {
    // Warm neutrals, big radii, hardly any line work: the corners do the
    // separating that borders do elsewhere.
    t.preset = 'soft'
    t.surfaceRaised = '#FFFFFF'
    t.secondaryFill = '#EAE4DD'
    t.secondaryInk = '#4A4340'
    t.ink = '#2C2724'
    t.inkStrong = '#453E39'
    t.inkSoft = '#6E645D'
    t.inkMuted = '#857A70'
    t.line = '#E6DED6'
    t.lineSoft = '#EFE9E3'
    t.lineStrong = '#DDD3C9'
    t.successFill = '#E4F5E6'
    t.warningFill = '#FBF0DC'
    t.dangerFill = '#FBE7E4'
    t.radiusControl = 16
    t.radiusSmall = 12
    t.shadowRadius = 22
    t.shadowOffsetY = 8
    t.shadowColor = '#262C2724'
    t.padTight = 10
    t.padBase = 14
    t.padLoose = 20
    t.padListX = 16
    t.padListY = 14
    t.gapBase = 10
    t.gapLoose = 16
    t.weightHeading = 600
  } else if (preset === 'expressive') {
    // Saturated, tinted throughout, and heavy at the top of the scale. The
    // background is not white, which is most of why it reads as another app.
    t.preset = 'expressive'
    t.surfaceRaised = '#FFFFFF'
    t.secondaryFill = '#E2D8F2'
    t.secondaryInk = '#3B2A5C'
    t.ink = '#1F1533'
    t.inkStrong = '#332553'
    t.inkSoft = '#5C4B7D'
    t.inkMuted = '#7A6B99'
    t.line = '#DCCFF2'
    t.lineSoft = '#E8DEF8'
    t.lineStrong = '#C9B6E8'
    t.success = '#059669'
    t.successInk = '#047857'
    t.successFill = '#D8F3E8'
    t.warning = '#D97706'
    t.warningInk = '#B45309'
    t.warningFill = '#FBEDD6'
    t.danger = '#DC2626'
    t.dangerInk = '#B91C1C'
    t.dangerFill = '#FBE0E0'
    t.pathDefault = '#3B2A5C'
    t.weightHeading = 700
    t.weightBody = 500
    t.radiusControl = 14
  } else if (preset === 'editorial') {
    // Editorial headings use a generic serif family and restrained borders.
    t.preset = 'editorial'
    // No shadow at all: a radius of 0 still draws a hard copy of the box at the offset, so colour and offset go too.
    t.shadowRadius = 0
    t.shadowOffsetY = 0
    t.shadowColor = '#00000000'
    t.headingFontFamily = 'Noto Serif'
    t.metricFontFamily = 'Noto Serif'
    // A serif at 700 reads heavy on a phone; 600 keeps the contrast with body text without the weight.
    t.weightDisplay = 600
    t.weightMetric = 600
    t.onPrimary = '#FFFFFF'
    t.surfaceRaised = '#FFFFFF'
    t.secondaryFill = '#EDEAE3'
    t.secondaryInk = '#1A1A1A'
    t.ink = '#111111'
    t.inkStrong = '#1A1A1A'
    t.inkSoft = '#55524B'
    t.inkMuted = '#8A857A'
    t.line = '#DAD5C9'
    t.lineSoft = '#E7E3D9'
    t.lineStrong = '#C9C3B4'
    t.successInk = '#1F6B37'
    t.successFill = '#EDF4EC'
    t.warningInk = '#8A4B0B'
    t.warningFill = '#F7F0E2'
    t.dangerInk = '#9B2226'
    t.dangerFill = '#F6E9E7'
    t.pathDefault = '#1A1A1A'
    t.weightTitle = 700
    t.weightHeading = 600
    t.weightMetric = 500
    t.eyebrowSpacing = 2
    t.radiusControl = 4
    t.radiusSmall = 2
    t.padLoose = 20
  } else if (preset === 'technical') {
    // Technical metrics use a generic monospace family and a compact rhythm.
    t.preset = 'technical'
    // No shadow at all: a radius of 0 still draws a hard copy of the box at the offset, so colour and offset go too.
    t.shadowRadius = 0
    t.shadowOffsetY = 0
    t.shadowColor = '#00000000'
    t.metricFontFamily = 'monospace'
    t.surfaceRaised = '#FFFFFF'
    t.secondaryFill = '#E3E8EA'
    t.secondaryInk = '#1F2A2E'
    t.ink = '#101820'
    t.inkStrong = '#26313A'
    t.inkSoft = '#55636D'
    t.inkMuted = '#7C8A94'
    t.line = '#C6D0D6'
    t.lineSoft = '#D8E0E4'
    t.lineStrong = '#AEBBC3'
    t.success = '#0F766E'
    t.successInk = '#0B5B55'
    t.successFill = '#DCF0EE'
    t.warning = '#B45309'
    t.warningInk = '#92400E'
    t.warningFill = '#F7EEDF'
    t.danger = '#B91C1C'
    t.dangerInk = '#991B1B'
    t.dangerFill = '#F7E3E3'
    t.pathDefault = '#26313A'
    t.sizeEyebrow = 10
    t.weightTitle = 600
    t.weightHeading = 600
    t.weightMetric = 600
    t.radiusControl = 6
    t.radiusSmall = 4
    t.padTight = 4
    t.padBase = 8
    t.padLoose = 12
    t.padListX = 10
    t.padListY = 8
    t.gapTight = 3
    t.gapBase = 6
    t.gapLoose = 9
    t.spacerBase = 12
    t.spacerLarge = 22
    t.controlHeight = 40
    t.chipHeight = 32
  } else if (preset === 'playful') {
    // Pills, high chroma, plenty of air.
    t.preset = 'playful'
    t.surfaceRaised = '#FFFFFF'
    t.secondaryFill = '#FFE6CC'
    t.secondaryInk = '#7A3E12'
    t.ink = '#2B1B22'
    t.inkStrong = '#432A33'
    t.inkSoft = '#7A5C66'
    t.inkMuted = '#8F7681'
    t.line = '#FBD9C5'
    t.lineSoft = '#FFE8D9'
    t.lineStrong = '#F2C3A8'
    t.success = '#12A150'
    t.successInk = '#0E7A3D'
    t.successFill = '#DEF7E7'
    t.warning = '#F59E0B'
    t.warningInk = '#B45309'
    t.warningFill = '#FFF1D6'
    t.danger = '#F0426B'
    t.dangerInk = '#C2185B'
    t.dangerFill = '#FFE3EA'
    t.pathDefault = '#432A33'
    t.weightHeading = 700
    t.weightBody = 500
    t.radiusControl = 22
    t.radiusSmall = 14
    t.padTight = 8
    t.padBase = 12
    t.padLoose = 20
    t.gapBase = 10
    t.gapLoose = 16
    t.spacerBase = 20
  }
  // The approved scale keeps body text readable in every preset.
  t.sizeTitle = 24
  t.sizeHeading = t.preset === 'technical' ? 18 : 20
  t.sizeBody = t.preset === 'technical' ? 15 : 16
  t.sizeCaption = 13
  t.surface = '#FFFFFF'
  if (t.preset === 'soft') {
    t.background = '#FAF7F2'; t.primary = '#6D5BD0'
    t.sizeDisplay = 32; t.sizeMetric = 40; t.gapSection = 32; t.padCard = 20; t.radiusCard = 24
  } else if (t.preset === 'expressive') {
    t.background = '#F7F3FF'; t.primary = '#7C3AED'
    t.sizeDisplay = 36; t.sizeMetric = 44; t.gapSection = 36; t.padCard = 20; t.radiusCard = 20
  } else if (t.preset === 'editorial') {
    t.background = '#FAFAF7'; t.primary = '#27272A'
    t.sizeDisplay = 38; t.sizeMetric = 42; t.gapSection = 36; t.padCard = 20; t.radiusCard = 4
  } else if (t.preset === 'technical') {
    t.background = '#F3F7F7'; t.primary = '#0F766E'
    t.sizeDisplay = 30; t.sizeMetric = 36; t.gapSection = 28; t.padCard = 16; t.radiusCard = 8
  } else if (t.preset === 'playful') {
    t.background = '#FFF7F4'; t.primary = '#BE185D'
    t.sizeDisplay = 36; t.sizeMetric = 44; t.gapSection = 36; t.padCard = 20; t.radiusCard = 24
  } else {
    t.background = '#F8FAFC'; t.primary = '#2563EB'
    t.sizeDisplay = 32; t.sizeMetric = 40; t.gapSection = 32; t.padCard = 16; t.radiusCard = 16
  }
  t.primaryFill = blendHex(t.primary, t.background, 0.88)
  t.primaryInk = t.primary
  t.onPrimary = readableInk(t.primary)
  return t
}

const HEX_DIGITS: string = '0123456789abcdefABCDEF'

/** '#rrggbb' and nothing else; anything shorter or stranger is ignored. */
export function isHexColor(s: string): boolean {
  if (s.length !== 7 || s.charAt(0) !== '#') { return false }
  for (let i = 1; i < 7; i++) {
    if (HEX_DIGITS.indexOf(s.charAt(i)) < 0) { return false }
  }
  return true
}

function channel(hex: string, at: number): number {
  return Number.parseInt(hex.substring(at, at + 2), 16)
}

function twoDigits(n: number): string {
  let v = Math.round(n)
  if (v < 0) { v = 0 }
  if (v > 255) { v = 255 }
  let s = v.toString(16).toUpperCase()
  return s.length < 2 ? '0' + s : s
}

/** `t` of the way from `a` to `b`: 0 is all a, 1 is all b. */
export function blendHex(a: string, b: string, t: number): string {
  if (!isHexColor(a) || !isHexColor(b)) { return a }
  return '#' +
    twoDigits(channel(a, 1) + (channel(b, 1) - channel(a, 1)) * t) +
    twoDigits(channel(a, 3) + (channel(b, 3) - channel(a, 3)) * t) +
    twoDigits(channel(a, 5) + (channel(b, 5) - channel(a, 5)) * t)
}

/** Convert an sRGB channel to linear light for text contrast. */
function linearChannel(value: number): number {
  let c = value / 255
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

function relativeLuminance(hex: string): number {
  return 0.2126 * linearChannel(channel(hex, 1)) +
    0.7152 * linearChannel(channel(hex, 3)) + 0.0722 * linearChannel(channel(hex, 5))
}

export function contrastRatio(a: string, b: string): number {
  let x = relativeLuminance(a)
  let y = relativeLuminance(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

/** Choose the foreground with the greater calculated contrast on this fill. */
export function readableInk(fill: string): string {
  if (!isHexColor(fill)) { return '#FFFFFF' }
  return contrastRatio(fill, '#000000') > contrastRatio(fill, '#FFFFFF') ? '#000000' : '#FFFFFF'
}

/** Move toward a neutral endpoint without replacing the color's hue. */
function adjustedInk(ink: string, fills: string[], dark: boolean): string {
  let endpoint = dark ? '#FFFFFF' : '#000000'
  for (let step = 0; step <= 255; step++) {
    let candidate = blendHex(ink, endpoint, step / 255)
    let readable = true
    for (let fill of fills) {
      if (contrastRatio(candidate, fill) < 4.5) { readable = false; break }
    }
    if (readable) { return candidate }
  }
  return endpoint
}

function resolveTextContrast(t: ResolvedTheme, dark: boolean): void {
  let fills: string[] = [t.background, t.surface, t.surfaceRaised, t.primaryFill,
    t.secondaryFill, t.successFill, t.warningFill, t.dangerFill]
  t.ink = adjustedInk(t.ink, fills, dark)
  t.inkStrong = adjustedInk(t.inkStrong, fills, dark)
  t.inkSoft = adjustedInk(t.inkSoft, fills, dark)
  t.inkMuted = adjustedInk(t.inkMuted, fills, dark)
  t.primaryInk = adjustedInk(t.primaryInk, fills, dark)
  t.successInk = adjustedInk(t.successInk, fills, dark)
  t.warningInk = adjustedInk(t.warningInk, fills, dark)
  t.dangerInk = adjustedInk(t.dangerInk, fills, dark)
  t.secondaryInk = adjustedInk(t.secondaryInk, fills, dark)
  t.onPrimary = readableInk(t.primary)
}

/** How bright a colour reads, weighted the way an eye weights it. */
function luminance(hex: string): number {
  if (!isHexColor(hex)) { return 0 }
  return (channel(hex, 1) * 299 + channel(hex, 3) * 587 + channel(hex, 5) * 114) / 1000
}

function lighten(hex: string, amount: number): string {
  return blendHex(hex, '#FFFFFF', amount)
}

/**
 * The same preset after dark.
 *
 * Not an inversion. Inverting a palette gives grey text on grey boxes, because
 * the light palette's separations were chosen against white and none of them
 * survive being flipped. What each preset keeps is its *hue*: the surfaces below
 * are the preset's own colour taken down to near-black, so soft stays warm,
 * expressive stays violet and technical stays cold, and the six remain as
 * different from one another as they are by day.
 *
 * Only the structural colours are written out. Everything else is derived, so
 * a tone fill is always the tone sunk into this preset's surface rather than a
 * value picked twice and drifting apart.
 */
function applyDark(t: ResolvedTheme, preset: string): void {
  if (preset === 'soft') {
    t.background = '#17140F'; t.surface = '#211C15'; t.surfaceRaised = '#2B241C'
    t.line = '#3A3229'; t.lineSoft = '#2F2822'; t.lineStrong = '#4A4034'
    t.ink = '#F3ECE1'; t.inkStrong = '#E3D9CA'; t.inkSoft = '#B6A996'; t.inkMuted = '#8A7E6D'
  } else if (preset === 'expressive') {
    t.background = '#140F20'; t.surface = '#1D1630'; t.surfaceRaised = '#261D3E'
    t.line = '#382B54'; t.lineSoft = '#2B2143'; t.lineStrong = '#4A3A6B'
    t.ink = '#EFE8FA'; t.inkStrong = '#DDD3EE'; t.inkSoft = '#AFA2C8'; t.inkMuted = '#8477A0'
  } else if (preset === 'editorial') {
    t.background = '#101010'; t.surface = '#101010'; t.surfaceRaised = '#1A1A1A'
    t.line = '#2E2E2C'; t.lineSoft = '#242422'; t.lineStrong = '#3E3E3A'
    t.ink = '#F3F1EA'; t.inkStrong = '#E4E1D8'; t.inkSoft = '#ADA99C'; t.inkMuted = '#807C70'
  } else if (preset === 'technical') {
    t.background = '#0B0F11'; t.surface = '#131A1D'; t.surfaceRaised = '#182126'
    t.line = '#26323A'; t.lineSoft = '#1D272C'; t.lineStrong = '#35444E'
    t.ink = '#E4EDF2'; t.inkStrong = '#D0DCE3'; t.inkSoft = '#94A5B0'; t.inkMuted = '#6E7F8A'
  } else if (preset === 'playful') {
    t.background = '#1A1114'; t.surface = '#241A1E'; t.surfaceRaised = '#2F2228'
    t.line = '#402F37'; t.lineSoft = '#32252B'; t.lineStrong = '#523B45'
    t.ink = '#FCEDF1'; t.inkStrong = '#F0DCE2'; t.inkSoft = '#C0A3AD'; t.inkMuted = '#967A84'
  } else {
    t.background = '#0E1116'; t.surface = '#161B22'; t.surfaceRaised = '#1C242F'
    t.line = '#2A3440'; t.lineSoft = '#212933'; t.lineStrong = '#3A4756'
    t.ink = '#E6EDF3'; t.inkStrong = '#D2DBE4'; t.inkSoft = '#9FADBC'; t.inkMuted = '#78889A'
  }
  t.surfaceDisabled = t.lineSoft
  t.inkDisabled = t.inkMuted
  // A shadow on near-black reads only as a darker halo, so it is kept small and
  // dense; the raised surface colour does most of the lifting after dark.
  if (t.shadowRadius > 0) { t.shadowRadius = 10; t.shadowOffsetY = 3; t.shadowColor = '#66000000' }

  // A tone that was chosen to read on white has to be brought up to read on
  // near-black. Editorial's primary is very nearly black by day, so lightening
  // it by a fifth would leave it invisible -- anything this dark is taken most
  // of the way to white instead.
  if (luminance(t.primary) < 70) { t.primary = lighten(t.primary, 0.82) }
  // Text and rules in the accent colour have to clear the surface behind them,
  // which the button's fill colour does not do after dark.
  t.primaryInk = luminance(t.primary) < 150 ? lighten(t.primary, 0.45) : t.primary
  t.success = lighten(t.success, 0.26)
  t.warning = lighten(t.warning, 0.30)
  t.danger = lighten(t.danger, 0.26)
  t.successInk = t.success
  t.warningInk = t.warning
  t.dangerInk = t.danger
  t.onPrimary = readableInk(t.primary)

  // Every fill is its tone sunk into this preset's own surface.
  t.primaryFill = blendHex(t.primaryInk, t.surface, 0.84)
  t.successFill = blendHex(t.success, t.surface, 0.84)
  t.warningFill = blendHex(t.warning, t.surface, 0.84)
  t.dangerFill = blendHex(t.danger, t.surface, 0.84)

  t.secondaryFill = t.surfaceRaised
  t.secondaryInk = t.ink
  t.pathDefault = t.inkStrong
  t.pathMuted = t.inkMuted
}

/**
 * The preset, with the program's own seed colour folded in when it gave one.
 *
 * The seed replaces the primary and its container is derived rather than asked
 * for: a model that picks one brand colour should not also have to pick the
 * five tints that go with it, and picking them by hand is how the tints end up
 * not matching the colour.
 */
export function resolveTheme(preset: string, primaryHex: string, dark: boolean): ResolvedTheme {
  let t = makeTheme(preset)
  if (isHexColor(primaryHex)) {
    t.primary = primaryHex
    t.primaryInk = primaryHex
    t.onPrimary = readableInk(primaryHex)
    t.primaryFill = blendHex(primaryHex, t.background, 0.88)
  }
  // After the seed, so a program's own colour is carried into the dark palette
  // and lightened with it rather than being overwritten by the preset's.
  if (dark) { applyDark(t, t.preset) }
  resolveTextContrast(t, dark)
  t.fieldFill = t.background
  t.fieldLine = t.lineStrong
  return t
}

// --- what the renderer asks, per node ---------------------------------------
// Table lookups only. These run once per node per frame, so nothing here
// parses, blends or allocates.

/** Background of a container asking for 'surface' or 'accent'; else transparent. */
export function containerFill(t: ResolvedTheme, style: string): string {
  if (style === 'surface') { return t.surface }
  if (style === 'accent') { return t.primaryFill }
  return '#00000000'
}

/** The tinted fill behind a card, list row or banner. */
export function toneFill(t: ResolvedTheme, style: string, fallback: string): string {
  if (style === 'accent') { return t.primaryFill }
  if (style === 'success') { return t.successFill }
  if (style === 'warning') { return t.warningFill }
  if (style === 'danger') { return t.dangerFill }
  return fallback
}

/** The saturated version of a tone: a rail, a bar, a border. */
export function toneEdge(t: ResolvedTheme, style: string, fallback: string): string {
  if (style === 'accent') { return t.primaryInk }
  if (style === 'success') { return t.success }
  if (style === 'warning') { return t.warning }
  if (style === 'danger') { return t.danger }
  return fallback
}

/** Text in a tone, darkened enough to read at body size. */
export function toneInk(t: ResolvedTheme, style: string, fallback: string): string {
  if (style === 'accent') { return t.primaryInk }
  if (style === 'success') { return t.successInk }
  if (style === 'warning') { return t.warningInk }
  if (style === 'danger') { return t.dangerInk }
  if (style === 'muted') { return t.inkMuted }
  return fallback
}

export function textSize(t: ResolvedTheme, style: string): number {
  if (style === 'display') { return t.sizeDisplay }
  if (style === 'title') { return t.sizeTitle }
  if (style === 'heading') { return t.sizeHeading }
  if (style === 'metric') { return t.sizeMetric }
  if (style === 'caption') { return t.sizeCaption }
  if (style === 'eyebrow') { return t.sizeEyebrow }
  return t.sizeBody
}

export function textWeight(t: ResolvedTheme, style: string): number {
  if (style === 'display') { return t.weightDisplay }
  if (style === 'title') { return t.weightTitle }
  if (style === 'heading') { return t.weightHeading }
  if (style === 'metric') { return t.weightMetric }
  if (style === 'eyebrow') { return t.weightHeading }
  return t.weightBody
}

export function textInk(t: ResolvedTheme, style: string): string {
  // 'caption' is deliberately not muted here. It was drawn in the ink colour
  // before this module existed, and a caption quietly turning grey would be a
  // visual change to every program already written. A caption that wants to be
  // quiet asks for 'muted'.
  if (style === 'eyebrow') { return t.inkMuted }
  return toneInk(t, style, t.ink)
}

export function buttonFill(t: ResolvedTheme, style: string): string {
  if (style === 'success') { return t.success }
  if (style === 'danger') { return t.danger }
  if (style === 'secondary') { return t.secondaryFill }
  return t.primary
}

export function buttonInk(t: ResolvedTheme, style: string): string {
  if (style === 'secondary') { return t.secondaryInk }
  if (style === 'success') { return readableInk(t.success) }
  if (style === 'danger') { return readableInk(t.danger) }
  return t.onPrimary
}

export function pathFill(t: ResolvedTheme, style: string): string {
  if (style === 'accent') { return t.primary }
  if (style === 'success') { return t.success }
  if (style === 'warning') { return t.warning }
  if (style === 'danger') { return t.danger }
  if (style === 'muted') { return t.pathMuted }
  if (style === 'light') { return '#FFFFFF' }
  return t.pathDefault
}

/** Padding for a container whose style names a density. */
export function densityPad(t: ResolvedTheme, style: string): number {
  if (style === 'compact') { return t.padTight }
  if (style === 'spacious') { return t.padLoose }
  return t.padBase
}

/** The gap between a container's children, for the same density names. */
export function densityGap(t: ResolvedTheme, style: string): number {
  if (style === 'compact') { return t.gapTight }
  if (style === 'spacious') { return t.gapLoose }
  // 'joined' is for children that have to read as one thing: the two ui.NumberText
  // of a clock are "21:09" only if nothing sits between them.
  if (style === 'joined') { return 0 }
  return t.gapBase
}

export function spacerSize(t: ResolvedTheme, style: string): number {
  if (style === 'none') { return 0 }
  if (style === 'small') { return t.spacerSmall }
  if (style === 'large') { return t.spacerLarge }
  return t.spacerBase
}
