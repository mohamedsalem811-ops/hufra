import { describe, it, expect } from 'vitest'
import { recordAudit, hashIp } from '../../src/lib/audit'
import { FakeD1Database } from '../integration/helpers/fake-bindings'

describe('recordAudit', () => {
  it('inserts a row into audit_logs with the expected columns bound', async () => {
    const db = new FakeD1Database()
    await recordAudit(db as any, {
      actorId: 7,
      action: 'pothole.create',
      entity: 'potholes',
      entityId: 42,
      before: null,
      after: { status: 'reported' },
    })

    expect(db.calls).toHaveLength(1)
    expect(db.calls[0].sql).toContain('INSERT INTO audit_logs')
    const [actorId, action, entity, entityId, beforeJson, afterJson, ipHash] = db.calls[0].params
    expect(actorId).toBe(7)
    expect(action).toBe('pothole.create')
    expect(entity).toBe('potholes')
    expect(entityId).toBe(42)
    // `before: null` is an explicit value (not undefined), so per the
    // implementation's `!== undefined` check it gets JSON.stringify'd to
    // the literal string "null" rather than stored as SQL NULL. Omitting
    // the `before` key entirely (see next test) is what produces a real
    // SQL NULL.
    expect(beforeJson).toBe('null')
    expect(afterJson).toBe(JSON.stringify({ status: 'reported' }))
    expect(ipHash).toBeNull()
  })

  it('stores SQL NULL for before/after when the keys are omitted entirely', async () => {
    const db = new FakeD1Database()
    await recordAudit(db as any, { actorId: 1, action: 'pothole.create', entity: 'potholes', entityId: 1 })
    const [, , , , beforeJson, afterJson] = db.calls[0].params
    expect(beforeJson).toBeNull()
    expect(afterJson).toBeNull()
  })

  it('serializes before/after as JSON strings when provided', async () => {
    const db = new FakeD1Database()
    await recordAudit(db as any, {
      actorId: null,
      action: 'pothole.status_change',
      entity: 'potholes',
      entityId: 1,
      before: { status: 'reported' },
      after: { status: 'verified' },
      ipHash: 'abc123',
    })
    const [, , , , beforeJson, afterJson, ipHash] = db.calls[0].params
    expect(JSON.parse(beforeJson as string)).toEqual({ status: 'reported' })
    expect(JSON.parse(afterJson as string)).toEqual({ status: 'verified' })
    expect(ipHash).toBe('abc123')
  })

  it('allows a null actorId for guest-originated actions', async () => {
    const db = new FakeD1Database()
    await recordAudit(db as any, { actorId: null, action: 'pothole.create', entity: 'potholes', entityId: 1 })
    expect(db.calls[0].params[0]).toBeNull()
  })
})

describe('hashIp', () => {
  it('produces a 64-char hex SHA-256 digest', async () => {
    const hash = await hashIp('203.0.113.5', 'some-salt')
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is deterministic for the same ip + salt', async () => {
    const h1 = await hashIp('203.0.113.5', 'salt-1')
    const h2 = await hashIp('203.0.113.5', 'salt-1')
    expect(h1).toBe(h2)
  })

  it('produces different hashes for different salts (per-deployment secret)', async () => {
    const h1 = await hashIp('203.0.113.5', 'salt-1')
    const h2 = await hashIp('203.0.113.5', 'salt-2')
    expect(h1).not.toBe(h2)
  })

  it('produces different hashes for different IPs', async () => {
    const h1 = await hashIp('203.0.113.5', 'salt')
    const h2 = await hashIp('198.51.100.7', 'salt')
    expect(h1).not.toBe(h2)
  })

  it('never leaks the raw IP in the output', async () => {
    const hash = await hashIp('203.0.113.5', 'salt')
    expect(hash).not.toContain('203.0.113.5')
  })
})
