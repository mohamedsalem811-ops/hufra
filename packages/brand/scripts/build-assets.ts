// Builds the HUFRA brand kit (Direction A, Civic Clarity) from one geometry
// and the real Readex Pro font:
//
//   assets/logo/  SVG logos: mark, horizontal and stacked lockups, wordmark,
//                 in colour (light / dark backgrounds) and one-colour versions.
//                 Text is converted to outlines with HarfBuzz, so Arabic letters
//                 join correctly and the files need no font installed.
//   assets/app/   Mobile app icons and splash images (Expo / iOS / Android).
//   assets/web/   Favicons and web app icons.
//
// Run: npm run build:assets -w @hufra/brand   (deterministic; commit the output)

import * as hb from 'harfbuzzjs'
import { Resvg } from '@resvg/resvg-js'
import { PNG } from 'pngjs'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { palette, dark, light } from '../src/tokens'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = (...p: string[]) => join(root, 'assets', ...p)

// ------------------------------------------------------------------ colours
const SEA = palette.sea[700]
const SIGNAL = palette.signal[500]
const SIGNAL_DEEP = palette.signal[700]
const WHITE = '#FFFFFF'
const INK = palette.ink[950]
const TEXT_SECONDARY = light.text.secondary

// ------------------------------------------------------------------ mark geometry (1024 x 1024)
// A map pin (the place of every report) whose head holds a pothole seen in
// perspective: signal-orange rim, deep inner shadow. Centred optically.
const PIN =
  'M736 456c0 139.804-155.092 285.404-207.172 330.372a28 28 0 0 1-33.656 0C443.092 741.404 288 595.804 288 456a224 224 0 0 1 448 0Z'
// Sized to stay readable as a hole down to the 29-px iOS Settings icon.
const HOLE_OUTER = { cx: 512, cy: 456, rx: 132, ry: 78 }
const HOLE_INNER = { cx: 512, cy: 476, rx: 102, ry: 52 }
const ellipsePath = (e: { cx: number; cy: number; rx: number; ry: number }) =>
  `M${e.cx - e.rx} ${e.cy}a${e.rx} ${e.ry} 0 1 0 ${2 * e.rx} 0a${e.rx} ${e.ry} 0 1 0 ${-2 * e.rx} 0Z`
const ellipse = (e: { cx: number; cy: number; rx: number; ry: number }, fill: string) =>
  `<ellipse cx="${e.cx}" cy="${e.cy}" rx="${e.rx}" ry="${e.ry}" fill="${fill}"/>`

/** Pin + pothole, no background (for adaptive icon foregrounds, splash, on-colour use). */
const pinAndHole = (pinFill = WHITE) => `<path d="${PIN}" fill="${pinFill}"/>${ellipse(HOLE_OUTER, SIGNAL)}${ellipse(HOLE_INNER, SIGNAL_DEEP)}`

/** The full-colour mark: sea-blue tile. `radius` 0 = full-bleed square (iOS masks it itself). */
const markColour = (radius: number) => `<rect width="1024" height="1024" rx="${radius}" fill="${SEA}"/>${pinAndHole()}`

/** One-colour mark: a tile with the pin knocked out and the pothole filled back in (even-odd). */
const markMono = (colour: string, radius = 224) => {
  const r = radius
  const tile = `M${r} 0H${1024 - r}A${r} ${r} 0 0 1 1024 ${r}V${1024 - r}A${r} ${r} 0 0 1 ${1024 - r} 1024H${r}A${r} ${r} 0 0 1 0 ${1024 - r}V${r}A${r} ${r} 0 0 1 ${r} 0Z`
  return `<path fill-rule="evenodd" fill="${colour}" d="${tile}${PIN}${ellipsePath(HOLE_OUTER)}"/>`
}

/** Pin silhouette with the pothole cut out (Android themed / notification icons). */
const pinSilhouette = (colour: string) => `<path fill-rule="evenodd" fill="${colour}" d="${PIN}${ellipsePath(HOLE_OUTER)}"/>`

const TILE_RADIUS = 224 // 22% of 1024, close to the iOS/Android icon curve

// ------------------------------------------------------------------ text to outlines (HarfBuzz)
interface Shaped {
  d: string[] // glyph paths placed in font units (y up)
  width: number
  minY: number
  maxY: number
}

function loadFont(file: string) {
  const data = readFileSync(join(root, 'assets', 'fonts', file))
  const face = new hb.Face(new hb.Blob(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)))
  return { font: new hb.Font(face), upem: face.upem as number }
}

