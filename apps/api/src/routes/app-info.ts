import { appVersionQuerySchema, appVersionSettingsSchema, compareVersions } from '@hufra/contracts'
import { Hono } from 'hono'

import { recordAudit } from '../lib/audit'
import type { Bindings } from '../lib/types'
import { attachAuth, requireRole } from '../middleware/auth'

// App-version check (plan 7.1): the app asks on start whether it may still be
// used. The team raises the minimum when an old version must not be used any
// more (e.g. a security fix), and records the newest published version.
const appInfo = new Hono<{ Bindings: Bindings }>()

const DEFAULT_VERSION = '1.0.0'
const keys = (platform: 'ios' | 'android') => ({
  latest: `app.${platform}.latest`,
  minimum: `app.${platform}.minimum`,
  storeUrl: `app.${platform}.store_url`,
})

async function readVersions(db: Bindings['DB'], platform: 'ios' | 'android') {
  const k = keys(platform)
  const rows = await db
    .prepare('SELECT key, value FROM app_settings WHERE key IN (?, ?, ?)')
    .bind(k.latest, k.minimum, k.storeUrl)
    .all<{ key: string; value: string }>()
  const map = new Map(rows.results.map((r) => [r.key, r.value]))
  return {
    latest: map.get(k.latest) || DEFAULT_VERSION,
    minimum: map.get(k.minimum) || DEFAULT_VERSION,
    store_url: map.get(k.storeUrl) || '',
  }
}

// GET /api/app/version?platform=android&version=1.0.0 - public.
appInfo.get('/version', async (c) => {
  const parsed = appVersionQuerySchema.safeParse(c.req.query())
  if (!parsed.success) return c.json({ error: 'Invalid query', error_ar: 'معايير بحث غير صحيحة' }, 400)
  const { platform, version } = parsed.data
  const v = await readVersions(c.env.DB, platform)
  c.header('Cache-Control', 'public, max-age=300')
  return c.json({
    latest: v.latest,
    minimum: v.minimum,
    update_required: compareVersions(version, v.minimum) < 0,
    update_available: compareVersions(version, v.latest) < 0,
    store_url: v.store_url || null,
  })
})

// GET/PUT /api/app/version-settings - super admins (the admin panel, plan 8.2).
appInfo.get('/version-settings', attachAuth, requireRole('admin', 'super_admin'), async (c) => {
  c.header('Cache-Control', 'private, no-store')
  return c.json({ ios: await readVersions(c.env.DB, 'ios'), android: await readVersions(c.env.DB, 'android') })
})

appInfo.put('/version-settings', attachAuth, requireRole('super_admin'), async (c) => {
  const auth = c.get('auth')!
  const parsed = appVersionSettingsSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input', error_ar: 'بيانات غير صحيحة' }, 400)
  for (const p of ['ios', 'android'] as const) {
    if (compareVersions(parsed.data[p].minimum, parsed.data[p].latest) > 0) {
      return c.json({ error: 'The minimum cannot be newer than the latest version', error_ar: 'لا يمكن أن يكون الحد الأدنى أحدث من آخر إصدار' }, 400)
    }
  }
  const before = { ios: await readVersions(c.env.DB, 'ios'), android: await readVersions(c.env.DB, 'android') }
  const upserts = (['ios', 'android'] as const).flatMap((p) => {
    const k = keys(p)
    const s = parsed.data[p]
    return [
      [k.latest, s.latest],
      [k.minimum, s.minimum],
      [k.storeUrl, s.store_url],
    ] as [string, string][]
  })
  await c.env.DB.batch(
    upserts.map(([key, value]) =>
      c.env.DB.prepare(
        `INSERT INTO app_settings (key, value, updated_by, updated_at) VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at`
      ).bind(key, value, auth.userId)
    )
  )
  await recordAudit(c.env.DB, { actorId: auth.userId, action: 'settings.app_version', entity: 'app_settings', before, after: parsed.data })
  return c.json({ ios: await readVersions(c.env.DB, 'ios'), android: await readVersions(c.env.DB, 'android') })
})

export default appInfo
