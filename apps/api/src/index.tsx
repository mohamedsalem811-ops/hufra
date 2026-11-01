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

const app = new Hono<{ Bindings: Bindings }>()

// Only trusted origins may call the API with credentials (see src/lib/origins.ts).
app.use(
  '/api/*',
  cors({
    origin: (origin, c) => (isAllowedOrigin(origin, c.req.url, c.env) ? origin : null),
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
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

app.route('/api/auth', authRoutes)
app.route('/api/potholes', potholeRoutes)
app.route('/api/photos', photoRoutes)
app.route('/api/regions', regionRoutes)
app.route('/api/admin', adminRoutes)
app.route('/api/donors', donorRoutes)
app.route('/api/notifications', notificationRoutes)

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

app.get('/login', (c) => c.html(renderLoginPage()))
app.get('/register', (c) => c.html(renderRegisterPage()))
app.get('/account', (c) => c.html(renderAccountPage()))

app.get('/admin', (c) => c.html(renderAdminPage()))

app.notFound((c) => c.text('Not found', 404))

export default app
