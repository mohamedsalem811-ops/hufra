// In-dashboard + mobile push notification helper (bell/badge + push alerts
// for admins on new reports, and status-update notifications for report owners).

import type { Bindings, DevicePushTokenRow } from './types'
import { getAccessToken, isFcmToken, parseServiceAccount, sendFcmMessage, type PushMessage } from './fcm'

const STATUS_LABELS_AR: Record<string, string> = {
  reported: 'تم الإبلاغ',
  verified: 'تم التحقق',
  under_repair: 'قيد الإصلاح',
  fixed: 'تم الإصلاح',
}

const STATUS_LABELS_EN: Record<string, string> = {
  reported: 'Reported',
  verified: 'Verified',
  under_repair: 'Under repair',
  fixed: 'Fixed',
}

// ---------------------------------------------------------------------------
// Reading notifications (shared by GET /api/notifications and the admin page).
// ---------------------------------------------------------------------------

/** Roles whose team notifications a user receives: admins and super admins both get "admin" ones. */
function rolesFor(role: string): string[] {
  if (role === 'super_admin') return ['admin', 'super_admin']
  if (role === 'admin') return ['admin']
  return []
}

export async function listNotificationsFor(
  db: Bindings['DB'],
  user: { userId: number; role: string },
  page: { limit: number; cursor?: string } = { limit: 50 }
): Promise<{ results: unknown[]; unread_count: number; next_cursor: string | null }> {
  const roles = rolesFor(user.role)
  const roleClause = roles.length ? ` OR n.target_role IN (${roles.map(() => '?').join(',')})` : ''
  const scope = `(n.target_user_id = ?${roleClause})`
  // Personal notifications use their own read_at; team ones use this person's row in notification_reads.
  const readAt = 'CASE WHEN n.target_user_id IS NOT NULL THEN n.read_at ELSE r.read_at END'
  const join = 'LEFT JOIN notification_reads r ON r.notification_id = n.id AND r.user_id = ?'
  const binds = [user.userId, user.userId, ...roles]
  const older = page.cursor ? ' AND n.id < ?' : ''

  const rows = await db
    .prepare(
      `SELECT n.id, n.target_role, n.target_user_id, n.type, n.payload_json, n.created_at, ${readAt} AS read_at
       FROM notifications n ${join} WHERE ${scope}${older} ORDER BY n.id DESC LIMIT ?`
    )
    .bind(...binds, ...(page.cursor ? [Number(page.cursor)] : []), page.limit + 1)
    .all<{ id: number }>()
  const results = rows.results.slice(0, page.limit)
  const next_cursor = rows.results.length > page.limit && results.length ? String(results[results.length - 1].id) : null
  return { results, unread_count: await countUnreadNotifications(db, user), next_cursor }
}

/** Unread notifications for one person: their own, and their team's they have not read. */
export async function countUnreadNotifications(db: Bindings['DB'], user: { userId: number; role: string }): Promise<number> {
  const roles = rolesFor(user.role)
  const roleClause = roles.length ? ` OR n.target_role IN (${roles.map(() => '?').join(',')})` : ''
  const unread = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM notifications n LEFT JOIN notification_reads r ON r.notification_id = n.id AND r.user_id = ?
       WHERE (n.target_user_id = ?${roleClause}) AND (CASE WHEN n.target_user_id IS NOT NULL THEN n.read_at ELSE r.read_at END) IS NULL`
    )
    .bind(user.userId, user.userId, ...roles)
    .first<{ n: number }>()
  return unread?.n ?? 0
}

export async function markAllNotificationsRead(db: Bindings['DB'], user: { userId: number; role: string }): Promise<void> {
  const roles = rolesFor(user.role)
  const statements = [
    db
      .prepare(
        `UPDATE notifications SET read_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE target_user_id = ? AND read_at IS NULL`
      )
      .bind(user.userId),
  ]
  if (roles.length) {
    statements.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO notification_reads (notification_id, user_id)
           SELECT id, ? FROM notifications WHERE target_role IN (${roles.map(() => '?').join(',')})`
        )
        .bind(user.userId, ...roles)
    )
  }
  await db.batch(statements)
}

