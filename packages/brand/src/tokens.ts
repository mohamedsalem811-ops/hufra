// HUFRA design tokens: Direction A "Civic Clarity" (وضوح مدني).
//
// The single source of truth for colour, type, spacing, radius, elevation and
// motion, shared by the mobile app (TypeScript import), the admin panel and the
// company website (generated CSS: dist/tokens.css). Edit values HERE only, then
// run `npm run build -w @hufra/brand`; CI fails if dist/ is out of date or if a
// text/background pair drops below WCAG AA (see src/contrast.ts).
//
// Brand idea: a public service people trust. Mediterranean sea blue for HUFRA
// itself, signal orange for every report (the call to act), repair green when
// a pothole is fixed. Calm surfaces, data-led, Arabic first.

/** Raw palette. Components never use these directly: use the semantic theme. */
export const palette = {
  sea: {
    50: '#E8F1F7',
    100: '#CFE2EE',
    200: '#9FC5DE',
    300: '#7CC0EE',
    400: '#5AACE0',
    500: '#1F78AE',
    600: '#0B5C8C',
    700: '#0B4A6F', // brand
    800: '#083853',
    900: '#062A3F',
  },
  signal: {
    50: '#FFF1EC',
    100: '#FFE7DE',
    300: '#FFA585',
    400: '#FF7A52',
    500: '#FF6A3D', // reports / primary action
    600: '#E5532B',
    700: '#B23A12',
    900: '#3D1E12',
  },
  repair: {
    50: '#DDF3E7',
    300: '#6FDCA4',
    500: '#1E8E5A', // fixed
    700: '#146B43',
    900: '#12352A',
  },
  amber: {
    50: '#FFF1D6',
    300: '#F5C065',
    500: '#E8A317', // under repair
    700: '#8A5300',
    900: '#3A2A0C',
  },
  royal: {
    50: '#E1ECFB',
    300: '#9DC2F5',
    500: '#2F6FDB', // verified
    700: '#1D4F91',
    900: '#16294A',
  },
  red: {
    50: '#FEE4E2',
    300: '#FF9C92',
    700: '#B42318',
    900: '#3E1916',
  },
  ink: {
    0: '#FFFFFF',
    25: '#F6F8FA',
    50: '#EDF1F5',
    100: '#DCE3E9',
    300: '#93A4B1',
    400: '#7D8E9C',
    450: '#6B7F8E',
    500: '#5C6B77',
    600: '#4A5B68',
    700: '#2A3A47',
    800: '#1A2833',
    850: '#121E27',
    900: '#0B141B',
    950: '#0E1B26',
    dark: '#04121C',
    onSignal: '#1A0A04',
  },
} as const

/** Semantic colour roles. Light and dark MUST have exactly the same keys. */
export interface ColorTheme {
  bg: { canvas: string; surface: string; subtle: string; brandTint: string }
  border: { default: string; strong: string; focus: string }
  text: { primary: string; secondary: string; tertiary: string; inverse: string; link: string }
  brand: { primary: string; onPrimary: string }
  action: { primary: string; primaryPressed: string; onPrimary: string }
  feedback: {
    successFg: string
    successBg: string
    warningFg: string
    warningBg: string
    dangerFg: string
    dangerBg: string
  }
  /** Report lifecycle. fg/bg = badge text/background; pin = map marker fill (always with a glyph). */
  status: Record<'reported' | 'verified' | 'underRepair' | 'fixed', { fg: string; bg: string; pin: string }>
  overlay: { scrim: string }
}

const p = palette

export const light: ColorTheme = {
  bg: { canvas: p.ink[25], surface: p.ink[0], subtle: p.ink[50], brandTint: p.sea[50] },
  border: { default: p.ink[100], strong: p.ink[400], focus: p.sea[700] },
  text: { primary: p.ink[950], secondary: p.ink[600], tertiary: p.ink[500], inverse: p.ink[0], link: p.sea[600] },
  brand: { primary: p.sea[700], onPrimary: p.ink[0] },
  action: { primary: p.signal[500], primaryPressed: p.signal[600], onPrimary: p.ink.onSignal },
  feedback: {
    successFg: p.repair[700],
    successBg: p.repair[50],
    warningFg: p.amber[700],
    warningBg: p.amber[50],
    dangerFg: p.red[700],
    dangerBg: p.red[50],
  },
  status: {
    reported: { fg: p.signal[700], bg: p.signal[100], pin: p.signal[500] },
    verified: { fg: p.royal[700], bg: p.royal[50], pin: p.royal[500] },
    underRepair: { fg: p.amber[700], bg: p.amber[50], pin: p.amber[500] },
    fixed: { fg: p.repair[700], bg: p.repair[50], pin: p.repair[500] },
  },
  overlay: { scrim: 'rgba(14, 27, 38, 0.48)' },
}

