// Lightweight in-memory fakes of the Cloudflare Workers bindings (KV, D1, R2)
// used to unit/integration-test route handlers and lib helpers without
// spinning up Miniflare. These implement just enough of each binding's
// surface area for HUFRA's code paths - not a full spec-compliant emulation.

export class FakeKVNamespace {
  private store = new Map<string, { value: string; expiresAt: number | null }>()

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key)
    if (!entry) return null
    if (entry.expiresAt !== null && entry.expiresAt < Date.now()) {
      this.store.delete(key)
      return null
    }
    return entry.value
  }

  async put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void> {
    const expiresAt = opts?.expirationTtl ? Date.now() + opts.expirationTtl * 1000 : null
    this.store.set(key, { value, expiresAt })
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key)
  }

  // Test helper, not part of the real KV interface.
  __clear() {
    this.store.clear()
  }
}

// Minimal fake of the D1 prepared-statement API. Records every bound
// statement so tests can assert on the exact SQL + params sent by the
// lib/route code, and returns caller-supplied canned results for
// .first()/.all()/.run() so lib functions that don't need a real SQLite
// engine (recordAudit, notifyAdmins/notifyUser, etc.) can be tested in
// isolation from the database layer.
export interface RecordedStatement {
  sql: string
  params: unknown[]
}

export class FakeD1Database {
  public calls: RecordedStatement[] = []
  private firstResult: unknown = null
  private allResults: unknown[] = []
  private runMeta: { last_row_id: number } = { last_row_id: 1 }

  prepare(sql: string) {
    const db = this
    let boundParams: unknown[] = []
    const statement = {
      bind(...params: unknown[]) {
        boundParams = params
        return statement
      },
      async run() {
        db.calls.push({ sql, params: boundParams })
        return { meta: db.runMeta, success: true }
      },
      async first<T = unknown>(): Promise<T | null> {
        db.calls.push({ sql, params: boundParams })
        return db.firstResult as T | null
      },
      async all<T = unknown>(): Promise<{ results: T[] }> {
        db.calls.push({ sql, params: boundParams })
        return { results: db.allResults as T[] }
      },
    }
    return statement
  }

  // Test helpers, not part of the real D1Database interface.
  __setFirstResult(value: unknown) {
    this.firstResult = value
  }
  __setAllResults(values: unknown[]) {
    this.allResults = values
  }
  __setLastRowId(id: number) {
    this.runMeta = { last_row_id: id }
  }
}

export class FakeR2Bucket {
  private store = new Map<string, { body: ArrayBuffer; httpMetadata?: { contentType?: string } }>()

  async put(key: string, body: ArrayBuffer, opts?: { httpMetadata?: { contentType?: string } }) {
    this.store.set(key, { body, httpMetadata: opts?.httpMetadata })
    return { key }
  }

  async get(key: string) {
    const entry = this.store.get(key)
    if (!entry) return null
    return {
      body: entry.body,
      httpMetadata: entry.httpMetadata,
      arrayBuffer: async () => entry.body,
    }
  }

  async delete(key: string) {
    this.store.delete(key)
  }
}
