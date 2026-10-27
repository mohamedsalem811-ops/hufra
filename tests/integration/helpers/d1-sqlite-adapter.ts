// Thin adapter that exposes better-sqlite3 through the small subset of the
// Cloudflare D1Database API HUFRA's code actually uses (prepare/bind/run/
// first/all). This lets integration tests run the REAL migration SQL
// (including triggers: auto user-code, status_history auto-insert,
// audit_logs immutability) against a real SQLite engine, instead of a
// hand-rolled mock - giving much higher confidence than mocking D1 directly,
// while still being fast and dependency-light (no Miniflare/Workers runtime
// needed since these are pure SQL + business-logic tests).
//
// D1 timestamp/JSON semantics differ slightly from raw better-sqlite3 (D1
// returns numbers as JS numbers, dates as ISO strings via strftime - both of
// which better-sqlite3 already does the same way here), so this adapter is a
// faithful-enough stand-in for the query patterns used in src/routes/*.

import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'

export interface MiniD1Result<T = unknown> {
  results: T[]
  success: boolean
}

class MiniStatement {
  constructor(private db: Database.Database, private sql: string, private params: unknown[] = []) {}

  bind(...params: unknown[]): MiniStatement {
    return new MiniStatement(this.db, this.sql, params)
  }

  async run(): Promise<{ meta: { last_row_id: number; changes: number }; success: boolean }> {
    const stmt = this.db.prepare(this.sql)
    const info = stmt.run(...(this.params as any[]))
    return { meta: { last_row_id: Number(info.lastInsertRowid), changes: info.changes }, success: true }
  }

  async first<T = unknown>(): Promise<T | null> {
    const stmt = this.db.prepare(this.sql)
    const row = stmt.get(...(this.params as any[]))
    return (row as T) ?? null
  }

  async all<T = unknown>(): Promise<MiniD1Result<T>> {
    const stmt = this.db.prepare(this.sql)
    const rows = stmt.all(...(this.params as any[]))
    return { results: rows as T[], success: true }
  }
}

export class MiniD1Database {
  constructor(public raw: Database.Database) {}

  prepare(sql: string): MiniStatement {
    return new MiniStatement(this.raw, sql)
  }
}

/** Creates a fresh in-memory SQLite DB and applies HUFRA's real migrations. */
export function createMigratedTestDb(): MiniD1Database {
  const raw = new Database(':memory:')
  raw.pragma('journal_mode = WAL')
  raw.pragma('foreign_keys = ON')

  const migrationsDir = path.resolve(__dirname, '../../../migrations')
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8')
    raw.exec(sql)
  }

  return new MiniD1Database(raw)
}
