// Shared Tailwind classes for the donation and sign-in pages (plan 9.2), so the
// pages and the elements their scripts add look the same.

export const ui = {
  page: 'mx-auto flex w-full max-w-[640px] flex-col gap-5 px-4 pt-10 pb-[72px] sm:px-6',
  card: 'flex flex-col gap-3 rounded-[18px] border border-default bg-surface p-5',
  h1: 'm-0 text-[28px] leading-[1.35] font-bold sm:text-[34px]',
  h2: 'm-0 text-lg font-bold',
  muted: 'm-0 text-[15px] leading-[1.7] text-secondary',
  primary:
    'inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-action px-6 text-base font-bold text-on-action no-underline hover:bg-action-pressed disabled:opacity-60 sm:w-auto sm:self-start',
  secondary:
    'inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-strong bg-surface px-6 text-base font-semibold text-primary no-underline hover:bg-subtle sm:w-auto sm:self-start',
  text: 'inline-flex min-h-11 items-center self-start border-0 bg-transparent p-0 text-base font-semibold text-link underline-offset-4 hover:underline',
  label: 'text-[15px] font-semibold',
  input:
    'box-border min-h-12 w-full rounded-xl border border-strong bg-surface px-4 text-base text-primary placeholder:text-secondary focus-visible:border-focus',
  hint: 'text-sm text-secondary',
  error: 'm-0 rounded-xl bg-[var(--color-feedback-danger-bg)] px-4 py-3 text-[15px] text-primary',
  notice: 'm-0 rounded-xl bg-subtle px-4 py-3.5 text-[15px] leading-[1.7]',
  ok: 'm-0 rounded-xl bg-[var(--color-feedback-success-bg)] px-4 py-3.5 text-[15px] leading-[1.7] text-primary',
  chip: 'min-h-11 min-w-16 rounded-full border border-strong bg-surface px-4 text-base font-semibold text-primary aria-pressed:border-action aria-pressed:bg-brand-tint aria-pressed:text-brand',
} as const
