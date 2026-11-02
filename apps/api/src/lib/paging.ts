// Cursor paging for long lists (plan 7.1). Rows are ordered newest first by
// their id; the cursor is the id of the last row returned, so the next page
// starts right after it even if new rows arrive meanwhile.
import { pageQuerySchema, type PageQuery } from '@hufra/contracts'

export function readPage(query: Record<string, string>): PageQuery | null {
  const parsed = pageQuerySchema.safeParse({ limit: query.limit, cursor: query.cursor })
  return parsed.success ? parsed.data : null
}

/** SQL fragment + binds for "older than the cursor". */
export function beforeCursor(column: string, page: PageQuery): { sql: string; binds: number[] } {
  return page.cursor ? { sql: ` AND ${column} < ?`, binds: [Number(page.cursor)] } : { sql: '', binds: [] }
}

/** Ask for limit + 1 rows; this trims the extra one and says whether there is more. */
export function toPage<T extends { id: number }>(rows: T[], page: PageQuery): { results: T[]; next_cursor: string | null } {
  const results = rows.slice(0, page.limit)
  const more = rows.length > page.limit
  return { results, next_cursor: more && results.length ? String(results[results.length - 1].id) : null }
}
