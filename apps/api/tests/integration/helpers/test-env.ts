// Builds a real Hono `app` (the actual src/index.tsx export) wired to a
// fresh, fully-migrated in-memory SQLite DB (via createMigratedTestDb) plus
// fake KV/R2 bindings, so integration tests exercise the true route handlers,
// real trigger-backed schema, and real middleware chain end-to-end - the
// same code path that runs in production - without needing Miniflare.
import { createMigratedTestDb, type MiniD1Database } from './d1-sqlite-adapter'
import { FakeKVNamespace, FakeR2Bucket } from './fake-bindings'
import type { Bindings } from '../../../src/lib/types'
import app from '../../../src/index'

export interface TestEnv {
  env: Bindings
  db: MiniD1Database
  kv: FakeKVNamespace
  photos: FakeR2Bucket
}

export function createTestEnv(): TestEnv {
  const db = createMigratedTestDb()
  const kv = new FakeKVNamespace()
  const photos = new FakeR2Bucket()
  const env: Bindings = {
    DB: db as unknown as Bindings['DB'],
    KV: kv as unknown as Bindings['KV'],
    PHOTOS: photos as unknown as Bindings['PHOTOS'],
    JWT_SECRET: 'test-secret-do-not-use-in-production',
  }
  return { env, db, kv, photos }
}

const reporters = new WeakMap<Bindings, Promise<string>>()

/** A signed-in citizen used for report creation in tests that are not about who reports. */
export function defaultReporterToken(env: Bindings): Promise<string> {
  let token = reporters.get(env)
  if (!token) {
    token = (async () => {
      const creds = { email: 'reporter@tests.local', password: 'Rep0rter-Tests!', consent: true, display_name: 'Reporter' }
      const headers = { 'Content-Type': 'application/json' }
      await app.request('/api/auth/register', { method: 'POST', headers, body: JSON.stringify(creds) }, env)
      const res = await app.request('/api/auth/login', { method: 'POST', headers, body: JSON.stringify(creds) }, env)
      return ((await res.json()) as { access_token: string }).access_token
    })()
    reporters.set(env, token)
  }
  return token
}

/** Send this header to create a report with no account (to test that it is refused). */
export const ANONYMOUS = 'X-Test-Anonymous'

/**
 * Thin fetch helper that always injects the test env bindings.
 * Reports need an account (POST /api/potholes): when a test sends one without
 * an Authorization header, it is signed in as the default test reporter,
 * unless the test sends the ANONYMOUS header.
 */
export async function request(env: Bindings, path: string, init?: RequestInit): Promise<Response> {
  if (path === '/api/potholes' && init?.method === 'POST') {
    const headers = new Headers(init.headers)
    if (headers.has(ANONYMOUS)) headers.delete(ANONYMOUS)
    else if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${await defaultReporterToken(env)}`)
    init = { ...init, headers }
  }
  return app.request(path, init, env)
}

export async function json(res: Response): Promise<any> {
  const text = await res.text()
  try {
    return text ? JSON.parse(text) : null
  } catch {
    return null
  }
}
