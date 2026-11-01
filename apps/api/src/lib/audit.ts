// Immutable audit logging helper. Every admin/super-admin mutating action
// must call recordAudit(). The audit_logs table forbids UPDATE/DELETE at the
// SQL trigger level (migrations/0002_triggers.sql), so this is append-only
// by construction, not just by convention.

import type { Bindings } from './types'

export async function recordAudit(
  db: Bindings['DB'],
  params: {
    actorId: number | null
    action: string
    entity: string
    entityId?: number | null
    before?: unknown
    after?: unknown
    ipHash?: string | null
  }
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO audit_logs (actor_id, action, entity, entity_id, before_json, after_json, ip_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      params.actorId ?? null,
      params.action,
      params.entity,
      params.entityId ?? null,
      params.before !== undefined ? JSON.stringify(params.before) : null,
      params.after !== undefined ? JSON.stringify(params.after) : null,
      params.ipHash ?? null
    )
    .run()
}

/** Hash an IP address for privacy-preserving audit/rate-limit storage (never store raw IPs). */
export async function hashIp(ip: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${ip}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
