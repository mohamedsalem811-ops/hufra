// Plan 8.2: owner-editable settings stored as JSON in app_settings, and the
// versioned legal information.
import {
  contactSettingsSchema,
  GENERAL_RULE_DEFAULTS,
  generalRulesSchema,
  LEGAL_DEFAULTS,
  legalInfoSchema,
  type ContactSettings,
  type GeneralRules,
  type LegalInfo,
} from '@hufra/contracts'

import type { Bindings } from './types'

type DB = Bindings['DB']

export const SITE_KEYS = { rules: 'rules.v1', contact: 'contact.v1' } as const

const EMPTY_CONTACT: ContactSettings = { public_email: '', privacy_email: '', phone: '', social_links: [] }

async function readJson(db: DB, key: string): Promise<unknown> {
  const row = await db.prepare('SELECT value FROM app_settings WHERE key = ?').bind(key).first<{ value: string }>()
  if (!row) return null
  try {
    return JSON.parse(row.value)
  } catch {
    return null
  }
}

export async function writeJson(db: DB, key: string, value: unknown, userId: number) {
  await db
    .prepare(
      `INSERT INTO app_settings (key, value, updated_by, updated_at) VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at`
    )
    .bind(key, JSON.stringify(value), userId)
    .run()
}

/** The general rules, each falling back to its default if never set or damaged. */
export async function loadRules(db: DB): Promise<GeneralRules> {
  const parsed = generalRulesSchema.partial().safeParse(await readJson(db, SITE_KEYS.rules))
  return { ...GENERAL_RULE_DEFAULTS, ...(parsed.success ? parsed.data : {}) }
}

export async function loadContact(db: DB): Promise<ContactSettings> {
  const parsed = contactSettingsSchema.safeParse(await readJson(db, SITE_KEYS.contact))
  return parsed.success ? parsed.data : EMPTY_CONTACT
}

export interface LegalState {
  version: number
  published_at: string | null
  acceptance_required_from: number
  complete: boolean
  info: LegalInfo
}

/** Required before the legal pages lose their "being prepared" mark. */
export const legalComplete = (i: LegalInfo) =>
  !!(i.legal_name_ar && i.legal_name_en && i.address && i.courts && i.retention_financial_years !== null)

export async function loadLegal(db: DB): Promise<LegalState> {
  const latest = await db
    .prepare('SELECT version, info_json, published_at FROM legal_versions ORDER BY version DESC LIMIT 1')
    .first<{ version: number; info_json: string; published_at: string }>()
  const material = await db.prepare('SELECT MAX(version) AS v FROM legal_versions WHERE material = 1').first<{ v: number | null }>()
  let info = LEGAL_DEFAULTS
  if (latest) {
    try {
      const parsed = legalInfoSchema.safeParse(JSON.parse(latest.info_json))
      if (parsed.success) info = parsed.data
    } catch {
      /* damaged row: show the defaults */
    }
  }
  return {
    version: latest?.version ?? 0,
    published_at: latest?.published_at ?? null,
    acceptance_required_from: material?.v ?? 0,
    complete: !!latest && legalComplete(info),
    info,
  }
}
