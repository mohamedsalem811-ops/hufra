// Plan 8.2: public site information read by the website and the app.
import { Hono } from 'hono'

import { loadContact, loadLegal } from '../lib/site-settings'
import type { Bindings } from '../lib/types'

const site = new Hono<{ Bindings: Bindings }>()

// Changes show within five minutes everywhere, with no new release.
site.get('/contact', async (c) => {
  c.header('Cache-Control', 'public, max-age=300')
  return c.json({ contact: await loadContact(c.env.DB) })
})

site.get('/legal', async (c) => {
  c.header('Cache-Control', 'public, max-age=300')
  return c.json(await loadLegal(c.env.DB))
})

export default site