function shape(fontFile: string, text: string, letterSpacing = 0): Shaped {
  const { font } = loadFont(fontFile)
  const buf = new hb.Buffer()
  buf.addText(text)
  buf.guessSegmentProperties()
  hb.shape(font, buf)
  const infos = buf.getGlyphInfos()
  const pos = buf.getGlyphPositions()
  let x = 0
  let minY = Infinity
  let maxY = -Infinity
  const d: string[] = []
  infos.forEach((g: { codepoint: number }, i: number) => {
    const path: string = font.glyphToPath(g.codepoint)
    const dx = x + pos[i].xOffset
    const dy = pos[i].yOffset
    // glyphToPath emits absolute commands; collect y extents and translate.
    const placed = path.replace(/([MLQCZ])([^MLQCZ]*)/g, (_m: string, cmd: string, args: string) => {
      const nums = args.trim() ? args.trim().split(/[ ,]+/).map(Number) : []
      for (let k = 0; k + 1 < nums.length; k += 2) {
        nums[k] += dx
        nums[k + 1] += dy
        minY = Math.min(minY, nums[k + 1])
        maxY = Math.max(maxY, nums[k + 1])
      }
      return cmd + nums.map((n) => +n.toFixed(1)).join(' ')
    })
    d.push(placed)
    x += pos[i].xAdvance + (i < infos.length - 1 ? letterSpacing : 0)
  })
  return { d, width: x, minY, maxY }
}

/** Place shaped text: font units -> px at `size`, top-left at (x, y). */
function placeText(t: Shaped, size: number, x: number, y: number, fill: string) {
  const s = size / 1000
  // flip y: font units are y-up; the glyph top is maxY
  return `<g transform="translate(${+x.toFixed(2)} ${+(y + t.maxY * s).toFixed(2)}) scale(${s} ${-s})" fill="${fill}"><path d="${t.d.join('')}"/></g>`
}
const textW = (t: Shaped, size: number) => (t.width * size) / 1000
const textH = (t: Shaped, size: number) => ((t.maxY - t.minY) * size) / 1000

const AR = shape('ReadexPro-Bold.ttf', 'حفرة')
const EN = shape('ReadexPro-Medium.ttf', 'HUFRA', 300)

// ------------------------------------------------------------------ lockups
type Scheme = { name: string; markSvg: (s: number) => string; ar: string; en: string; bg?: string }

const mark = (inner: string, size: number, x: number, y: number) =>
  `<g transform="translate(${x} ${y}) scale(${size / 1024})">${inner}</g>`

const SCHEMES: Scheme[] = [
  { name: 'colour', markSvg: (s) => mark(markColour(TILE_RADIUS), s, 0, 0), ar: SEA, en: TEXT_SECONDARY },
  { name: 'colour-on-dark', markSvg: (s) => mark(markColour(TILE_RADIUS), s, 0, 0), ar: dark.text.primary, en: dark.text.secondary, bg: dark.bg.canvas },
  { name: 'mono-black', markSvg: (s) => mark(markMono(INK), s, 0, 0), ar: INK, en: INK },
  { name: 'mono-white', markSvg: (s) => mark(markMono(WHITE), s, 0, 0), ar: WHITE, en: WHITE, bg: INK },
]

function svgDoc(w: number, h: number, body: string, bg?: string, title = 'HUFRA حفرة') {
  // A background rect only for previews of light-on-dark versions; logo files stay transparent.
  void bg
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${+w.toFixed(1)} ${+h.toFixed(1)}" width="${Math.round(w)}" height="${Math.round(h)}" role="img" aria-label="${title}"><title>${title}</title>${body}</svg>\n`
}

/** Horizontal lockup, Arabic first: [ حفرة / HUFRA ]  [mark]  (mark on the right, reading side). */
function horizontal(s: Scheme) {
  const M = 240
  const arSize = 168
  const enSize = 54
  const gap = 56
  const arW = textW(AR, arSize)
  const enW = textW(EN, enSize)
  const blockW = Math.max(arW, enW)
  const arH = textH(AR, arSize)
  const enH = textH(EN, enSize)
  const lineGap = 26
  const blockH = arH + lineGap + enH
  const H = Math.max(M, blockH)
  const top = (H - blockH) / 2
  const textRight = blockW // text block right edge (aligned to the mark side)
  const body =
    placeText(AR, arSize, textRight - arW, top, s.ar) +
    placeText(EN, enSize, textRight - enW, top + arH + lineGap, s.en) +
    `<g transform="translate(${blockW + gap} ${(H - M) / 2})">${s.markSvg(M)}</g>`
  return svgDoc(blockW + gap + M, H, body, s.bg)
}

