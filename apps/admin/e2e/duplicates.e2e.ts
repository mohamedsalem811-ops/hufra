import { expect, test } from '@playwright/test'

import { citizen, report, signIn } from './helpers'

test('two reports a few metres apart are compared and merged', async ({ page, request }) => {
  const person = await citizen(request)
  const older = await report(request, person.token, { lat: 32.8402, lng: 13.2203, street: 'طريق الشط' })
  const newer = await report(request, person.token, { lat: 32.84025, lng: 13.2203 })

  await signIn(page)
  await page.getByRole('navigation', { name: 'قائمة الإدارة' }).getByRole('link', { name: /البلاغات المكررة \d+ بانتظار المراجعة/ }).click()
  const pair = page.getByRole('region', { name: new RegExp(`#${newer}.*#${older}`) })
  await expect(pair.getByRole('region', { name: `الأقدم #${older}` })).toContainText('طريق الشط')
  await pair.getByRole('button', { name: 'دمج: البلاغ الأحدث مكرر' }).click()
  await expect(pair).toHaveCount(0)

  // The newer report is gone; the older one stays.
  await page.goto(`./reports/${newer}`)
  await expect(page.getByRole('alert')).toBeVisible()
  await page.goto(`./reports/${older}`)
  await expect(page.getByRole('heading', { name: 'طريق الشط', level: 1 })).toBeVisible()
})
