# Accessibility

HUFRA targets WCAG 2.1 AA (2.2 where it applies) in Arabic (right to left)
and English, in light and dark themes. These are checked automatically:

| What | How | Where |
|---|---|---|
| Colour contrast of every brand colour pair (text 4.5:1, large text and non-text 3:1), both themes | Contrast test of the design tokens | `packages/brand` tests, CI (`npm run test:packages`) |
| Website: every page in Arabic and English, desktop and phone | axe (WCAG 2.0/2.1 A and AA, no serious or critical issue), no sideways scrolling, skip link, keyboard focus | `apps/web/e2e`, CI |
| Website donation journey: each step (sign-in, amount, transfer, screenshot, review, receipt) | axe on every step | `apps/web/e2e/donate.e2e.ts`, CI |
| Admin panel: every page on a phone | axe; tables that scroll sideways are focusable, named regions | `apps/admin/e2e`, CI |
| App: labels, roles and states on controls, tap targets | Component tests query by accessible role and name | `apps/mobile/src/**/*.test.tsx`, CI |

Conventions the code follows:

- One `h1` per view; when the donation pages switch step, focus moves to the
  new step's heading for screen readers.
- Errors are announced (`role="alert"`) and the field is focused; status
  messages use `role="status"` / `aria-live`.
- Controls are at least 44 px high; links are underlined or clearly marked.
- Numbers use Western digits (`en-US`) in both languages; money shows as
  `د.ل` / `LYD`. Reference codes and IBANs are isolated left to right inside
  Arabic text.
- Colours come only from the design tokens in `packages/brand`, never raw hex
  values, so the contrast guarantee holds for new screens too.

Older notes (the colour audit of the first, server-rendered website) are in
the repository history before plan 9.2.
