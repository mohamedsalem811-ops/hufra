# @hufra/brand

HUFRA design tokens: **Direction A · Civic Clarity (وضوح مدني)**. One source of truth for the mobile app, the admin panel and the company website.

| | |
|---|---|
| Source | `src/tokens.ts`. Edit values here only |
| Generated | `dist/tokens.css` (CSS variables), `dist/tokens.json`, `dist/preview.html` (visual sheet) |
| Rebuild | `npm run brand:build` (from the repo root) |
| Checks | `npm run test:packages`: typecheck, WCAG 2.2 AA contrast for every text/background pair in light **and** dark, and "dist/ is up to date". Runs in CI. |

## Using it

**Mobile app (TypeScript):**
```ts
import { themes, typeScale, space, radius, motion } from '@hufra/brand'
const t = themes[colorScheme === 'dark' ? 'dark' : 'light']
t.action.primary // signal orange, the "Report" button
```

**Admin / website (CSS):**
```css
@import '@hufra/brand/tokens.css';
.button-primary { background: var(--color-action-primary); color: var(--color-action-on-primary); }
```
Dark mode follows the system; set `<html data-theme="light|dark">` to force one.

## The palette in one line

Sea blue `#0B4A6F` is HUFRA, signal orange `#FF6A3D` is the call to act and the "reported" status, repair green `#1E8E5A` is "fixed". Typeface: Readex Pro (Arabic + Latin, SIL OFL), bundled with each app.

## Rules tokens can't express

- Signal orange is a fill; text on it is always dark.
- Status is never colour alone: badges have labels, map pins have glyphs (orange and amber look alike with red-green colour blindness).
- Photos first: before/after is the story of a fixed report.
