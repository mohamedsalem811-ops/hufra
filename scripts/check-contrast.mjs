// WCAG contrast checker for the HUFRA palette. Run: node scripts/check-contrast.mjs
const lum = (hex) => {
  const c = hex.replace('#', ''); const v = [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16) / 255)
    .map(x => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4))
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]
}
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
const L = { page: '#F5F4EF', surface: '#FFFFFF', soft: '#ECEAE2' }
const D = { page: '#0C0E11', surface: '#15181C', soft: '#1E2227' }
const pairs = [
  // [label, fg, bg, min]
  ['L text on surface', '#14171A', L.surface, 4.5], ['L text on page', '#14171A', L.page, 4.5],
  ['L secondary on surface', '#565C63', L.surface, 4.5], ['L secondary on page', '#565C63', L.page, 4.5], ['L secondary on soft', '#565C63', L.soft, 4.5],
  ['L link on surface', '#0A58B5', L.surface, 4.5], ['L hazard-ink on white', '#6B4F00', '#FFFFFF', 4.5], ['L hazard-ink on hazard-soft', '#6B4F00', '#FFF1B8', 4.5],
  ['black on hazard (buttons)', '#111111', '#FFCE00', 4.5],
  ['L badge reported', '#B42318', '#FEE4E2', 4.5], ['L badge verified', '#1849A9', '#DCEBFF', 4.5],
  ['L badge under_repair', '#8A3B0A', '#FFEBC2', 4.5], ['L badge fixed', '#05603A', '#D1FADF', 4.5],
  ['D text on surface', '#F3F4F5', D.surface, 4.5], ['D secondary on surface', '#A3ABB5', D.surface, 4.5], ['D secondary on soft', '#A3ABB5', D.soft, 4.5],
  ['D link on surface', '#7CB4FF', D.surface, 4.5], ['D hazard on surface (text/accent)', '#FFCE00', D.surface, 4.5],
  ['D badge reported', '#FDA29B', '#3B1513', 4.5], ['D badge verified', '#84CAFF', '#102A43', 4.5],
  ['D badge under_repair', '#FEC84B', '#3A2A06', 4.5], ['D badge fixed', '#6CE9A6', '#0F2E1E', 4.5],
  ['D border strong (non-text 3:1)', '#7A828C', D.surface, 3], ['D border strong on soft', '#7A828C', D.soft, 3], ['L text on soft', '#14171A', L.soft, 4.5],
  ['L border (non-text 3:1) on surface', '#8C9096', L.surface, 3],
  ['L focus ring on surface', '#111111', L.surface, 3], ['D focus ring on surface', '#FFCE00', D.surface, 3],
  ['white on danger btn', '#FFFFFF', '#C42B1F', 4.5], ['white on success btn', '#FFFFFF', '#17714A', 4.5],
  ['L text on hazard-soft', '#14171A', '#FFF1B8', 4.5],
  ['L pin reported vs map(3:1)', '#E5392D', '#E8E4D8', 3], ['L pin fixed', '#0E8244', '#E8E4D8', 3],
]
let fail = 0
for (const [label, fg, bg, min] of pairs) {
  const r = ratio(fg, bg); const ok = r >= min; if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${r.toFixed(2).padStart(5)}  (>=${min})  ${label}  ${fg} on ${bg}`)
}
console.log(fail ? `\n${fail} FAILED` : '\nAll pairs pass'); process.exit(fail ? 1 : 0)
