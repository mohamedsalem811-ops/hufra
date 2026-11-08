import * as c from '@hufra/contracts'
import { z } from 'zod'

/**
 * The OpenAPI description of every /api endpoint (plan 7.1), built from the
 * same zod schemas the server validates with and the app parses with.
 * A test checks that every route the Worker serves is listed here, so the
 * description cannot fall behind the code.
 */

type Access = 'public' | 'optional' | 'user' | 'admin' | 'super_admin'

export interface Endpoint {
  method: 'get' | 'post' | 'put' | 'patch' | 'delete'
  /** Hono path, e.g. /api/potholes/:id */
  path: string
  tag: string
  summary: string
  access: Access
  query?: z.ZodObject
  body?: z.ZodType
  /** multipart/form-data fields, for uploads. */
  form?: Record<string, { type: 'file' | 'string'; required?: boolean; description?: string }>
  response?: z.ZodType
  /** A response that is not JSON (an image, a file). */
  responseType?: string
  /** Success status, when not 200. */
  status?: 201 | 302
}

const refreshBody = z.object({ refresh_token: z.string().optional() }).describe('Or the X-Refresh-Token header, or the website cookie')

const id = (path: string) => [...path.matchAll(/:(\w+)/g)].map((m) => m[1])

export const ENDPOINTS: Endpoint[] = [
  { method: 'get', path: '/api/openapi.json', tag: 'App', summary: 'This description', access: 'public' },

  // Accounts
  { method: 'post', path: '/api/auth/register', tag: 'Accounts', summary: 'Create an account', access: 'public', body: c.registerSchema, response: c.registerResponseSchema, status: 201 },
  { method: 'post', path: '/api/auth/login', tag: 'Accounts', summary: 'Sign in (cookies for the website and admin panel, tokens for the app)', access: 'public', body: c.loginSchema, response: c.loginResponseSchema },
  { method: 'post', path: '/api/auth/refresh', tag: 'Accounts', summary: 'Swap a refresh token for new tokens (the old one stops working)', access: 'public', body: refreshBody, response: c.refreshResponseSchema },
  { method: 'post', path: '/api/auth/logout', tag: 'Accounts', summary: 'Sign out this device', access: 'public', body: refreshBody, response: c.okResponseSchema },
  { method: 'post', path: '/api/auth/change-password', tag: 'Accounts', summary: 'Change the password', access: 'user', body: c.changePasswordSchema, response: c.okResponseSchema },
  { method: 'get', path: '/api/auth/me', tag: 'Accounts', summary: 'The signed-in person', access: 'user', response: c.meResponseSchema },
  { method: 'get', path: '/api/auth/me/export', tag: 'Accounts', summary: 'Download all my data (JSON)', access: 'user' },
  { method: 'post', path: '/api/auth/me/delete', tag: 'Accounts', summary: 'Delete my account; reports stay without my name', access: 'user', response: c.okResponseSchema },
  { method: 'post', path: '/api/auth/web-handoff', tag: 'Accounts', summary: 'One-minute link that signs the app user in on the website', access: 'user', body: c.webHandoffSchema, response: c.webHandoffResponseSchema },
  { method: 'get', path: '/api/auth/handoff', tag: 'Accounts', summary: 'Opens a web-handoff link and redirects to the page', access: 'public', query: z.object({ t: z.string() }), responseType: 'text/html', status: 302 },

  // Reports
  { method: 'get', path: '/api/potholes', tag: 'Reports', summary: 'Reports for the map and lists (admins see more fields)', access: 'optional', query: c.listPotholesQuerySchema, response: c.publicPotholeListResponseSchema },
  { method: 'get', path: '/api/potholes/counters', tag: 'Reports', summary: 'City totals', access: 'public', response: c.countersResponseSchema },
  { method: 'get', path: '/api/potholes/recent-fixed', tag: 'Reports', summary: 'Recently fixed potholes', access: 'public', response: c.recentFixedResponseSchema },
  { method: 'get', path: '/api/potholes/showcase', tag: 'Reports', summary: 'Before/after photos of fixed potholes', access: 'public', response: c.showcaseResponseSchema },
  { method: 'get', path: '/api/potholes/top-reporter', tag: 'Reports', summary: 'Most active reporter this month (public code only)', access: 'public', response: c.topReporterResponseSchema },
  { method: 'get', path: '/api/potholes/mine/list', tag: 'Reports', summary: 'My reports, newest first, paged', access: 'user', query: c.pageQuerySchema, response: c.myPotholesResponseSchema },
  { method: 'get', path: '/api/potholes/:id', tag: 'Reports', summary: 'One report with photos and history', access: 'optional', response: c.publicPotholeDetailResponseSchema },
  { method: 'get', path: '/api/potholes/:id/share', tag: 'Reports', summary: 'Public card for a shared link (never the reporter)', access: 'public', response: c.sharedReportResponseSchema },
  { method: 'post', path: '/api/potholes', tag: 'Reports', summary: 'Report a pothole (account needed once REPORTS_REQUIRE_ACCOUNT is on)', access: 'optional', body: c.createPotholeSchema, response: c.createPotholeResponseSchema, status: 201 },
  { method: 'post', path: '/api/potholes/:id/upvote', tag: 'Reports', summary: '"I saw it too" (201 the first time, 200 if already counted)', access: 'optional', response: c.upvoteResponseSchema, status: 201 },
  { method: 'patch', path: '/api/potholes/:id/status', tag: 'Reports', summary: 'Change the status (notifies the reporter)', access: 'admin', body: c.updateStatusSchema, response: c.statusChangeResponseSchema },
  { method: 'delete', path: '/api/potholes/:id', tag: 'Reports', summary: 'Delete a report', access: 'admin', response: c.okResponseSchema },
  {
    method: 'post', path: '/api/photos/:potholeId', tag: 'Reports', summary: 'Upload the photo of a report (full size and thumbnail)', access: 'optional',
    form: {
      full: { type: 'file', required: true },
      thumb: { type: 'file', required: true },
      stage: { type: 'string', description: 'report (default); other stages are for admins' },
      upload_token: { type: 'string', description: 'From the create-report response, for a signed-out reporter' },
    },
    response: c.photoUploadResponseSchema,
    status: 201,
  },
  { method: 'delete', path: '/api/photos/:photoId', tag: 'Reports', summary: 'Delete a photo', access: 'admin', response: c.okResponseSchema },

  // Regions
  { method: 'get', path: '/api/regions', tag: 'Regions', summary: 'Regions of Tripoli', access: 'public', response: c.regionListResponseSchema },
  { method: 'post', path: '/api/regions', tag: 'Regions', summary: 'Add a region', access: 'admin', body: c.regionInputSchema, status: 201 },
  { method: 'patch', path: '/api/regions/:id', tag: 'Regions', summary: 'Edit a region', access: 'admin', body: c.regionInputSchema.partial() },
  { method: 'delete', path: '/api/regions/:id', tag: 'Regions', summary: 'Remove a region', access: 'admin', response: c.okResponseSchema },

  // Notifications
  { method: 'get', path: '/api/notifications', tag: 'Notifications', summary: 'My inbox, newest first, paged', access: 'user', query: c.pageQuerySchema, response: c.notificationListResponseSchema },
  { method: 'post', path: '/api/notifications/read-all', tag: 'Notifications', summary: 'Mark all read', access: 'user', response: c.okResponseSchema },
  { method: 'get', path: '/api/notifications/preferences', tag: 'Notifications', summary: 'Which notifications also alert the phone', access: 'user', response: c.notificationPreferencesSchema },
  { method: 'put', path: '/api/notifications/preferences', tag: 'Notifications', summary: 'Change which notifications alert the phone', access: 'user', body: c.updateNotificationPreferencesSchema, response: c.notificationPreferencesSchema },
  { method: 'post', path: '/api/notifications/push-token', tag: 'Notifications', summary: 'Register this phone for push', access: 'user', body: c.pushTokenSchema, status: 201 },
  { method: 'delete', path: '/api/notifications/push-token', tag: 'Notifications', summary: 'Stop push to this phone', access: 'user', body: c.pushTokenSchema.pick({ token: true }), response: c.okResponseSchema },

  // App
  { method: 'get', path: '/api/app/version', tag: 'App', summary: 'Is this app version still supported?', access: 'public', query: c.appVersionQuerySchema, response: c.appVersionResponseSchema },
  { method: 'get', path: '/api/app/version-settings', tag: 'App', summary: 'Latest and minimum app versions', access: 'admin', response: c.appVersionSettingsSchema },
  { method: 'put', path: '/api/app/version-settings', tag: 'App', summary: 'Set latest and minimum app versions', access: 'super_admin', body: c.appVersionSettingsSchema, response: c.appVersionSettingsSchema },

  // Donations
  { method: 'get', path: '/api/donations/config', tag: 'Donations', summary: 'Whether donations are on, and how the app opens them', access: 'public', response: c.donationConfigResponseSchema },
  { method: 'get', path: '/api/campaigns', tag: 'Donations', summary: 'Active campaigns', access: 'public', response: c.campaignListResponseSchema },
  { method: 'get', path: '/api/campaigns/by-pothole/:potholeId', tag: 'Donations', summary: 'The campaign of a report, if any', access: 'public', response: c.potholeCampaignResponseSchema },
  { method: 'get', path: '/api/campaigns/:id', tag: 'Donations', summary: 'A campaign with its donor wall', access: 'public', response: c.campaignDetailResponseSchema },
  { method: 'post', path: '/api/campaigns/:id/donations', tag: 'Donations', summary: 'Start a donation (gives the bank details and a reference)', access: 'user', body: c.createDonationSchema, response: c.createDonationResponseSchema, status: 201 },
  { method: 'get', path: '/api/donations/mine', tag: 'Donations', summary: 'My donations, newest first, paged', access: 'user', query: c.pageQuerySchema, response: c.myDonationsResponseSchema },
  { method: 'get', path: '/api/donations/:id', tag: 'Donations', summary: 'One of my donations', access: 'user', response: c.donationDetailResponseSchema },
  {
    method: 'post', path: '/api/donations/:id/proof', tag: 'Donations', summary: 'Send the transfer screenshot for review', access: 'user',
    form: { proof: { type: 'file', required: true, description: 'JPEG, PNG or WebP' }, amount_lyd: { type: 'string', description: 'Amount actually sent, in dinar' } },
    response: z.strictObject({ donation: c.donationSchema }),
  },
  { method: 'post', path: '/api/donations/:id/cancel', tag: 'Donations', summary: 'Cancel a donation before review', access: 'user', response: c.okResponseSchema },
  { method: 'get', path: '/api/donations/:id/proof', tag: 'Donations', summary: 'The proof image (owner or admins)', access: 'user', responseType: 'image/*' },

  // Donors wall (sponsors)
  { method: 'get', path: '/api/donors/top', tag: 'Donors', summary: 'Top sponsor', access: 'public', response: c.topDonorResponseSchema },
  { method: 'get', path: '/api/donors', tag: 'Donors', summary: 'All sponsors', access: 'admin' },
  { method: 'post', path: '/api/donors', tag: 'Donors', summary: 'Add a sponsor', access: 'admin', body: c.donorInputSchema, status: 201 },
  { method: 'patch', path: '/api/donors/:id', tag: 'Donors', summary: 'Edit a sponsor', access: 'admin', body: c.donorInputSchema.partial() },
  { method: 'delete', path: '/api/donors/:id', tag: 'Donors', summary: 'Remove a sponsor', access: 'admin', response: c.okResponseSchema },

  // Admin
  { method: 'get', path: '/api/admin/notifications', tag: 'Admin', summary: 'Admin inbox', access: 'admin', response: c.notificationListResponseSchema },
  { method: 'post', path: '/api/admin/notifications/read-all', tag: 'Admin', summary: 'Mark the admin inbox read', access: 'admin', response: c.okResponseSchema },
  { method: 'get', path: '/api/admin/duplicates', tag: 'Admin', summary: 'Possible duplicate reports', access: 'admin' },
  { method: 'patch', path: '/api/admin/duplicates/:id', tag: 'Admin', summary: 'Merge or keep a possible duplicate', access: 'admin', body: c.duplicateReviewSchema },
  { method: 'get', path: '/api/admin/analytics', tag: 'Admin', summary: 'Numbers for the dashboard', access: 'admin' },
  { method: 'get', path: '/api/admin/reports', tag: 'Admin', summary: 'Reports with reporter details', access: 'admin' },
  { method: 'get', path: '/api/admin/audit-logs', tag: 'Admin', summary: 'Who changed what: filter by action, pages by cursor', access: 'super_admin', query: c.auditLogQuerySchema, response: c.auditLogResponseSchema },
  { method: 'get', path: '/api/admin/admins', tag: 'Admin', summary: 'Admin accounts', access: 'super_admin' },
  { method: 'post', path: '/api/admin/admins/promote', tag: 'Admin', summary: 'Make a person an admin', access: 'super_admin', body: c.promoteAdminSchema },
  { method: 'post', path: '/api/admin/admins/demote', tag: 'Admin', summary: 'Remove admin rights', access: 'super_admin', body: c.demoteAdminSchema },
  { method: 'get', path: '/api/admin/queue', tag: 'Admin', summary: 'Report queue: search, filters, sort, pages with a total', access: 'admin', query: c.reportQueueQuerySchema, response: c.reportQueueResponseSchema },
  { method: 'get', path: '/api/admin/reports/:id', tag: 'Admin', summary: 'Report page: details, reporter, photos, history with who changed it, duplicates, campaign', access: 'admin', response: c.adminReportResponseSchema },
  { method: 'get', path: '/api/admin/campaigns', tag: 'Admin', summary: 'All campaigns, with the pool of money left over from closed ones', access: 'admin', response: c.adminCampaignListResponseSchema },
  { method: 'post', path: '/api/admin/campaigns', tag: 'Admin', summary: 'Open a campaign for a report (cost breakdown optional)', access: 'admin', body: c.createCampaignSchema, response: c.adminCampaignResponseSchema, status: 201 },
  { method: 'patch', path: '/api/admin/campaigns/:id', tag: 'Admin', summary: 'Edit the cost or notes, complete (with the final cost) or cancel a campaign', access: 'admin', body: c.updateCampaignSchema, response: c.adminCampaignResponseSchema },
  {
    method: 'post', path: '/api/admin/campaigns/:id/receipt', tag: 'Admin', summary: 'Publish the repair receipt photo', access: 'admin',
    form: { receipt: { type: 'file', required: true, description: 'JPEG or WebP, compressed in the panel, no EXIF' } },
    response: c.adminCampaignResponseSchema,
    status: 201,
  },
  { method: 'post', path: '/api/admin/campaigns/:id/allocate', tag: 'Admin', summary: 'Move leftover money to another campaign', access: 'admin', body: c.allocateSchema, response: c.adminCampaignResponseSchema },
  { method: 'get', path: '/api/admin/donations', tag: 'Admin', summary: 'Donations by status (default: waiting for review), with warnings and tab counts', access: 'admin', query: z.object({ status: c.donationStatusSchema.optional() }), response: c.adminDonationListResponseSchema },
  { method: 'post', path: '/api/admin/donations/:id/review', tag: 'Admin', summary: 'Confirm or reject a donation (notifies the donor)', access: 'admin', body: c.reviewDonationSchema, response: c.adminDonationReviewResponseSchema },
  { method: 'get', path: '/api/admin/settings/donations', tag: 'Admin', summary: 'Donation settings (bank details, open mode)', access: 'admin', response: c.donationSettingsResponseSchema },
  { method: 'put', path: '/api/admin/settings/donations', tag: 'Admin', summary: 'Change donation settings (your password is needed to change the bank details)', access: 'super_admin', body: c.donationSettingsSchema, response: c.donationSettingsResponseSchema },
  { method: 'get', path: '/api/admin/settings/rules', tag: 'Admin', summary: 'General rules (duplicate radius, screenshot deadline, large-amount warning)', access: 'admin', response: c.generalRulesResponseSchema },
  { method: 'put', path: '/api/admin/settings/rules', tag: 'Admin', summary: 'Change the general rules', access: 'super_admin', body: c.generalRulesSchema, response: c.generalRulesResponseSchema },
  { method: 'put', path: '/api/admin/settings/contact', tag: 'Admin', summary: 'Change the public contact details', access: 'admin', body: c.contactSettingsSchema, response: c.contactResponseSchema },
  { method: 'put', path: '/api/admin/settings/legal', tag: 'Admin', summary: 'Publish a new version of the legal information', access: 'super_admin', body: c.publishLegalSchema, response: c.legalResponseSchema },
  { method: 'get', path: '/api/site/contact', tag: 'Site', summary: 'Public contact details', access: 'public', response: c.contactResponseSchema },
  { method: 'get', path: '/api/site/legal', tag: 'Site', summary: 'The legal information, its version and the version users must have accepted', access: 'public', response: c.legalResponseSchema },
  { method: 'post', path: '/api/auth/me/accept-legal', tag: 'Accounts', summary: 'Accept a version of the legal pages', access: 'user', body: c.acceptLegalSchema, response: z.object({ ok: z.literal(true), version: z.number().int() }) },
]

