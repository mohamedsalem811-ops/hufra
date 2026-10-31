import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'
import { secureHeaders } from 'hono/secure-headers'
import type { Bindings } from './lib/types'

import authRoutes from './routes/auth'
import potholeRoutes from './routes/potholes'
import photoRoutes from './routes/photos'
import mediaRoutes from './routes/media'
import regionRoutes from './routes/regions'
import adminRoutes from './routes/admin'
import donorRoutes from './routes/donors'
import notificationRoutes from './routes/notifications'

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

const ALLOWED_MOBILE_ORIGINS = new Set([
  'capacitor://localhost',
  'ionic://localhost',
  'http://localhost',
  'https://localhost',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
])

app.use(
  '/api/*',
  cors({
    origin: (origin) => {
      if (!origin) return '*'
      if (ALLOWED_MOBILE_ORIGINS.has(origin) || origin.endsWith('.pages.dev')) {
        return origin
      }
      return origin
    },
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Refresh-Token'],
    credentials: true,
    maxAge: 86400,
  })
)

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
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'", 'data:'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https://*.tile.openstreetmap.org'],
      connectSrc: [
        "'self'",
        'https://*.tile.openstreetmap.org',
        'https://nominatim.openstreetmap.org',
        'capacitor://localhost',
        'https://localhost',
        'http://localhost',
      ],
      workerSrc: ["'self'"],
      manifestSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'self'"],
    },
    strictTransportSecurity: 'max-age=15552000; includeSubDomains',
    xFrameOptions: 'SAMEORIGIN',
    referrerPolicy: 'strict-origin-when-cross-origin',
  })
)

app.use('/static/*', serveStatic({ root: './public' }))
app.use('/favicon.svg', serveStatic({ path: './public/favicon.svg' }))
app.use('/manifest.webmanifest', serveStatic({ path: './public/manifest.webmanifest' }))
app.use('/sw.js', serveStatic({ path: './public/sw.js' }))

app.route('/api/auth', authRoutes)
app.route('/api/potholes', potholeRoutes)
app.route('/api/photos', photoRoutes)
app.route('/api/regions', regionRoutes)
app.route('/api/admin', adminRoutes)
app.route('/api/donors', donorRoutes)
app.route('/api/notifications', notificationRoutes)

app.route('/media', mediaRoutes)

app.get('/', (c) => c.html(renderHomePage(c.env.ADMIN_WHATSAPP)))
app.get('/map', (c) => c.html(renderMapPage()))
app.get('/report', (c) => c.html(renderReportPage()))
app.get('/transparency', (c) => c.html(renderTransparencyPage()))
app.get('/trust', (c) => c.html(renderTrustPage()))

app.get('/pothole/:id', (c) => c.html(renderPotholeDetailPage(c.req.param('id'))))

app.get('/login', (c) => c.html(renderLoginPage()))
app.get('/register', (c) => c.html(renderRegisterPage()))
app.get('/account', (c) => c.html(renderAccountPage()))

app.get('/admin', (c) => c.html(renderAdminPage()))

app.notFound((c) => c.text('Not found', 404))

export default app
