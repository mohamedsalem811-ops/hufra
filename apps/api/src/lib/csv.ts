// CSV files for spreadsheets (admin export, public open data).

/**
 * One CSV cell. Quoted when needed, and text that a spreadsheet would run as a
 * formula (=, +, -, @, tab, return) is prefixed with an apostrophe.
 */
export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return ''
  let s = String(v)
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** A CSV download: UTF-8 with a byte-order mark (U+FEFF), so Excel reads the Arabic text correctly. */
export function csvResponse(lines: string[], name: string, cacheControl: string): Response {
  const date = new Date().toISOString().slice(0, 10)
  return new Response(`\uFEFF${lines.join('\r\n')}\r\n`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}-${date}.csv"`,
      'Cache-Control': cacheControl,
    },
  })
}
