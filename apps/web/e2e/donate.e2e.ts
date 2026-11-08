// The donation journey on the website (plan 9.2): sign-up, how much, the bank
// transfer with its code, the screenshot made small in the browser, review by
// the team, the receipt, "My donations", cancelling, and the app's signed-in link.
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, request as apiRequest, test, type Page } from '@playwright/test'

import { expectAccessible, expectNoSideScroll, watchErrors } from './helpers'

const API = 'http://localhost:8788'
const PW = 'Str0ngP@ssw0rd!'
const SHOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../api/tests/fixtures/photos/full.jpg')

// The journeys change the seeded database: once, on a phone.
test.beforeEach(({}, info) => test.skip(info.project.name !== 'phone', 'runs once, on a phone'))

/** An API token, as the app or the admin panel would hold it (no Origin: tokens in the answer). */
async function token(email: string) {
  const api = await apiRequest.newContext({ baseURL: API })
  const res = await api.post('/api/auth/login', { data: { email, password: PW } })
  expect(res.status()).toBe(200)
  return { api, token: ((await res.json()) as { access_token: string }).access_token }
}

async function check(page: Page) {
  await page.waitForLoadState('networkidle')
  await expectAccessible(page)
  await expectNoSideScroll(page)
}

test('sign up, donate by bank transfer, send the screenshot, then the receipt once the team confirms', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('/donate/1')
  await expect(page.getByRole('heading', { level: 1, name: 'شارع الجمهورية' })).toBeVisible()
  await expect(page.getByText(/د\.ل مؤكدة من 1,200 د\.ل/)).toBeVisible()
  await expect(page.getByRole('img', { name: /صورة الحفرة في شارع الجمهورية/ })).toBeVisible()

  // Signed out: an account first, then back here.
  await page.getByRole('button', { name: 'تبرّع لإصلاحها' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'سجّل الدخول لتتبرع' })).toBeFocused()
  await expect(page.getByRole('link', { name: 'تسجيل الدخول' }).last()).toHaveAttribute('href', '/sign-in?next=%2Fdonate%2F1')
  await check(page)
  await page.getByRole('link', { name: 'إنشاء حساب' }).last().click()
  await expect(page).toHaveURL(/\/sign-up\?next=%2Fdonate%2F1$/)
  await page.getByRole('button', { name: 'إنشاء الحساب' }).click()
  await expect(page.getByRole('alert')).toHaveText('اكتب بريداً إلكترونياً صحيحاً.')
  await page.getByLabel('البريد الإلكتروني').fill(`mariam-${Date.now()}@e2e.ly`)
  await page.getByLabel('كلمة المرور').fill(PW)
  await page.getByLabel('الاسم (اختياري)').fill('مريم')
  await page.getByRole('button', { name: 'إنشاء الحساب' }).click()
  await expect(page.getByRole('alert')).toHaveText('وافق على الشروط وسياسة الخصوصية لإنشاء الحساب.')
  await page.getByRole('checkbox').check()
  await check(page)
  await page.getByRole('button', { name: 'إنشاء الحساب' }).click()
  await expect(page).toHaveURL(/\/donate\/1$/)

  // How much.
  await page.getByRole('button', { name: 'تبرّع لإصلاحها' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'كم تريد أن تتبرع؟' })).toBeVisible()
  await page.getByRole('button', { name: 'متابعة' }).click()
  await expect(page.getByRole('alert')).toHaveText('اكتب مبلغاً بين 1 و100,000 دينار.')
  await page.getByRole('button', { name: '50', exact: true }).click()
  await expect(page.getByRole('button', { name: '50', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByLabel('مبلغ آخر (د.ل)')).toHaveValue('50')
  await page.getByRole('checkbox', { name: /أظهر اسمي بين المتبرعين/ }).check()
  await check(page)
  await page.getByRole('button', { name: 'متابعة' }).click()

  // Step 1: the bank details and the code.
  await expect(page).toHaveURL(/\/donations\/\d+$/)
  const id = Number(new URL(page.url()).pathname.split('/').pop())
  await expect(page.getByRole('heading', { level: 1, name: 'التحويل' })).toBeVisible()
  await expect(page.getByText('LY83 0020 4800 0020 1001 2036 1')).toBeVisible()
  await expect(page.getByText('0012345678901')).toBeVisible()
  const code = (await page.locator('[data-code]').innerText()).trim()
  expect(code).toMatch(/^HF-[A-Z2-9]{6}$/)
  await page.getByRole('button', { name: 'نسخ الرمز' }).click()
  await expect(page.getByRole('button', { name: 'نسخ الرمز' })).toHaveText('نُسخ')
  await check(page)

  // Step 2: the screenshot.
  await page.getByRole('button', { name: 'حوّلت المبلغ، التالي' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'إثبات التحويل' })).toBeVisible()
  await page.getByRole('button', { name: 'إرسال للمراجعة' }).click()
  await expect(page.getByRole('alert')).toHaveText('أضف صورة التحويل أولاً.')
  await page.getByLabel('كم حوّلت؟ (د.ل)').fill('55.5')
  await page.locator('#shot').setInputFiles(SHOT)
  await expect(page.getByText(/تمت إضافة الصورة، صُغّرت إلى \d+ ك\.ب/)).toBeVisible()
  await check(page)
  await page.getByRole('button', { name: 'إرسال للمراجعة' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'شكراً! وصلنا إثبات تبرعك' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'شكراً! وصلنا إثبات تبرعك' }).getByText(code)).toBeVisible()
  await check(page)

  // Under review is shown apart and never counted.
  await page.goto('/donate/1')
  await expect(page.getByText(/55\.5 د\.ل قيد المراجعة، غير مؤكدة بعد|د\.ل قيد المراجعة، غير مؤكدة بعد/)).toBeVisible()

  // The team confirms it (admin panel, by API here).
  const { api, token: owner } = await token('owner@e2e.ly')
  const queue = (await (await api.get('/api/admin/donations?status=under_review', { headers: { Authorization: `Bearer ${owner}` } })).json()) as { results: { id: number; reference_code: string }[] }
  expect(queue.results.find((d) => d.reference_code === code)?.id).toBe(id)
  const review = await api.post(`/api/admin/donations/${id}/review`, { headers: { Authorization: `Bearer ${owner}` }, data: { decision: 'confirm' } })
  expect(review.status()).toBe(200)

  await page.goto(`/donations/${id}`)
  await expect(page.getByRole('heading', { level: 1, name: 'إيصال تبرع' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'طباعة أو حفظ PDF' })).toBeVisible()
  await check(page)
  await page.goto('/donate/1')
  await expect(page.getByRole('region', { name: 'المتبرعون' }).getByText('مريم')).toBeVisible()

  await page.goto('/donations')
  await expect(page.getByRole('heading', { level: 1, name: 'تبرعاتي' })).toBeVisible()
  await expect(page.getByText('55.5 د.ل', { exact: true })).toBeVisible()
  await check(page)

  // English, same donation.
  await page.getByRole('link', { name: /English/ }).click()
  await expect(page).toHaveURL(/\/en\/donations$/)
  await page.getByRole('link', { name: /Al Jumhuriya St · 55\.5 LYD/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Donation receipt' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr')
  await check(page)

  await page.goto('/en/donations')
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/en$/)
  await page.goto('/en/donations')
  await expect(page.getByText('Sign in to see your donations.')).toBeVisible()
  expect(errors).toEqual([])
})

