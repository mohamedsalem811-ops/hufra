// In-dashboard + mobile push notification helper (bell/badge + push alerts
// for admins on new reports, and status-update notifications for report owners).

import type { Bindings, DevicePushTokenRow } from './types'

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

export function buildNotificationCopy(
  type: string,
  payload: Record<string, unknown>
): { title_ar: string; title_en: string; body_ar: string; body_en: string; url: string } {
  const potholeId = payload.pothole_id ? `#${payload.pothole_id}` : ''
  if (type === 'status_change') {
    const status = String(payload.status || 'verified')
    const statusAr = STATUS_LABELS_AR[status] || status
    const statusEn = STATUS_LABELS_EN[status] || status
    return {
      title_ar: `تحديث حالة البلاغ ${potholeId}`,
      title_en: `Report ${potholeId} status updated`,
      body_ar: `أصبحت حالة بلاغك الآن: ${statusAr}`,
      body_en: `Your report status is now: ${statusEn}`,
      url: payload.pothole_id ? `/pothole/${payload.pothole_id}` : '/account',
    }
  }
  if (type === 'new_report') {
    const sev = String(payload.severity || 'medium')
    return {
      title_ar: `بلاغ حفرة جديد ${potholeId}`,
      title_en: `New pothole report ${potholeId}`,
      body_ar: `تم استلام بلاغ جديد بدرجة خطورة (${sev}) بانتظار المراجعة.`,
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

export async function notifyAdmins(
  db: Bindings['DB'],
  type: string,
  payload: Record<string, unknown>,
  env?: Pick<Bindings, 'PUSH_WEBHOOK_URL' | 'FCM_SERVER_KEY'>
): Promise<void> {
  const copy = buildNotificationCopy(type, payload)
  const enriched = { ...payload, ...copy }
  await db
    .prepare(
      `INSERT INTO notifications (target_role, type, payload_json) VALUES ('admin', ?, ?)`
    )
    .bind(type, JSON.stringify(enriched))
    .run()

  if (env?.PUSH_WEBHOOK_URL || env?.FCM_SERVER_KEY) {
    try {
      const tokens = await db
        .prepare(
          `SELECT dpt.* FROM device_push_tokens dpt
           JOIN users u ON u.id = dpt.user_id
           WHERE dpt.active = 1 AND u.deleted_at IS NULL AND u.role IN ('admin', 'super_admin')`
        )
        .all<DevicePushTokenRow>()
      await dispatchPushToTokens(tokens.results, copy, env)
    } catch {
      // Never block report creation if push table or external push gateway fails
    }
  }
}

export async function notifyUser(
  db: Bindings['DB'],
  userId: number,
  type: string,
  payload: Record<string, unknown>,
  env?: Pick<Bindings, 'PUSH_WEBHOOK_URL' | 'FCM_SERVER_KEY'>
): Promise<void> {
  const copy = buildNotificationCopy(type, payload)
  const enriched = { ...payload, ...copy }
  await db
    .prepare(
      `INSERT INTO notifications (target_user_id, type, payload_json) VALUES (?, ?, ?)`
    )
    .bind(userId, type, JSON.stringify(enriched))
    .run()

  if (env?.PUSH_WEBHOOK_URL || env?.FCM_SERVER_KEY) {
    try {
      const tokens = await db
        .prepare(
          `SELECT * FROM device_push_tokens WHERE user_id = ? AND active = 1`
        )
        .bind(userId)
        .all<DevicePushTokenRow>()
      await dispatchPushToTokens(tokens.results, copy, env)
    } catch {
      // Non-blocking push delivery
    }
  }
}

async function dispatchPushToTokens(
  tokens: DevicePushTokenRow[],
  copy: { title_ar: string; title_en: string; body_ar: string; body_en: string; url: string },
  env: Pick<Bindings, 'PUSH_WEBHOOK_URL' | 'FCM_SERVER_KEY'>
): Promise<void> {
  if (!tokens.length) return
  for (const t of tokens) {
    const title = t.locale === 'en' ? copy.title_en : copy.title_ar
    const body = t.locale === 'en' ? copy.body_en : copy.body_ar
    if (env.FCM_SERVER_KEY && (t.platform === 'android' || t.platform === 'ios')) {
      await fetch('https://fcm.googleapis.com/fcm/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `key=${env.FCM_SERVER_KEY}`,
        },
        body: JSON.stringify({
          to: t.token,
          notification: { title, body, sound: 'default' },
          data: { url: copy.url, platform: t.platform },
        }),
      }).catch(() => null)
    } else if (env.PUSH_WEBHOOK_URL) {
      await fetch(env.PUSH_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: t.token,
          platform: t.platform,
          endpoint_json: t.endpoint_json,
          notification: { title, body, url: copy.url },
        }),
      }).catch(() => null)
    }
  }
}
