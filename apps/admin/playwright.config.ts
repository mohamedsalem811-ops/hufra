// Browser tests of the admin panel (plan 8.3): the real API on its in-memory
// test database (apps/api/tests/e2e/server.ts, seeded with a super admin, a
// citizen, a report with a photo and a campaign) behind the Vite dev server.
//   npm run e2e -w @hufra/admin        (CI installs Chromium first)
import { defineConfig, devices } from '@playwright/test'

import { API_PORT, WEB_PORT } from './e2e/ports'

const CI = !!process.env.CI

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.e2e.ts',
  // One shared server and database: tests run one after another and each makes its own data.
  fullyParallel: false,
  workers: 1,
  retries: CI ? 1 : 0,
  forbidOnly: CI,
  timeout: 30_000,
  expect: { timeout: 7_000 },
  reporter: CI ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report' }]] : 'list',
  outputDir: 'test-results',
  use: {
    baseURL: `http://localhost:${WEB_PORT}/admin/`,
    locale: 'ar-LY',
    screenshot: 'only-on-failure',
    trace: 'off',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } }, testIgnore: '**/phone.e2e.ts' },
    { name: 'phone', use: { ...devices['Pixel 7'] }, testMatch: '**/phone.e2e.ts' },
  ],
  webServer: [
    {
      command: `npx tsx ../api/tests/e2e/server.ts ${API_PORT}`,
      url: `http://localhost:${API_PORT}/api/regions`,
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: CI ? 'pipe' : 'ignore',
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}/admin/`,
      env: { HUFRA_API: `http://localhost:${API_PORT}` },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
})
