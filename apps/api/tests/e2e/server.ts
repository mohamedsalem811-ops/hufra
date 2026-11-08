// Local server for browser tests of the website: the real API (src/index.tsx)
// on the in-memory test database, plus public/ static files. Not used in production.
//   npx tsx apps/api/tests/e2e/server.ts [port]   (prints the seed as JSON on its first line)
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createTestEnv, request } from '../integration/helpers/test-env'

const port = Number(process.argv[2] || 8788)
const t = createTestEnv()
const pub = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public')
const TYPES: Record<string, string> = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.png': 'image/png', '.webmanifest': 'application/manifest+json' }

// Seed: a super admin, a donor, a report with a photo, donations open, one campaign.
const PW = 'Str0ngP@ssw0rd!'
const call = (p: string, init: RequestInit = {}) => request(t.env, p, init)
const jsonCall = async (p: string, body: unknown, token?: string, method = 'POST') =>
  (await call(p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) })).json() as Promise<any>
async function seed() {
  for (const [email, name] of [['owner@e2e.ly', 'المالك'], ['donor@e2e.ly', 'سالم']]) {
    await jsonCall('/api/auth/register', { email, password: PW, consent: true, display_name: name })
  }
  await t.db.prepare(`UPDATE users SET role = 'super_admin' WHERE email = 'owner@e2e.ly'`).run()
  const owner = (await jsonCall('/api/auth/login', { email: 'owner@e2e.ly', password: PW })).access_token
  const donor = (await jsonCall('/api/auth/login', { email: 'donor@e2e.ly', password: PW })).access_token
  const created = await jsonCall('/api/potholes', { lat: 32.8872, lng: 13.1913, severity: 'severe', street_ar: 'شارع الجمهورية', street_en: 'Al Jumhuriya St' }, donor)
  const fix = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/photos')
  const fd = new FormData()
  fd.append('full', new File([fs.readFileSync(path.join(fix, 'full.webp'))], 'p', { type: 'image/webp' }))
  fd.append('thumb', new File([fs.readFileSync(path.join(fix, 'thumb.webp'))], 't', { type: 'image/webp' }))
  fd.append('upload_token', created.upload_token)
  await call(`/api/photos/${created.id}`, { method: 'POST', body: fd })
  await jsonCall('/api/admin/settings/donations', {
    enabled: true, account_holder: 'شركة حفرة للخدمات', bank_name: 'مصرف الجمهورية', iban: 'LY83002048000020100120361',
    account_number: '0012345678901', open_mode_ios: 'in_app', open_mode_android: 'in_app', current_password: PW,
  }, owner, 'PUT')
  const camp = await jsonCall('/api/admin/campaigns', { pothole_id: created.id, target_lyd: 1200 }, owner)
  console.log(JSON.stringify({ campaign: camp.campaign.id, pothole: created.id, owner, donor }))
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${port}`)
    const file = path.join(pub, decodeURIComponent(url.pathname))
    if ((url.pathname.startsWith('/static/') || url.pathname === '/favicon.svg') && file.startsWith(pub) && fs.existsSync(file)) {
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' })
      fs.createReadStream(file).pipe(res)
      return
    }
    const chunks: Buffer[] = []
    for await (const c of req) chunks.push(c as Buffer)
    const headers = new Headers()
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
    const r = await request(t.env, url.pathname + url.search, {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method || 'GET') ? undefined : Buffer.concat(chunks),
      redirect: 'manual',
    })
    const out: Record<string, string | string[]> = {}
    r.headers.forEach((v, k) => {
      if (k === 'set-cookie') return
      out[k] = v
    })
    const cookies = (r.headers as any).getSetCookie?.() ?? []
    if (cookies.length) out['set-cookie'] = cookies
    const payload = Buffer.from(await r.arrayBuffer())
    res.writeHead(r.status, out)
    res.end(payload)
    // One line per API call, so a failed end-to-end run shows what the app asked for.
    if (url.pathname.startsWith('/api/')) {
      const detail = r.status >= 400 ? ` ${payload.toString('utf8').slice(0, 200)}` : ''
      console.log(`${new Date().toISOString()} ${req.method} ${url.pathname} ${r.status}${detail}`)
    }
  })
  .listen(port, async () => {
    if (!process.argv.includes('--no-seed')) await seed()
    console.log(`e2e server on http://localhost:${port}`)
  })
