// Plan 8.2: the admin panel's settings: general rules, contact details and
// the versioned legal information.
import { contactSettingsSchema, generalRulesSchema, publishLegalSchema } from '@hufra/contracts'
import { Hono } from 'hono'

import { recordAudit } from '../lib/audit'
import { invalidatePublicCaches } from '../lib/cache'
import { deferFrom, notifyAdmins } from '../lib/notifications'
import { loadContact, loadLegal, loadRules, SITE_KEYS, writeJson } from '../lib/site-settings'
import type { Bindings } from '../lib/types'
import { attachAuth, requireRole } from '../middleware/auth'

const adminSettings = new Hono<{ Bindings: Bindings }>()
adminSettings.use('*', attachAuth, requireRole('admin', 'super_admin'))

const invalid = (c: any) => c.json({ error: 'Invalid input', error_ar: 'بيانات غير صحيحة' }, 400)
const noStore = (c: any) => c.header('Cache-Control', 'private, no-store')

adminSettings.get('/settings/rules', async (c) => {
  noStore(c)
  return c.json({ rules: await loadRules(c.env.DB) })
})

adminSettings.put('/settings/rules', requireRole('super_admin'), async (c) => {
  const auth = c.get('auth')!
  const parsed = generalRulesSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return invalid(c)
  const before = await loadRules(c.env.DB)
  await writeJson(c.env.DB, SITE_KEYS.rules, parsed.data, auth.userId)
  await recordAudit(c.env.DB, { actorId: auth.userId, action: 'settings.rules', entity: 'app_settings', before, after: parsed.data })
  return c.json({ rules: await loadRules(c.env.DB) })
})

// Contact details: any admin may keep them current.
adminSettings.put('/settings/contact', async (c) => {
  const auth = c.get('auth')!
  const parsed = contactSettingsSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return invalid(c)
  const before = await loadContact(c.env.DB)
  await writeJson(c.env.DB, SITE_KEYS.contact, parsed.data, auth.userId)
  await recordAudit(c.env.DB, { actorId: auth.userId, action: 'settings.contact', entity: 'app_settings', before, after: parsed.data })
  await invalidatePublicCaches()
  return c.json({ contact: await loadContact(c.env.DB) })
})

// Publishing the legal information always makes a new numbered version.
adminSettings.put('/settings/legal', requireRole('super_admin'), async (c) => {
  const auth = c.get('auth')!
  const parsed = publishLegalSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return invalid(c)
  const { material, ...info } = parsed.data
  const before = await loadLegal(c.env.DB)
  await c.env.DB.prepare('INSERT INTO legal_versions (version, info_json, material, published_by) VALUES (?, ?, ?, ?)')
    .bind(before.version + 1, JSON.stringify(info), material ? 1 : 0, auth.userId)
    .run()
  await recordAudit(c.env.DB, {
    actorId: auth.userId,
    action: material ? 'legal.publish_material' : 'legal.publish',
    entity: 'legal_versions',
    entityId: before.version + 1,
    before: before.version ? before.info : null,
    after: info,
  })
  if (material) await notifyAdmins(c.env.DB, 'legal_published', { version: before.version + 1, by: auth.code }, c.env, deferFrom(c))
  return c.json(await loadLegal(c.env.DB))
})

export default adminSettings