test('a donation can be cancelled before the transfer', async ({ page }) => {
  await page.goto('/sign-in?next=%2Fdonate%2F1')
  await page.getByLabel('البريد الإلكتروني').fill('donor@e2e.ly')
  await page.getByLabel('كلمة المرور').fill('wrong-password')
  await page.getByRole('button', { name: 'دخول' }).click()
  await expect(page.getByRole('alert')).toHaveText('بيانات الدخول غير صحيحة')
  await page.getByLabel('كلمة المرور').fill(PW)
  await page.getByRole('button', { name: 'دخول' }).click()
  await expect(page).toHaveURL(/\/donate\/1$/)
  await page.getByRole('button', { name: 'تبرّع لإصلاحها' }).click()
  await page.getByRole('button', { name: '10', exact: true }).click()
  await page.getByRole('button', { name: 'متابعة' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'التحويل' })).toBeVisible()

  await page.getByRole('button', { name: 'إلغاء هذا التبرع' }).click()
  await page.getByRole('button', { name: 'لا، أبقِه' }).click()
  await expect(page.getByRole('button', { name: 'نعم، ألغِه' })).toBeHidden()
  await page.getByRole('button', { name: 'إلغاء هذا التبرع' }).click()
  await page.getByRole('button', { name: 'نعم، ألغِه' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'أُلغي' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'تبرّع مجدداً' })).toHaveAttribute('href', '/donate/1')
  await check(page)
})

test("the app's Donate button opens the website already signed in, in the app's language", async ({ page }) => {
  const { api, token: donor } = await token('donor@e2e.ly')
  const res = await api.post('/api/auth/web-handoff', { headers: { Authorization: `Bearer ${donor}` }, data: { next: '/en/donate/1' } })
  expect(res.status()).toBe(200)
  const { url } = (await res.json()) as { url: string }
  // The app opens this link in its browser sheet; here, through the website's address.
  await page.goto(new URL(url).pathname + new URL(url).search)
  await expect(page).toHaveURL(/\/en\/donate\/1$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Al Jumhuriya St' })).toBeVisible()
  await page.getByRole('button', { name: 'Donate to repair it' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'How much would you like to give?' })).toBeVisible()

  // The link works once: opened again, it asks to sign in.
  const again = await page.context().browser()!.newContext()
  const second = await again.newPage()
  await second.goto(`http://localhost:4331${new URL(url).pathname}${new URL(url).search}`)
  await expect(second).toHaveURL(/\/login$|\/sign-in$/)
  await again.close()
})