/** Stacked lockup: mark above, names centred. */
function stacked(s: Scheme) {
  const M = 320
  const arSize = 150
  const enSize = 50
  const arW = textW(AR, arSize)
  const enW = textW(EN, enSize)
  const W = Math.max(M, arW, enW)
  const arH = textH(AR, arSize)
  const enH = textH(EN, enSize)
  const g1 = 48
  const g2 = 26
  const body =
    `<g transform="translate(${(W - M) / 2} 0)">${s.markSvg(M)}</g>` +
    placeText(AR, arSize, (W - arW) / 2, M + g1, s.ar) +
    placeText(EN, enSize, (W - enW) / 2, M + g1 + arH + g2, s.en)
  return svgDoc(W, M + g1 + arH + g2 + enH, body, s.bg)
}

/** Wordmark only (when the mark is already present nearby, e.g. next to the app icon). */
function wordmark(s: Scheme) {
  const arSize = 168
  const enSize = 54
  const arW = textW(AR, arSize)
  const enW = textW(EN, enSize)
  const W = Math.max(arW, enW)
  const arH = textH(AR, arSize)
  const enH = textH(EN, enSize)
  const gap = 26
  const body = placeText(AR, arSize, (W - arW) / 2, 0, s.ar) + placeText(EN, enSize, (W - enW) / 2, arH + gap, s.en)
  return svgDoc(W, arH + gap + enH, body, s.bg)
}

// ------------------------------------------------------------------ writing
const svg1024 = (body: string, title = 'HUFRA حفرة') => svgDoc(1024, 1024, body, undefined, title)

function png(svg: string, size: number, file: string, background?: string) {
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: size }, background })
  writeFileSync(file, r.render().asPng())
}

/** Opaque PNG without an alpha channel (RGB). Apple rejects app icons that contain alpha. */
function pngOpaque(svg: string, size: number, file: string, background: string) {
  const img = new Resvg(svg, { fitTo: { mode: 'width', value: size }, background }).render()
  writeFileSync(file, PNG.sync.write({ width: img.width, height: img.height, data: img.pixels } as unknown as PNG, { colorType: 2 }))
}

function write(file: string, content: string) {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, content)
}

const written: string[] = []
const record = (f: string) => written.push(f.replace(root + '/', ''))

// Logos (SVG)
const markSvg = svg1024(markColour(TILE_RADIUS))
write(out('logo', 'mark.svg'), markSvg)
record(out('logo', 'mark.svg'))
write(out('logo', 'mark-mono-black.svg'), svg1024(markMono(INK)))
write(out('logo', 'mark-mono-white.svg'), svg1024(markMono(WHITE)))
for (const s of SCHEMES) {
  write(out('logo', `lockup-horizontal-${s.name}.svg`), horizontal(s))
  write(out('logo', `lockup-stacked-${s.name}.svg`), stacked(s))
  write(out('logo', `wordmark-${s.name}.svg`), wordmark(s))
}
record(out('logo', '*.svg'))

// Mobile app (Expo: icon, adaptiveIcon foreground/background/monochrome, splash)
mkdirSync(out('app'), { recursive: true })
pngOpaque(svg1024(markColour(0)), 1024, out('app', 'icon.png'), SEA) // iOS: full-bleed, RGB without alpha
// Android adaptive icons are masked to a circle/squircle from the centre 66%: scale to 90% for breathing room.
const inset90 = (inner: string) => `<g transform="translate(51.2 51.2) scale(0.9)">${inner}</g>`
png(svg1024(inset90(pinAndHole())), 1024, out('app', 'adaptive-foreground.png'))
png(svg1024(`<rect width="1024" height="1024" fill="${SEA}"/>`), 1024, out('app', 'adaptive-background.png'))
png(svg1024(inset90(pinSilhouette(WHITE))), 1024, out('app', 'adaptive-monochrome.png')) // Android 13 themed icons
png(svg1024(pinAndHole()), 1024, out('app', 'splash-icon.png')) // shown on the brand colour (light) / dark canvas (dark)
png(svg1024(pinSilhouette(WHITE)), 96, out('app', 'notification-icon.png')) // Android status-bar icon (white on transparent)
record(out('app', '*.png'))

// Web
write(out('web', 'favicon.svg'), markSvg)
png(markSvg, 32, out('web', 'favicon-32.png'))
pngOpaque(svg1024(markColour(0)), 180, out('web', 'apple-touch-icon.png'), SEA)
png(markSvg, 192, out('web', 'icon-192.png'))
png(markSvg, 512, out('web', 'icon-512.png'))
// Maskable: full-bleed background, artwork inside the 80% safe circle
png(svg1024(`<rect width="1024" height="1024" fill="${SEA}"/><g transform="translate(102.4 102.4) scale(0.8)">${pinAndHole()}</g>`), 512, out('web', 'icon-maskable-512.png'), SEA)
record(out('web', '*'))

console.log(`packages/brand: wrote ${written.join(', ')}`)
