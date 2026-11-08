# HUFRA website (`apps/web`)

The public website (plan 8.4): Astro, static pages, Arabic at `/` (right to left) and English at `/en/`. Brand colours, fonts and logos come from `packages/brand`.

Live parts (figures, open campaigns, partners, before/after photos, contact email) are filled in the browser from the public API on the same domain (`/api/site/numbers`, `/api/campaigns`, `/api/partners`, `/api/potholes/showcase`, `/api/site/contact`). They are built as plain text, never HTML, so nothing from the API can add markup.

## Develop

```bash
npx tsx apps/api/tests/e2e/server.ts 8788        # the API on a seeded test database
HUFRA_API=http://localhost:8788 npm run dev -w @hufra/web   # http://localhost:4321
```

## Checks

```bash
npm run typecheck -w @hufra/web
npm run build -w @hufra/web      # dist/
```

From 9.1 the Worker serves `dist/` next to the API and the admin panel.
