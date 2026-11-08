import { expect, test } from '@playwright/test'

import { expectAccessible, expectNoSideScroll, menuItem, signIn } from './helpers'

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

// Plan 8.6: the accessibility check at phone width too (narrow screens turn
// tables into scrolling boxes, which must work from the keyboard).
const PAGES: [string, string][] = [
  ['./', 'لوحة المتابعة'],
  ['./notifications', 'الإشعارات'],
  ['./reports', 'البلاغات'],
  ['./map', 'الخريطة'],
  ['./duplicates', 'البلاغات المكررة'],
  ['./campaigns', 'حملات الإصلاح'],
  ['./donations', 'مراجعة التبرعات'],
  ['./regions', 'المناطق'],
  ['./people', 'المشرفون والمتبرعون'],
  ['./partners', 'الشركاء'],
  ['./settings', 'الإعدادات وسجل التدقيق'],
]

test('on a phone: every page is accessible', async ({ page }) => {
  await signIn(page)
  for (const [path, title] of PAGES) {
    await page.goto(path)
    await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible()
    await page.waitForLoadState('networkidle')
    await expectAccessible(page)
  }
})
