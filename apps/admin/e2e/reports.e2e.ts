import { expect, test } from '@playwright/test'
import fs from 'node:fs'

import { citizen, menuItem, report, signIn } from './helpers'

test('find a report, verify it, and export the queue as CSV', async ({ page, request }) => {
  const person = await citizen(request)
  const id = await report(request, person.token, { lat: 32.8301, lng: 13.1012, street: 'شارع الاختبار' })

  await signIn(page)
  await page.getByRole('navigation', { name: 'قائمة الإدارة' }).getByRole('link', { name: menuItem('البلاغات') }).click()
  await page.getByLabel('بحث').fill(`#${id}`)
  const row = page.getByRole('link', { name: new RegExp(`شارع الاختبار`) }).first()
  await expect(row).toBeVisible()
  await row.click()

  await expect(page.getByRole('heading', { name: 'شارع الاختبار', level: 1 })).toBeVisible()
  await page.getByLabel('الحالة الجديدة').selectOption('verified')
  await page.getByLabel(/ملاحظة للمُبلِّغ/).fill('تم التحقق من الموقع')
  await page.getByRole('button', { name: 'حفظ الحالة' }).click()
  await expect(page.getByText('تم تغيير الحالة.')).toBeVisible()
  await expect(page.getByText('تم التحقق من الموقع').first()).toBeVisible()

  // Back in the queue, filtered to this report: the CSV holds it, with its new status.
  await page.goto(`./reports?q=${id}`)
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'تصدير النتائج CSV' }).click()])
  const csv = fs.readFileSync((await download.path())!, 'utf8')
  expect(csv.charCodeAt(0)).toBe(0xfeff)
  const lines = csv.slice(1).trim().split('\r\n')
  expect(lines).toHaveLength(2)
  expect(lines[1]).toMatch(new RegExp(`^${id},[^,]+,verified,severe,`))
  expect(lines[1]).toContain('شارع الاختبار')
})