export function buildNotificationCopy(
  type: string,
  payload: Record<string, unknown>
): { title_ar: string; title_en: string; body_ar: string; body_en: string; url: string } {
  const potholeId = payload.pothole_id ? `#${payload.pothole_id}` : ''
  // Arabic says "رقم 12": a "#12" inside right-to-left text can show as "12#".
  const potholeAr = payload.pothole_id ? `رقم ${payload.pothole_id}` : ''
  if (type === 'status_change') {
    const status = String(payload.status || 'verified')
    const statusAr = STATUS_LABELS_AR[status] || status
    const statusEn = STATUS_LABELS_EN[status] || status
    return {
      title_ar: `تحديث حالة البلاغ ${potholeAr}`,
      title_en: `Report ${potholeId} status updated`,
      body_ar: `أصبحت حالة بلاغك الآن: ${statusAr}`,
      body_en: `Your report status is now: ${statusEn}`,
      url: payload.pothole_id ? `/pothole/${payload.pothole_id}` : '/account',
    }
  }
  if (type === 'donation_confirmed' || type === 'donation_rejected') {
    const amount = typeof payload.amount_lyd === 'number' ? payload.amount_lyd.toLocaleString('en-US', { maximumFractionDigits: 3 }) : ''
    const streetAr = typeof payload.street_ar === 'string' && payload.street_ar ? ` في ${payload.street_ar}` : ''
    const streetEn = typeof payload.street_en === 'string' && payload.street_en ? ` on ${payload.street_en}` : ''
    const url = payload.pothole_id ? `/pothole/${payload.pothole_id}` : '/account'
    if (type === 'donation_confirmed') {
      return {
        title_ar: 'تم تأكيد تبرعك، شكراً لك',
        title_en: 'Your donation is confirmed, thank you',
        body_ar: `وصل تبرعك بقيمة ${amount} د.ل لإصلاح الحفرة${streetAr}.`,
        body_en: `Your LYD ${amount} donation to repair the pothole${streetEn} has arrived.`,
        url,
      }
    }
    return {
      title_ar: 'لم نتمكن من تأكيد تبرعك',
      title_en: "We couldn't confirm your donation",
      body_ar: 'راجع سبب الرفض في تبرعاتي، ويمكنك المحاولة مجدداً.',
      body_en: 'See the reason in My donations; you can try again.',
      url,
    }
  }
  if (type === 'donation_review') {
    return {
      title_ar: 'تبرع جديد بانتظار المراجعة',
      title_en: 'New donation to review',
      body_ar: 'رفع متبرع صورة التحويل. راجعها وأكّد التبرع أو ارفضه.',
      body_en: 'A donor uploaded a transfer screenshot. Review it and confirm or reject.',
      url: payload.donation_id ? `/admin?donation=${payload.donation_id}` : '/admin',
    }
  }
  if (type === 'payout_changed') {
    return {
      title_ar: 'تغيّرت بيانات الحساب المصرفي للتبرعات',
      title_en: 'Donation bank details were changed',
      body_ar: `غيّر ${payload.by ?? 'مسؤول'} بيانات الحساب. تأكد أن التغيير مقصود.`,
      body_en: `${payload.by ?? 'An admin'} changed the bank details. Make sure this was intended.`,
      url: '/admin',
    }
  }
  if (type === 'legal_published') {
    return {
      title_ar: `نُشرت نسخة جديدة من المعلومات القانونية (${payload.version ?? ''})`,
      title_en: `A new version of the legal information was published (${payload.version ?? ''})`,
      body_ar: 'تغيير جوهري: سيُطلب من المستخدمين الموافقة عليه عند فتح التطبيق.',
      body_en: 'A material change: users will be asked to accept it when they open the app.',
      url: '/admin/settings',
    }
  }
  if (type === 'new_report') {
    const sev = String(payload.severity || 'medium')
    const sevAr = ({ minor: 'خفيفة', medium: 'متوسطة', severe: 'خطيرة' } as Record<string, string>)[sev] ?? sev
    return {
      title_ar: `بلاغ حفرة جديد ${potholeAr}`,
      title_en: `New pothole report ${potholeId}`,
      body_ar: `تم استلام بلاغ جديد بدرجة خطورة (${sevAr}) بانتظار المراجعة.`,
      body_en: `A new (${sev}) report is waiting for admin review.`,
      url: payload.pothole_id ? `/admin?report=${payload.pothole_id}` : '/admin',
    }
  }
  return {
    title_ar: 'إشعار من منصة حفرة',
    title_en: 'HUFRA Notification',
    body_ar: 'لديك تحديث جديد في حسابك.',
    body_en: 'You have a new update on your account.',
    url: '/',
  }
}

type PushEnv = Partial<Pick<Bindings, 'PUSH_WEBHOOK_URL' | 'FCM_SERVICE_ACCOUNT' | 'KV'>>

/**
 * Runs push delivery after the response is sent (Cloudflare's waitUntil), so
 * creating a report or changing a status never waits on Google. Without it
 * (tests, scripts) delivery is awaited inline.
 */
export type Defer = (task: Promise<unknown>) => void

/** waitUntil from a Hono context, when the runtime provides one. */
export function deferFrom(c: { executionCtx: { waitUntil(p: Promise<unknown>): void } }): Defer | undefined {
  try {
    const ctx = c.executionCtx
    return (task) => ctx.waitUntil(task)
  } catch {
    return undefined // no execution context (unit/integration tests)
  }
}

async function runPush(task: () => Promise<void>, defer?: Defer): Promise<void> {
  const guarded = task().catch((err) => {
    // Push is best-effort: never let it break the request that triggered it.
    console.error('push delivery failed:', err instanceof Error ? err.message : err)
  })
  if (defer) defer(guarded)
  else await guarded
}

function pushConfigured(env?: PushEnv): boolean {
  return !!(env?.FCM_SERVICE_ACCOUNT || env?.PUSH_WEBHOOK_URL)
}

