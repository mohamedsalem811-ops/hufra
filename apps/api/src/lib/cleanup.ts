// Plan 9.1: the daily clean-up (a Cron Trigger on the Worker). It keeps the
// retention promises of the privacy policy:
//   - transfer screenshots are deleted N days after the donation was confirmed
//     or rejected (N from the legal information, default 90); their hash stays,
//     so the same screenshot still cannot back a second donation;
//   - technical records (hashed IP addresses and browser names of sessions,
//     hashed IPs in the audit log) are cleared after 90 days; long-expired
//     sessions are deleted;
//   - pledges whose screenshot never came are closed, and spent one-time
//     tokens and rate-limit counters are removed.
import { recordAudit } from './audit'
import { expireStalePledges } from './donations'
import { loadLegal } from './site-settings'
import type { Bindings } from './types'

export const TECHNICAL_RECORDS_DAYS = 90
/** Screenshots handled per run, so one run stays well inside the Worker's limits. */
const SCREENSHOT_BATCH = 200

export interface CleanupResult {
  screenshots: number
  sessions_cleared: number
  sessions_deleted: number
  audit_ips_cleared: number
}

const daysAgo = (now: Date, days: number) => new Date(now.getTime() - days * 86_400_000).toISOString()

export async function dailyCleanup(env: Pick<Bindings, 'DB' | 'PHOTOS'>, now = new Date()): Promise<CleanupResult> {
  const db = env.DB
  await expireStalePledges(db)

  const { info } = await loadLegal(db)
  const shotsBefore = daysAgo(now, info.retention_screenshots_days)
  const due = await db
    .prepare(
      `SELECT id, proof_key FROM donations
       WHERE proof_key IS NOT NULL
         AND ((status IN ('confirmed', 'rejected') AND reviewed_at < ?) OR (status IN ('expired', 'cancelled') AND updated_at < ?))
       ORDER BY id LIMIT ?`
    )
    .bind(shotsBefore, shotsBefore, SCREENSHOT_BATCH)
    .all<{ id: number; proof_key: string }>()
  let screenshots = 0
  for (const row of due.results) {
    // Storage first: a failed delete leaves the row for the next run.
    const deleted = await env.PHOTOS.delete(row.proof_key).then(() => true, () => false)
    if (!deleted) continue
    await db.prepare('UPDATE donations SET proof_key = NULL WHERE id = ? AND proof_key = ?').bind(row.id, row.proof_key).run()
    screenshots++
  }

  const techBefore = daysAgo(now, TECHNICAL_RECORDS_DAYS)
  const cleared = await db
    .prepare('UPDATE refresh_tokens SET user_agent = NULL, ip_hash = NULL WHERE created_at < ? AND (user_agent IS NOT NULL OR ip_hash IS NOT NULL)')
    .bind(techBefore)
    .run()
  const deleted = await db.prepare('DELETE FROM refresh_tokens WHERE expires_at < ?').bind(techBefore).run()
  const audit = await db.prepare('UPDATE audit_logs SET ip_hash = NULL WHERE ip_hash IS NOT NULL AND created_at < ?').bind(techBefore).run()
  const nowIso = now.toISOString()
  await db.batch([
    db.prepare('DELETE FROM web_handoff_tokens WHERE expires_at < ?').bind(nowIso),
    db.prepare('DELETE FROM rate_limit_counters WHERE expires_at < ?').bind(Math.floor(now.getTime() / 1000)),
  ])

  const result: CleanupResult = {
    screenshots,
    sessions_cleared: cleared.meta.changes ?? 0,
    sessions_deleted: deleted.meta.changes ?? 0,
    audit_ips_cleared: audit.meta.changes ?? 0,
  }
  if (Object.values(result).some((n) => n > 0)) {
    await recordAudit(db, { actorId: null, action: 'maintenance.cleanup', entity: 'system', after: result })
  }
  return result
}