export const dark: ColorTheme = {
  bg: { canvas: p.ink[900], surface: p.ink[850], subtle: p.ink[800], brandTint: '#12324A' },
  border: { default: p.ink[700], strong: p.ink[450], focus: p.sea[300] },
  text: { primary: '#EEF3F7', secondary: '#A9B8C4', tertiary: p.ink[300], inverse: p.ink[950], link: p.sea[300] },
  // Dark mode uses a light sea blue with dark text: the deep brand blue would
  // disappear against dark surfaces (2.3:1).
  brand: { primary: p.sea[400], onPrimary: p.ink.dark },
  action: { primary: p.signal[400], primaryPressed: p.signal[500], onPrimary: p.ink.onSignal },
  feedback: {
    successFg: p.repair[300],
    successBg: p.repair[900],
    warningFg: p.amber[300],
    warningBg: p.amber[900],
    dangerFg: p.red[300],
    dangerBg: p.red[900],
  },
  status: {
    reported: { fg: p.signal[300], bg: p.signal[900], pin: p.signal[400] },
    verified: { fg: p.royal[300], bg: p.royal[900], pin: '#4F8BEA' },
    underRepair: { fg: p.amber[300], bg: p.amber[900], pin: p.amber[500] },
    fixed: { fg: p.repair[300], bg: p.repair[900], pin: '#2BA56C' },
  },
  overlay: { scrim: 'rgba(0, 0, 0, 0.6)' },
}

export const themes = { light, dark } as const
export type ThemeName = keyof typeof themes

/**
 * Readex Pro (SIL Open Font License) covers Arabic and Latin with the same
 * design. Bundled with each app (never loaded from a third-party CDN).
 */
export const fontFamily = {
  sans: 'Readex Pro',
  fallback: "system-ui, -apple-system, 'Segoe UI', 'Noto Sans Arabic', Tahoma, sans-serif",
} as const

export const fontWeight = { light: 300, regular: 400, medium: 500, semibold: 600, bold: 700 } as const

/** Type scale (px). Line heights are generous for Arabic script. */
export const typeScale = {
  display: { size: 40, lineHeight: 52, weight: fontWeight.bold },
  title1: { size: 28, lineHeight: 38, weight: fontWeight.bold },
  title2: { size: 22, lineHeight: 32, weight: fontWeight.semibold },
  title3: { size: 18, lineHeight: 28, weight: fontWeight.semibold },
  body: { size: 16, lineHeight: 26, weight: fontWeight.regular },
  bodyStrong: { size: 16, lineHeight: 26, weight: fontWeight.semibold },
  small: { size: 14, lineHeight: 22, weight: fontWeight.regular },
  caption: { size: 12, lineHeight: 18, weight: fontWeight.medium },
  number: { size: 32, lineHeight: 38, weight: fontWeight.bold },
} as const

/** 4-point spacing scale (px / dp). */
export const space = { 0: 0, 1: 2, 2: 4, 3: 8, 4: 12, 5: 16, 6: 20, 7: 24, 8: 32, 9: 40, 10: 48, 11: 64 } as const

export const radius = { sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, pill: 999 } as const

/** Elevation, expressed once and rendered as CSS box-shadow or React Native shadow props. */
export const elevation = {
  none: { y: 0, blur: 0, opacity: 0 },
  sm: { y: 1, blur: 3, opacity: 0.08 },
  md: { y: 4, blur: 12, opacity: 0.1 },
  lg: { y: 12, blur: 32, opacity: 0.14 },
} as const
export const shadowColor = '#0E1B26'

export const motion = {
  duration: { instant: 100, fast: 150, base: 250, slow: 400 },
  /** cubic-bezier control points */
  easing: {
    standard: [0.2, 0, 0, 1],
    enter: [0, 0, 0, 1],
    exit: [0.3, 0, 1, 1],
  },
  /** React Native Reanimated spring defaults */
  spring: { damping: 18, stiffness: 220, mass: 1 },
} as const

/** Minimum touch target (iOS 44 pt, Android 48 dp: use the larger). */
export const touchTarget = 48

/**
 * Brand rules that tokens alone cannot express (enforced in design review):
 * - Signal orange is a FILL for the main action and "reported" status; text on it is always dark (action.onPrimary).
 * - Status is never shown by colour alone: badges have a label, map pins carry a glyph
 *   (reported "!", verified check-circle, under repair wrench, fixed check), because orange
 *   and amber look alike with red-green colour blindness.
 * - Photos come first: before/after pairs are the main story of a fixed report.
 */
export const rules = [
  'Signal orange is a fill; text on it is always dark.',
  'Status is never colour alone: badges have labels, pins have glyphs.',
  'Photos first: before/after is the story of a fixed report.',
] as const