export async function notifyAdmins(
  db: Bindings['DB'],
  type: string,
  payload: Record<string, unknown>,
  env?: PushEnv,
  defer?: Defer
): Promise<void> {
  const copy = buildNotificationCopy(type, payload)
  const enriched = { ...payload, ...copy }
  await db
    .prepare(`INSERT INTO notifications (target_role, type, payload_json) VALUES ('admin', ?, ?)`)
    .bind(type, JSON.stringify(enriched))
    .run()

  if (!pushConfigured(env)) return
  await runPush(async () => {
    const tokens = await db
      .prepare(
        `SELECT dpt.* FROM device_push_tokens dpt
         JOIN users u ON u.id = dpt.user_id
         WHERE dpt.active = 1 AND u.deleted_at IS NULL AND u.role IN ('admin', 'super_admin')`
      )
      .all<DevicePushTokenRow>()
    await dispatchPushToTokens(db, tokens.results, copy, env!)
  }, defer)
}

/** Which preference (users column) controls push for each kind of personal notification. */
const PUSH_PREFERENCE: Record<string, 'push_report_updates' | 'push_donation_updates'> = {
  status_change: 'push_report_updates',
  donation_confirmed: 'push_donation_updates',
  donation_rejected: 'push_donation_updates',
}

export async function notifyUser(
  db: Bindings['DB'],
  userId: number,
  type: string,
  payload: Record<string, unknown>,
  env?: PushEnv,
  defer?: Defer
): Promise<void> {
  const copy = buildNotificationCopy(type, payload)
  const enriched = { ...payload, ...copy }
  await db
    .prepare(`INSERT INTO notifications (target_user_id, type, payload_json) VALUES (?, ?, ?)`)
    .bind(userId, type, JSON.stringify(enriched))
    .run()

  if (!pushConfigured(env)) return
  // The inbox always has it; the phone is alerted only if the person wants this kind.
  const pref = PUSH_PREFERENCE[type]
  if (pref) {
    const row = await db.prepare(`SELECT ${pref} AS on_ FROM users WHERE id = ?`).bind(userId).first<{ on_: number }>()
    if (row && row.on_ === 0) return
  }
  await runPush(async () => {
    const tokens = await db
      .prepare(`SELECT * FROM device_push_tokens WHERE user_id = ? AND active = 1`)
      .bind(userId)
      .all<DevicePushTokenRow>()
    await dispatchPushToTokens(db, tokens.results, copy, env!)
  }, defer)
}

const SEND_CONCURRENCY = 10

/** Send one notification to many devices: FCM v1 for app tokens, the optional webhook for the rest. */
export async function dispatchPushToTokens(
  db: Bindings['DB'],
  tokens: DevicePushTokenRow[],
  copy: { title_ar: string; title_en: string; body_ar: string; body_en: string; url: string },
  env: PushEnv
): Promise<{ sent: number; failed: number; deactivated: number; skipped: number }> {
  const stats = { sent: 0, failed: 0, deactivated: 0, skipped: 0 }
  if (!tokens.length) return stats

  const sa = parseServiceAccount(env.FCM_SERVICE_ACCOUNT)
  const fcmTokens = sa ? tokens.filter((t) => isFcmToken(t.platform, t.token)) : []
  const otherTokens = tokens.filter((t) => !fcmTokens.includes(t))
  const messageFor = (t: DevicePushTokenRow): PushMessage => ({
    title: t.locale === 'en' ? copy.title_en : copy.title_ar,
    body: t.locale === 'en' ? copy.body_en : copy.body_ar,
    url: copy.url,
  })

  const dead: number[] = []
  if (sa && fcmTokens.length) {
    const accessToken = await getAccessToken(sa, env.KV)
    for (let i = 0; i < fcmTokens.length; i += SEND_CONCURRENCY) {
      const batch = fcmTokens.slice(i, i + SEND_CONCURRENCY)
      const results = await Promise.allSettled(batch.map((t) => sendFcmMessage(accessToken, sa.project_id, t.token, messageFor(t))))
      results.forEach((r, j) => {
        if (r.status === 'fulfilled' && r.value.ok) stats.sent++
        else {
          stats.failed++
          if (r.status === 'fulfilled' && !r.value.ok && r.value.tokenInvalid) dead.push(batch[j].id)
        }
      })
    }
  }

  if (env.PUSH_WEBHOOK_URL) {
    await Promise.allSettled(
      otherTokens.map((t) =>
        fetch(env.PUSH_WEBHOOK_URL!, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: t.token, platform: t.platform, endpoint_json: t.endpoint_json, notification: messageFor(t) }),
        }).then((res) => (res.ok ? stats.sent++ : stats.failed++))
      )
    )
  } else {
    stats.skipped += otherTokens.length
  }

  if (dead.length) {
    // The app was uninstalled or the token rotated: stop sending to it.
    await db
      .prepare(
        `UPDATE device_push_tokens SET active = 0, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id IN (${dead.map(() => '?').join(',')})`
      )
      .bind(...dead)
      .run()
    stats.deactivated = dead.length
  }
  return stats
}
