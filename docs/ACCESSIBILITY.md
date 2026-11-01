# Accessibility audit — WCAG 2.2 AA color contrast

> **Repository layout:** the backend now lives in `apps/api/` (npm workspaces, see `docs/EXECUTION_PLAN.md`). File paths in this document such as `src/…`, `public/…`, `migrations/…`, `scripts/…` and `tests/…` are relative to `apps/api/`. Commands like `npm test` still run from the repository root.

## 1. Targets

- **4.5:1** minimum contrast for normal text (WCAG 2.2 AA, §1.4.3).
- **3:1** minimum for large text (≥24px / ≥19px bold) and for
  non-text/decorative elements that convey meaning (icons, borders, dots)
  per §1.4.11 (Non-text Contrast).

## 2. The problem with the original tokens

The original brand tokens (`#F57C1F` orange, `#2E9E5B` green, `#E53E3E` red)
were each used for **two incompatible jobs at once**:

1. As a **button background** with white text on top — this only needs the
   *white-on-color* pair to hit 4.5:1, which these colors did.
2. As a **text/icon/decorative-accent color** directly on the page
   background (white in light mode, dark gray in dark mode) — this needs the
   *color-on-background* pair to hit 4.5:1 (text) or 3:1 (decorative), which
   several of these colors **did not** satisfy. E.g. `#F57C1F` on white is
   only **≈2.70:1** — a clear AA failure when used as nav-active text, badge
   text, or field-error text.

A single flat token per brand color can't satisfy both jobs simultaneously,
because "readable as white-on-color" and "readable as color-on-page" pull in
opposite directions (a color dark enough for the latter often looks muddy as
a button fill, and vice versa).

## 3. Solution: split tokens by usage role, not by brand identity

`public/static/css/tokens.css` now defines two independent token families
per brand color:

- **`--btn-primary-bg` / `--btn-primary-bg-hover`, `--btn-success-bg` / `-hover`,
  `--btn-danger-bg` / `-hover`** — used **exclusively** for button
  backgrounds paired with white text. These are **theme-independent** (same
  value in light and dark mode) because white-on-color contrast doesn't
  depend on the surrounding page theme.
- **`--color-primary`, `--color-primary-dark`, `--color-primary-light`,
  `--color-success`, `--color-danger`, `--color-info`, `--color-warning`** —
  used for text, icons, borders, and decorative accents (nav-active text,
  `.btn-outline` text/border, badge text-on-tint, severity dots, field-error
  text, chip-option-selected text, stepper text, empty-state icon, toast
  borders, status-tracker dots). These **are theme-aware** — redefined under
  `[data-theme='dark']` with lighter/more saturated values so they stay
  readable against the dark background too.
- **`--status-reported` / `-verified` / `-under-repair` / `-fixed`** are kept
  numerically equal to the corresponding `--color-*` token per theme, so
  status badges automatically inherit the same contrast guarantees.

### Before / after (light theme)

| Token | Before | After | Role |
|---|---|---|---|
| `--color-primary` (text/icon) | `#F57C1F` (≈2.70:1 on white — fail) | `#AE5008` (≈5.1:1 on white — pass) | nav-active text, icons |
| `--color-success` | `#2E9E5B` | `#247B47` | success text/icons |
| `--color-danger` | `#E53E3E` | `#D41D1D` | error text/icons |
| `--btn-primary-bg` (button fill) | `#F57C1F` | `#AE5008` (unified with `--color-primary`) | button background only |

Dark theme mirrors the same split with its own lighter values (e.g.
`--color-primary: #F57C1F` in dark mode, since that same orange *does* clear
AA against the dark background used there).

## 4. Verification methodology

Contrast was checked with a from-scratch Python implementation of the WCAG
relative-luminance and contrast-ratio formulas (sRGB → linear RGB → relative
luminance → `(L1+0.05)/(L2+0.05)`), run against **~28 real usage contexts**
pulled directly from the CSS and templates — every place a `--color-*` or
`--status-*` token is used as text, an icon fill, a border, or a decorative
dot — in **both** light and dark themes:

- Button backgrounds with white text (primary/success/danger, + hover states)
- Nav-active link text
- `.btn-outline` text and border
- 4× status badge text-on-tint combinations
- Field-error text
- Chip-option-selected text
- Stepper active-step text
- Empty-state icon
- Severity dots (minor/medium/severe)
- Toast borders
- Status-tracker dots (reported/verified/under_repair/fixed)
- Icon usages in `src/pages/home.ts` and `src/pages/report.ts`

**Result: 0 failures** across all ~28 checks in both themes — every
combination now clears its required threshold (4.5:1 for text, 3:1 for
decorative/large elements).

## 5. Open items

None outstanding from this audit — all identified contrast failures were
resolved by the token split above. Future UI additions should reuse the
existing `--color-*` (text/icon) vs. `--btn-*-bg` (button fill) token
families rather than introducing new raw hex values, to keep this guarantee
intact.
