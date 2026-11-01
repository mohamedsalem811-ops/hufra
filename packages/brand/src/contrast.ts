// WCAG 2.2 contrast checks for the semantic theme. Every pair listed here is
// verified for BOTH themes by the test suite, so a colour change that makes
// text unreadable fails CI.

import type { ColorTheme } from './tokens'

function channel(c: number): number {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

/** Relative luminance of a #RRGGBB colour. */
export function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) throw new Error(`Not a #RRGGBB colour: ${hex}`)
  const n = parseInt(m[1], 16)
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}

/** WCAG contrast ratio between two #RRGGBB colours (1 to 21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

export const AA_TEXT = 4.5
export const AA_UI = 3

type Pick = (t: ColorTheme) => string
export interface ContrastPair {
  name: string
  fg: Pick
  bg: Pick
  min: number
}

const textOn = (name: string, fg: Pick, bg: Pick): ContrastPair => ({ name, fg, bg, min: AA_TEXT })
const uiOn = (name: string, fg: Pick, bg: Pick): ContrastPair => ({ name, fg, bg, min: AA_UI })

const statuses = ['reported', 'verified', 'underRepair', 'fixed'] as const

export const CONTRAST_PAIRS: ContrastPair[] = [
  ...(['canvas', 'surface', 'subtle'] as const).flatMap((bg) => [
    textOn(`text.primary on bg.${bg}`, (t) => t.text.primary, (t) => t.bg[bg]),
    textOn(`text.secondary on bg.${bg}`, (t) => t.text.secondary, (t) => t.bg[bg]),
    textOn(`text.tertiary on bg.${bg}`, (t) => t.text.tertiary, (t) => t.bg[bg]),
    textOn(`text.link on bg.${bg}`, (t) => t.text.link, (t) => t.bg[bg]),
  ]),
  textOn('text.primary on bg.brandTint', (t) => t.text.primary, (t) => t.bg.brandTint),
  textOn('brand.onPrimary on brand.primary', (t) => t.brand.onPrimary, (t) => t.brand.primary),
  textOn('action.onPrimary on action.primary', (t) => t.action.onPrimary, (t) => t.action.primary),
  textOn('action.onPrimary on action.primaryPressed', (t) => t.action.onPrimary, (t) => t.action.primaryPressed),
  textOn('text.inverse on text.primary (inverted chip)', (t) => t.text.inverse, (t) => t.text.primary),
  uiOn('brand.primary on bg.surface (filled control edge)', (t) => t.brand.primary, (t) => t.bg.surface),
  uiOn('border.strong on bg.surface (input outline)', (t) => t.border.strong, (t) => t.bg.surface),
  uiOn('border.focus on bg.surface (focus ring)', (t) => t.border.focus, (t) => t.bg.surface),
  uiOn('border.focus on bg.canvas (focus ring)', (t) => t.border.focus, (t) => t.bg.canvas),
  ...(['success', 'warning', 'danger'] as const).flatMap((k) => [
    textOn(`feedback.${k}Fg on feedback.${k}Bg`, (t) => t.feedback[`${k}Fg`], (t) => t.feedback[`${k}Bg`]),
    textOn(`feedback.${k}Fg on bg.surface`, (t) => t.feedback[`${k}Fg`], (t) => t.bg.surface),
  ]),
  ...statuses.flatMap((s) => [
    textOn(`status.${s}.fg on status.${s}.bg (badge)`, (t) => t.status[s].fg, (t) => t.status[s].bg),
    textOn(`status.${s}.fg on bg.surface`, (t) => t.status[s].fg, (t) => t.bg.surface),
  ]),
]
