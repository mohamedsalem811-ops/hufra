// Plan 7.1: the OpenAPI description covers every /api endpoint the Worker
// serves, and is built from the shared schemas.
import { describe, it, expect, beforeEach } from 'vitest'
import app from '../../src/index'
import { ENDPOINTS, buildOpenApi } from '../../src/lib/openapi'
import { createTestEnv, request, json, type TestEnv } from './helpers/test-env'

const served = () => {
  const out = new Set<string>()
  for (const r of (app as unknown as { routes: { method: string; path: string }[] }).routes) {
    if (r.method === 'ALL' || !r.path.startsWith('/api/')) continue
    out.add(`${r.method} ${r.path}`)
  }
  return out
}
const listed = () => new Set(ENDPOINTS.map((e) => `${e.method.toUpperCase()} ${e.path}`))

let t: TestEnv
beforeEach(async () => {
  t = await createTestEnv()
})

describe('OpenAPI description', () => {
  it('lists every /api route the Worker serves', () => {
    const missing = [...served()].filter((r) => !listed().has(r))
    expect(missing, 'add these to ENDPOINTS in src/lib/openapi.ts').toEqual([])
  })

  it('lists nothing the Worker does not serve, and nothing twice', () => {
    const extra = [...listed()].filter((r) => !served().has(r))
    expect(extra).toEqual([])
    expect(listed().size).toBe(ENDPOINTS.length)
  })

  it('is served as OpenAPI 3 with request and response schemas', async () => {
    const res = await request(t.env, '/api/openapi.json')
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toContain('public')
    const doc = await json(res)
    expect(doc.openapi).toMatch(/^3\./)
    expect(Object.keys(doc.paths).every((p: string) => p.startsWith('/api/') && !p.includes(':'))).toBe(true)

    const create = doc.paths['/api/potholes'].post
    expect(create.requestBody.content['application/json'].schema.properties).toHaveProperty('lat')
    expect(create.responses['201']).toBeDefined()

    const detail = doc.paths['/api/potholes/{id}'].get
    expect(detail.parameters).toContainEqual(expect.objectContaining({ name: 'id', in: 'path', required: true }))
    expect(detail.responses['200'].content['application/json'].schema.properties).toHaveProperty('pothole')

    const mine = doc.paths['/api/potholes/mine/list'].get
    expect(mine.security).toEqual([{ bearer: [] }])
    expect(mine.parameters.map((p: { name: string }) => p.name)).toEqual(expect.arrayContaining(['limit', 'cursor']))
    expect(mine.responses['200'].content['application/json'].schema.required).toContain('next_cursor')

    const upload = doc.paths['/api/photos/{potholeId}'].post
    expect(upload.requestBody.content['multipart/form-data'].schema.required).toEqual(['full', 'thumb'])
  })

  it('marks admin-only endpoints', () => {
    const doc = buildOpenApi('https://hufra.test')
    expect(doc.paths['/api/admin/audit-logs'].get).toMatchObject({ description: 'Super admins only.', security: [{ bearer: [] }] })
    expect((doc.paths['/api/admin/audit-logs'].get as { responses: object }).responses).toHaveProperty('403')
    expect(doc.paths['/api/regions'].get).not.toHaveProperty('security')
  })
})
