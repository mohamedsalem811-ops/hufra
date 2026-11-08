import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import type { Bindings } from './lib/types'
import { isAllowedOrigin, isForbiddenCrossSiteWrite } from './lib/origins'

import authRoutes from './routes/auth'
import potholeRoutes from './routes/potholes'
import photoRoutes from './routes/photos'
import mediaRoutes from './routes/media'
import regionRoutes from './routes/regions'
import adminRoutes from './routes/admin'
import donorRoutes from './routes/donors'
import notificationRoutes from './routes/notifications'
import campaignRoutes from './routes/campaigns'
import appInfoRoutes from './routes/app-info'
import donationRoutes from './routes/donations'
import adminDonationRoutes from './routes/admin-donations'
import adminReportRoutes from './routes/admin-reports'
import adminSettingsRoutes from './routes/admin-settings'
import siteRoutes from './routes/site'
import { adminPartners, publicPartners } from './routes/partners'
import tileRoutes from './routes/tiles'

import { renderHomePage } from './pages/home'
import { renderMapPage } from './pages/map'
import { renderReportPage } from './pages/report'
import { renderPotholeDetailPage } from './pages/pothole-detail'
import { renderTransparencyPage } from './pages/transparency'
import { renderTrustPage } from './pages/trust'
import { renderLoginPage, renderRegisterPage } from './pages/auth-pages'
import { renderAccountPage } from './pages/account'
import { renderAdminPage } from './pages/admin'
import { renderDonatePage } from './pages/donate'
import { bodyLimit } from 'hono/body-limit'
import { buildOpenApi } from './lib/openapi'

const API_BODY_LIMIT_BYTES = 64 * 1024

const app = new Hono<{ Bindings: Bindings }>()

// Only trusted origins may call the API with credentials (see src/lib/origins.ts).
app.use(
  '/api/*',
  cors({
    origin: (origin, c) => (isAllowedOrigin(origin, c.req.url, c.env) ? origin : null),
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Refresh-Token'],
    credentials: true,
    maxAge: 86400,
  })
)

// CORS only hides responses from other sites; it does not stop the request
// itself. Refuse state-changing API calls sent by untrusted web pages (CSRF).
app.use('/api/*', async (c, next) => {
  if (isForbiddenCrossSiteWrite(c.req.method, c.req.header('Origin'), c.req.url, c.env)) {
    return c.json({ error: 'Cross-site request refused', error_ar: 'تم رفض طلب من موقع خارجي' }, 403)
  }
  return next()
})

app.use(
  '/media/*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'HEAD', 'OPTIONS'],
    maxAge: 86400,
  })
)

app.use(
  '*',
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      // No inline scripts anywhere (see public/static/js/boot*.js): only files
      // served by this site can run, so injected markup cannot execute code.
      scriptSrc: ["'self'"],
      scriptSrcAttr: ["'none'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'", 'data:'],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: [
        "'self'",
        'https://nominatim.openstreetmap.org',
        'capacitor://localhost',
        'https://localhost',
        'http://localhost',
      ],
      workerSrc: ["'self'"],
      manifestSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
    },
    strictTransportSecurity: 'max-age=15552000; includeSubDomains',
    xFrameOptions: 'SAMEORIGIN',
    referrerPolicy: 'strict-origin-when-cross-origin',
  })
)


// Static files (public/) are served by the platform before this code runs:
// Cloudflare Pages today, Workers Static Assets on the Worker (wrangler.worker.jsonc).

// Plan 7.2: plain API bodies are small (the largest is a report with its
// note). Uploads have their own, larger limits in their routes.
const UPLOAD_PATHS = /^\/api\/(photos\/\d+|donations\/\d+\/proof|admin\/campaigns\/\d+\/receipt|admin\/partners\/\d+\/logo)$/
const jsonBodyLimit = bodyLimit({
  maxSize: API_BODY_LIMIT_BYTES,
  onError: (c) => c.json({ error: 'Request too large', error_ar: 'الطلب كبير جداً' }, 413),
})
app.use('/api/*', (c, next) => (UPLOAD_PATHS.test(c.req.path) ? next() : jsonBodyLimit(c, next)))

// Answers that differ by who is signed in must never be shared between people
// by a cache on the way (an office proxy, a carrier cache).
app.use('/api/*', async (c, next) => {
  await next()
  c.res.headers.append('Vary', 'Authorization, Cookie')
})

// OpenAPI description of every endpoint, from the shared schemas (plan 7.1).
app.get('/api/openapi.json', (c) => {
  c.header('Cache-Control', 'public, max-age=3600')
  return c.json(buildOpenApi(new URL(c.req.url).origin))
})
app.route('/api/auth', authRoutes)
app.route('/api/potholes', potholeRoutes)
app.route('/api/photos', photoRoutes)
app.route('/api/regions', regionRoutes)
app.route('/api/admin', adminRoutes)
app.route('/api/donors', donorRoutes)
app.route('/api/notifications', notificationRoutes)
app.route('/api/campaigns', campaignRoutes)
app.route('/api/app', appInfoRoutes)
app.route('/api/donations', donationRoutes)
app.route('/api/admin', adminDonationRoutes)
app.route('/api/admin', adminReportRoutes)
app.route('/api/admin', adminSettingsRoutes)
app.route('/api/admin', adminPartners)
app.route('/api/partners', publicPartners)
app.route('/api/site', siteRoutes)

app.route('/media', mediaRoutes)
app.route('/tiles', tileRoutes)

app.get('/', (c) => c.html(renderHomePage(c.env.ADMIN_WHATSAPP)))
app.get('/map', (c) => c.html(renderMapPage()))
app.get('/report', (c) => c.html(renderReportPage()))
app.get('/transparency', (c) => c.html(renderTransparencyPage()))
app.get('/trust', (c) => c.html(renderTrustPage()))

// Report ids are integers (0 is the template the native app build renders, see
// scripts/build-app.mjs); anything else is a 404 and is never echoed back.
app.get('/pothole/:id', (c) => {
  const raw = c.req.param('id')
  if (!/^(0|[1-9]\d{0,9})$/.test(raw)) return c.notFound()
  return c.html(renderPotholeDetailPage(Number(raw)))
})

// Donation pages (plan 6.9): campaign, my donations, one donation.
const pageId = (raw: string) => (/^[1-9]\d{0,9}$/.test(raw) ? Number(raw) : null)
app.get('/donate/:id', (c) => {
  const id = pageId(c.req.param('id'))
  return id ? c.html(renderDonatePage('campaign', id, c.env.ADMIN_WHATSAPP)) : c.notFound()
})
app.get('/donations', (c) => c.html(renderDonatePage('mine', null, c.env.ADMIN_WHATSAPP)))
app.get('/donations/:id', (c) => {
  const id = pageId(c.req.param('id'))
  return id ? c.html(renderDonatePage('donation', id, c.env.ADMIN_WHATSAPP)) : c.notFound()
})

app.get('/login', (c) => c.html(renderLoginPage()))
app.get('/register', (c) => c.html(renderRegisterPage()))
app.get('/account', (c) => c.html(renderAccountPage()))

app.get('/admin', (c) => c.html(renderAdminPage()))

app.notFound((c) => c.text('Not found', 404))

export default app
