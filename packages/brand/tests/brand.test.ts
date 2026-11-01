import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { contrastRatio, CONTRAST_PAIRS, themes, light, dark } from '../src'
import { themeVars, toCss, toJson, toPreviewHtml } from '../src/generate'

describe('contrast (WCAG 2.2 AA)', () => {
  for (const [name, theme] of Object.entries(themes)) {
    describe(`${name} theme`, () => {
      for (const pair of CONTRAST_PAIRS) {
        it(`${pair.name} >= ${pair.min}:1`, () => {
          expect(contrastRatio(pair.fg(theme), pair.bg(theme))).toBeGreaterThanOrEqual(pair.min)
        })
      }
    })
  }

  it('the ratio function matches known WCAG values', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5)
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5)
    expect(contrastRatio('#767676', '#FFFFFF')).toBeCloseTo(4.54, 2)
  })
})

describe('themes', () => {
  it('light and dark define exactly the same colour roles', () => {
    expect(themeVars(dark).map(([k]) => k)).toEqual(themeVars(light).map(([k]) => k))
  })

  it('every colour is a valid #RRGGBB or rgba()', () => {
    for (const [, v] of [...themeVars(light), ...themeVars(dark)]) {
      expect(v).toMatch(/^(#[0-9A-Fa-f]{6}|rgba\(\d+, \d+, \d+, [\d.]+\))$/)
    }
  })

  it('status pins are distinguishable by lightness, not only hue (paired with glyphs)', () => {
    const pins = Object.values(light.status).map((s) => s.pin)
    expect(new Set(pins).size).toBe(4)
  })
})

describe('generated files', () => {
  const dist = join(__dirname, '..', 'dist')
  it('dist/ matches src/tokens.ts (run `npm run build -w @hufra/brand` after changing tokens)', () => {
    expect(readFileSync(join(dist, 'tokens.css'), 'utf8')).toBe(toCss())
    expect(readFileSync(join(dist, 'tokens.json'), 'utf8')).toBe(toJson())
    expect(readFileSync(join(dist, 'preview.html'), 'utf8')).toBe(toPreviewHtml())
  })

  it('CSS exposes light, system-dark and explicit-dark themes', () => {
    const css = toCss()
    expect(css).toContain('--color-bg-canvas: #F6F8FA;')
    expect(css).toContain('@media (prefers-color-scheme: dark)')
    expect(css).toContain(':root[data-theme="dark"]')
    expect(css).toContain('--color-action-on-primary: #1A0A04;')
    expect(css).toContain("--font-sans: 'Readex Pro'")
  })
})
