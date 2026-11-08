import { expect, test } from '@playwright/test'

import { expectAccessible } from './helpers'

test('a shared report shows its place, status and campaign, and keeps its number across languages', async ({ page }) => {
  await page.goto('/r/1')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('حفرة في شارع الجمهورية')
  await expect(page.getByText('تم الإبلاغ', { exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'حملة الإصلاح' })).toContainText('د.ل مؤكدة من 1,200 د.ل')
  await expect(page.getByRole('img', { name: /صورة الحفرة في شارع الجمهورية/ })).toBeVisible()
  await expect(page.getByRole('link', { name: 'افتح في تطبيق حفرة' })).toHaveAttribute('href', /^(hufra:\/\/pothole\/1|intent:\/\/.+\/r\/1#Intent;.*package=ly\.tripoli\.hufra;.*)$/)
  await page.getByRole('link', { name: 'English' }).click()
  await expect(page).toHaveURL(/\/en\/r\/1$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Pothole on Al Jumhuriya St')
})

test('an unknown shared report says so', async ({ page }) => {
  await page.goto('/r/99999')
  await expect(page.getByText('هذا البلاغ غير متاح')).toBeVisible()
  await expectAccessible(page)
})

test('the legal pages are marked as a draft until the legal information is complete', async ({ page }) => {
  await page.goto('/privacy')
  await expect(page.getByRole('note')).toContainText('مسودة قيد المراجعة')
  await expect(page.getByRole('navigation', { name: 'الصفحات القانونية' }).first().getByRole('link', { name: 'سياسة الخصوصية' })).toHaveAttribute('aria-current', 'page')
})

test('search engines: preview tags, sitemap and robots', async ({ page, request }) => {
  await page.goto('/how')
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /\/social-card(\.[\w-]+)?\.png$/)
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/how$/)
  await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute('href', /\/en\/how$/)

  const sitemap = await (await request.get('/sitemap.xml')).text()
  expect(sitemap).toContain('/en/transparency</loc>')
  expect(sitemap).not.toContain('/r/')
  expect(sitemap).not.toContain('404')
  const robots = await (await request.get('/robots.txt')).text()
  expect(robots).toContain('Disallow: /admin')
  expect(robots).toMatch(/Sitemap: https?:\/\/.+\/sitemap\.xml/)
})
