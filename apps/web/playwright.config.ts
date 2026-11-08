// Browser tests of the website (plan 8.6): the real API on its seeded in-memory
// database (apps/api/tests/e2e/server.ts: a report with a photo and a campaign)
// behind the Astro dev server, which forwards /api and /media to it.
//   npm run e2e -w @hufra/web        (CI installs Chromium first)
import { defineConfig, devices } from '@playwright/test'

const API_PORT = 8788 // one of the local origins the API trusts; stop a local dev API first
const WEB_PORT = 4331
const CI = !!process.env.CI

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: false,
  workers: 1,
  retries: CI ? 1 : 0,
  forbidOnly: CI,
  timeout: 60_000,
  expect: { timeout: 7_000 },
  reporter: CI ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report' }]] : 'list',
  outputDir: 'test-results',
  use: { baseURL: `http://localhost:${WEB_PORT}`, screenshot: 'only-on-failure', trace: 'off' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
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
      command: `npx astro dev --port ${WEB_PORT} --ignore-lock`,
      url: `http://localhost:${WEB_PORT}/`,
      env: { HUFRA_API: `http://localhost:${API_PORT}`, ASTRO_TELEMETRY_DISABLED: '1' },
      reuseExistingServer: false,
      timeout: 90_000,
    },
  ],
})
