import { expect, test } from '@playwright/test'

import { citizen, signIn } from './helpers'

test('wrong password, a citizen account and a staff account', async ({ page, request }) => {
  await signIn(page, 'owner@e2e.ly', 'wrong-Passw0rd', { fails: true })
  await expect(page.getByText('البريد أو كلمة المرور غير صحيحة.')).toBeVisible()

  const person = await citizen(request)
  await signIn(page, person.email, undefined, { fails: true })
  await expect(page.getByText('هذا الحساب ليس حساب مشرف. اطلب من المشرف العام منحك الصلاحية.')).toBeVisible()

  await signIn(page)
  await expect(page.getByRole('heading', { name: 'لوحة المتابعة', level: 1 })).toBeVisible()
  await expect(page.getByRole('region', { name: 'الأرقام الرئيسية' })).toBeVisible()

  // The session survives a reload (cookies), and signing out ends it.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'لوحة المتابعة', level: 1 })).toBeVisible()
  await page.getByRole('button', { name: 'تسجيل الخروج' }).click()
  await expect(page.getByRole('heading', { name: 'دخول المشرفين' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'دخول المشرفين' })).toBeVisible()
})
