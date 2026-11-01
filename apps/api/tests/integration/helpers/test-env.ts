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
    ADMIN_WHATSAPP: '+218000000000',
  }
  return { env, db, kv, photos }
}

/** Thin fetch helper that always injects the test env bindings. */
export async function request(env: Bindings, path: string, init?: RequestInit): Promise<Response> {
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
