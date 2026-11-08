import { expect, test } from '@playwright/test'

import { expectNoSideScroll, menuItem, signIn } from './helpers'

test('on a phone: the menu opens and closes, and no page scrolls sideways', async ({ page }) => {
  await signIn(page)
  await expect(page.getByRole('heading', { name: 'لوحة المتابعة', level: 1 })).toBeVisible()
  const nav = page.getByRole('navigation', { name: 'قائمة الإدارة' })
  await expect(nav).toBeHidden()

  for (const item of ['البلاغات', 'الخريطة', 'مراجعة التبرعات', 'المتبرعون والمشرفون', 'الإعدادات وسجل التدقيق']) {
    await page.getByRole('button', { name: 'القائمة' }).click()
    await nav.getByRole('link', { name: menuItem(item) }).click()
    await expect(nav).toBeHidden()
    await page.waitForLoadState('networkidle')
    await expectNoSideScroll(page)
  }
})
