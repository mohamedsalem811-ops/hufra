import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { API, citizen, signIn } from './helpers'

const PROOF = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../api/tests/fixtures/photos/full.jpg')

test('a transfer is matched with the bank statement and confirmed', async ({ page, request }) => {
  const donor = await citizen(request, 'متبرع الاختبار')
  const auth = { Authorization: `Bearer ${donor.token}` }
  const campaigns = await (await request.get(`${API}/api/campaigns`)).json()
  const campaign = campaigns.results[0]
  const pledge = await request.post(`${API}/api/campaigns/${campaign.id}/donations`, { headers: auth, data: { amount_lyd: 75, show_name: true } })
  expect(pledge.ok(), await pledge.text()).toBe(true)
  const donation = (await pledge.json()).donation
  const proof = await request.post(`${API}/api/donations/${donation.id}/proof`, {
    headers: auth,
    multipart: { proof: { name: 'proof.jpg', mimeType: 'image/jpeg', buffer: fs.readFileSync(PROOF) } },
  })
  expect(proof.ok(), await proof.text()).toBe(true)

  await signIn(page)
  const nav = page.getByRole('navigation', { name: 'قائمة الإدارة' })
  await expect(nav.getByRole('link', { name: /مراجعة التبرعات \d+ بانتظار المراجعة/ })).toBeVisible()
  await nav.getByRole('link', { name: /مراجعة التبرعات/ }).click()

  await page.getByRole('region', { name: 'قائمة التبرعات' }).getByText(donation.reference_code).click()
  await expect(page.getByRole('img', { name: `لقطة شاشة التحويل للتبرع ${donation.reference_code}` })).toBeVisible()
  await page.getByRole('button', { name: 'تأكيد التبرع' }).click()
  await expect(page.getByText('أكّد أنك وجدت التحويل في الكشف أولاً.')).toBeVisible()
  await page.getByLabel('وجدت التحويل في كشف الحساب').check()
  await page.getByRole('button', { name: 'تأكيد التبرع' }).click()

  // The donor sees it confirmed.
  await expect
    .poll(async () => {
      const mine = await (await request.get(`${API}/api/donations/mine`, { headers: auth })).json()
      return mine.results.find((d: { id: number }) => d.id === donation.id)?.status
    })
    .toBe('confirmed')
})
