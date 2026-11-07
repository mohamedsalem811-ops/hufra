import type { PotholeStatus } from '@hufra/contracts'
import { useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

type Variant = 'primary' | 'brand' | 'secondary' | 'ghost'

const variants: Record<Variant, string> = {
  primary: 'bg-action text-on-action hover:bg-action-pressed font-bold',
  brand: 'bg-brand text-on-brand hover:opacity-90 font-semibold',
  secondary: 'bg-surface text-brand border-[1.5px] border-brand hover:bg-brand-tint font-semibold',
  ghost: 'bg-transparent text-link hover:bg-subtle font-semibold',
}

export function Button({ variant = 'primary', className, type = 'button', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type={type}
      className={cx(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] px-4 text-[15px] transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        variants[variant],
        className,
      )}
      {...rest}
    />
  )
}

export function TextField({ label, error, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  const id = useId()
  const errorId = `${id}-error`
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-semibold text-primary">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={cx(
          'min-h-12 rounded-[10px] border bg-surface px-3 text-base text-primary',
          error ? 'border-danger' : 'border-strong',
        )}
        {...rest}
      />
      {error ? (
        <span id={errorId} className="text-sm text-danger">
          {error}
        </span>
      ) : null}
    </div>
  )
}

export function Card({ children, className, ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={cx('rounded-lg border border-default bg-surface p-4', className)} {...rest}>
      {children}
    </section>
  )
}

export function Alert({ tone = 'danger', children }: { tone?: 'danger' | 'warning' | 'success'; children: ReactNode }) {
  const tones = { danger: 'bg-danger-bg text-danger', warning: 'bg-warning-bg text-warning', success: 'bg-success-bg text-success' }
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cx('rounded-md px-4 py-3 text-[15px] font-medium', tones[tone])}>
      {children}
    </div>
  )
}

export function Spinner({ label }: { label: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-3 p-8 text-secondary">
      <span aria-hidden="true" className="size-5 animate-spin rounded-full border-2 border-default border-t-brand" />
      <span>{label}</span>
    </div>
  )
}

const statusStyle: Record<PotholeStatus, string> = {
  reported: 'bg-reported-bg text-reported',
  verified: 'bg-verified-bg text-verified',
  under_repair: 'bg-under-repair-bg text-under-repair',
  fixed: 'bg-fixed-bg text-fixed',
}

/** Status shown with words and colour (never colour alone). */
export function StatusBadge({ status, label }: { status: PotholeStatus; label: string }) {
  return <span className={cx('inline-flex h-7 items-center rounded-full px-3 text-[13px] font-semibold', statusStyle[status])}>{label}</span>
}
