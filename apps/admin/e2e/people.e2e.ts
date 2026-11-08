import { expect, test } from '@playwright/test'

import { citizen, signIn } from './helpers'

test('make someone an admin for a region, suspend them, then reinstate them', async ({ page, browser, request, baseURL }) => {
  const person = await citizen(request, 'مشرفة جديدة')
  await signIn(page)
  await page.getByRole('navigation', { name: 'قائمة الإدارة' }).getByRole('link', { name: 'المتبرعون والمشرفون' }).click()

  await page.getByRole('button', { name: '+ إضافة مشرف' }).click()
  const form = page.getByRole('form', { name: 'إضافة مشرف' })
  await form.getByLabel('البريد الإلكتروني').fill(person.email)
  await form.getByRole('checkbox', { name: 'أبوسليم' }).check()
  await form.getByRole('button', { name: 'إضافة' }).click()
  const row = page.getByRole('row', { name: new RegExp(person.email.replace(/[.]/g, '\\.')) })
  await expect(row).toContainText('أبوسليم')
  await expect(row).toContainText('اليوم') // signed in once already (by this test, through the API)

  // The new admin can sign in to the panel.
  const theirs = await (await browser.newContext({ baseURL, locale: 'ar-LY' })).newPage()
  await signIn(theirs, person.email)
  await expect(theirs.getByRole('heading', { name: 'لوحة المتابعة', level: 1 })).toBeVisible()

  // Suspended: signed out at once, and refused at sign-in.
  await row.getByRole('button', { name: /^تعديل/ }).click()
  await page.getByRole('button', { name: 'إيقاف الحساب' }).click()
  await expect(row).toContainText('موقوف')
  await theirs.reload()
  await expect(theirs.getByRole('heading', { name: 'دخول المشرفين' })).toBeVisible()
  await signIn(theirs, person.email, undefined, { fails: true })
  await expect(theirs.getByText('هذا الحساب موقوف. تواصل مع المشرف العام.')).toBeVisible()

  await page.getByRole('button', { name: 'إعادة تفعيل الحساب' }).click()
  await expect(row).toContainText('نشط')
  await signIn(theirs, person.email)
  await expect(theirs.getByRole('heading', { name: 'لوحة المتابعة', level: 1 })).toBeVisible()
  await theirs.context().close()
})
