import type { ContactSettings } from '@hufra/contracts'

import { getJson } from './api'

/** The public contact email (set in the admin panel) on every [data-contact-email] link. */
export async function fillContact() {
  const links = document.querySelectorAll<HTMLAnchorElement>('[data-contact-email]')
  if (!links.length) return
  const data = await getJson<{ contact: ContactSettings }>('/api/site/contact')
  const email = data?.contact.public_email
  if (!email) return
  for (const a of links) {
    a.href = `mailto:${email}`
    a.hidden = false
  }
}