const ACCESS_NOTE: Record<Access, string> = {
  public: 'No account needed.',
  optional: 'Works signed out; signed in adds more.',
  user: 'Needs a signed-in account.',
  admin: 'Admins only.',
  super_admin: 'Super admins only.',
}

function schema(type: z.ZodType, io: 'input' | 'output') {
  const out = z.toJSONSchema(type, { io, unrepresentable: 'any', target: 'openapi-3.0' }) as Record<string, unknown>
  delete out.$schema
  return out
}

/** OpenAPI 3.0 document for all /api endpoints. */
export function buildOpenApi(serverUrl: string) {
  const paths: Record<string, Record<string, unknown>> = {}
  for (const e of ENDPOINTS) {
    const parameters: unknown[] = id(e.path).map((name) => ({ name, in: 'path', required: true, schema: { type: 'integer', minimum: 1 } }))
    if (e.query) {
      const q = schema(e.query, 'input') as { properties?: Record<string, unknown>; required?: string[] }
      for (const [name, s] of Object.entries(q.properties ?? {})) {
        parameters.push({ name, in: 'query', required: q.required?.includes(name) ?? false, schema: s })
      }
    }
    const op: Record<string, unknown> = {
      tags: [e.tag],
      summary: e.summary,
      description: ACCESS_NOTE[e.access],
      operationId: `${e.method}${e.path.replace(/^\/api/, '').replace(/[/:-](\w)/g, (_, ch: string) => ch.toUpperCase())}`,
      parameters,
      responses: {
        [String(e.status ?? 200)]: e.responseType
          ? { description: e.status === 302 ? 'Redirects to the page' : 'OK', content: { [e.responseType]: {} } }
          : { description: 'OK', content: { 'application/json': { schema: e.response ? schema(e.response, 'output') : { type: 'object' } } } },
        '400': { description: 'The request is not valid', content: { 'application/json': { schema: schema(c.errorResponseSchema, 'output') } } },
        ...(e.access === 'public' ? {} : { '401': { description: 'Sign in needed' } }),
        ...(e.access === 'admin' || e.access === 'super_admin' ? { '403': { description: 'Not allowed for this account' } } : {}),
        ...(id(e.path).length ? { '404': { description: 'Not found' } } : {}),
        '429': { description: 'Too many requests' },
      },
    }
    if (e.access !== 'public') op.security = e.access === 'optional' ? [{}, { bearer: [] }] : [{ bearer: [] }]
    if (e.body) op.requestBody = { required: true, content: { 'application/json': { schema: schema(e.body, 'input') } } }
    if (e.form) {
      const properties: Record<string, unknown> = {}
      for (const [name, f] of Object.entries(e.form)) {
        properties[name] = f.type === 'file' ? { type: 'string', format: 'binary', description: f.description } : { type: 'string', description: f.description }
      }
      const required = Object.entries(e.form).filter(([, f]) => f.required).map(([n]) => n)
      op.requestBody = { required: true, content: { 'multipart/form-data': { schema: { type: 'object', properties, required } } } }
    }
    const path = e.path.replace(/:(\w+)/g, '{$1}')
    paths[path] = { ...paths[path], [e.method]: op }
  }
  return {
    openapi: '3.0.3',
    info: {
      title: 'HUFRA API',
      version: '1.0.0',
      description: 'Pothole reports for Tripoli. Generated from @hufra/contracts; money is in Libyan dinar (LYD).',
    },
    servers: [{ url: serverUrl }],
    components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
    paths,
  }
}
