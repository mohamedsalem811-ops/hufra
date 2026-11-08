import AxeBuilder from '@axe-core/playwright'
import { expect, type APIRequestContext, type Page } from '@playwright/test'

import { API_PORT } from './ports'

export const API = `http://localhost:${API_PORT}`
export const PW = 'Str0ngP@ssw0rd!'
export const OWNER = 'owner@e2e.ly'

/** A fresh address per test run, so retries never collide. */
export const unique = (name: string) => `${name}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@e2e.ly`

/** Fills the sign-in form. Unless told it should fail, waits until the panel is open. */
export async function signIn(page: Page, email = OWNER, password = PW, { fails = false } = {}) {
  await page.goto('./')
  await page.getByLabel('البريد الإلكتروني').fill(email)
  await page.getByLabel('كلمة المرور').fill(password)
  await page.getByRole('button', { name: 'دخول' }).click()
  // The form is replaced by the panel (whose menu may be folded away on a phone).
  if (!fails) await expect(page.getByRole('heading', { name: 'دخول المشرفين' })).toBeHidden()
}

/** A menu item by its name, with or without a waiting-count badge after it. */
export const menuItem = (name: string) => new RegExp(`^${name}( \\d+ (بانتظار المراجعة|غير مقروءة))?$`)

/** Bearer token for API calls made by the test itself (not the browser). */
export async function token(request: APIRequestContext, email: string, password = PW): Promise<string> {
  const res = await request.post(`${API}/api/auth/login`, { data: { email, password } })
  expect(res.ok(), await res.text()).toBe(true)
  return (await res.json()).access_token
}

export async function citizen(request: APIRequestContext, name = 'مواطن'): Promise<{ email: string; token: string }> {
  const email = unique('citizen')
  const res = await request.post(`${API}/api/auth/register`, { data: { email, password: PW, consent: true, display_name: name } })
  expect(res.ok(), await res.text()).toBe(true)
  return { email, token: await token(request, email) }
}

export async function report(request: APIRequestContext, auth: string, at: { lat: number; lng: number; street?: string }): Promise<number> {
  const res = await request.post(`${API}/api/potholes`, {
    headers: { Authorization: `Bearer ${auth}` },
    data: { lat: at.lat, lng: at.lng, severity: 'severe', street_ar: at.street, description_ar: 'حفرة عميقة' },
  })
  expect(res.ok(), await res.text()).toBe(true)
  return (await res.json()).id
}

/** No serious or critical accessibility problems (axe, WCAG 2.1 A and AA). */
export async function expectAccessible(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).exclude('.leaflet-tile-pane').analyze()
  const bad = result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(bad.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')})`)).toEqual([])
}

/** The page never scrolls sideways. */
export async function expectNoSideScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
}
