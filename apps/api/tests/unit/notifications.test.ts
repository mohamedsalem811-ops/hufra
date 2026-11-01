import { describe, it, expect } from 'vitest'
import { notifyAdmins, notifyUser } from '../../src/lib/notifications'
import { FakeD1Database } from '../integration/helpers/fake-bindings'

describe('notifyAdmins', () => {
  it('inserts a notification targeted at the admin role', async () => {
    const db = new FakeD1Database()
    await notifyAdmins(db as any, 'new_report', { pothole_id: 5, severity: 'severe' })

    expect(db.calls).toHaveLength(1)
    expect(db.calls[0].sql).toContain("target_role, type, payload_json")
    expect(db.calls[0].sql).toContain("'admin'")
    const [type, payloadJson] = db.calls[0].params
    expect(type).toBe('new_report')
    expect(JSON.parse(payloadJson as string)).toMatchObject({ pothole_id: 5, severity: 'severe' })
  })
})

describe('notifyUser', () => {
  it('inserts a notification targeted at a specific user', async () => {
    const db = new FakeD1Database()
    await notifyUser(db as any, 11, 'status_change', { pothole_id: 5, status: 'verified' })

    expect(db.calls).toHaveLength(1)
    expect(db.calls[0].sql).toContain('target_user_id')
    const [userId, type, payloadJson] = db.calls[0].params
    expect(userId).toBe(11)
    expect(type).toBe('status_change')
    expect(JSON.parse(payloadJson as string)).toMatchObject({ pothole_id: 5, status: 'verified' })
  })
})
