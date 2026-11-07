import { Link } from '@tanstack/react-router'
import { useState, type ReactNode } from 'react'

import { Icon, type IconName } from '@/components/icons'
import logo from '@/components/logo-on-brand.svg'
import type { SessionUser } from '@/auth/session'
import { useSignOut } from '@/auth/session'
import { useI18n } from '@/i18n/i18n'
import type { MessageKey } from '@/i18n/messages'

export const NAV: { to: string; label: MessageKey; icon: IconName; superOnly?: boolean }[] = [
  { to: '/', label: 'nav.dashboard', icon: 'dashboard' },
  { to: '/reports', label: 'nav.reports', icon: 'reports' },
  { to: '/map', label: 'nav.map', icon: 'map' },
  { to: '/duplicates', label: 'nav.duplicates', icon: 'duplicates' },
  { to: '/campaigns', label: 'nav.campaigns', icon: 'campaigns' },
  { to: '/donations', label: 'nav.donations', icon: 'donations' },
  { to: '/regions', label: 'nav.regions', icon: 'regions' },
  { to: '/people', label: 'nav.people', icon: 'people' },
  { to: '/partners', label: 'nav.partners', icon: 'partners' },
  { to: '/settings', label: 'nav.settings', icon: 'settings' },
]

/** Sidebar (wide screens) or a menu button (phones), with the main content beside it. */
export function Shell({ user, children }: { user: SessionUser; children: ReactNode }) {
  const { t, locale, setLocale } = useI18n()
  const signOut = useSignOut()
  const [open, setOpen] = useState(false)
  const name = user.display_name || user.email
  const initial = name.replace(/^ال/, '').slice(0, 1).toUpperCase()

  return (
    <div className="min-h-screen bg-canvas text-primary md:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2">
        {t('skip')}
      </a>

      <header className="flex items-center justify-between bg-brand-solid px-4 py-3 md:hidden">
        <img src={logo} alt={`${t('app.name')} HUFRA`} className="h-8" />
        <button
          type="button"
          className="flex size-11 items-center justify-center rounded-[10px] text-white"
          aria-expanded={open}
          aria-controls="admin-nav"
          onClick={() => setOpen((o) => !o)}
        >
          <Icon name="menu" size={22} />
          <span className="sr-only">{t('nav.menu')}</span>
        </button>
      </header>

      <nav
        id="admin-nav"
        aria-label={t('nav.label')}
        className={`${open ? 'flex' : 'hidden'} flex-col gap-0.5 bg-brand-solid px-3.5 py-5 md:sticky md:top-0 md:flex md:h-screen md:w-[256px] md:shrink-0 md:overflow-y-auto`}
      >
        <img src={logo} alt={`${t('app.name')} HUFRA`} className="mx-2 mb-1.5 mt-1 hidden h-9 self-start md:block" />
        <div className="mx-3 mb-3.5 text-xs font-semibold text-nav-muted">{t('app.panel')}</div>
        {NAV.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            onClick={() => setOpen(false)}
            activeOptions={{ exact: item.to === '/' }}
            className="flex min-h-11 items-center gap-2.5 rounded-[10px] px-3 text-[15px] text-nav no-underline hover:bg-white/10"
            activeProps={{ className: 'bg-white! text-brand-solid! font-semibold', 'aria-current': 'page' }}
          >
            <Icon name={item.icon} />
            {t(item.label)}
          </Link>
        ))}
        <div className="mt-auto flex items-center gap-2.5 border-t border-white/20 px-3 pb-1 pt-4">
          <span aria-hidden="true" className="flex size-9 items-center justify-center rounded-full bg-white font-bold text-brand-solid">
            {initial}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-semibold text-white">{name}</span>
            <span className="text-xs text-nav-muted">{t(`role.${user.role}`)}</span>
          </span>
          <button
            type="button"
            className="flex size-10 items-center justify-center rounded-[10px] text-nav-muted hover:bg-white/10"
            onClick={() => signOut.mutate()}
            aria-label={t('signOut')}
            title={t('signOut')}
          >
            <Icon name="signOut" />
          </button>
        </div>
        <button
          type="button"
          lang={locale === 'ar' ? 'en' : 'ar'}
          aria-label={t('language.label')}
          className="mx-3 mt-2 min-h-11 rounded-[10px] text-start text-sm text-nav-muted underline hover:text-white"
          onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')}
        >
          {t('language')}
        </button>
      </nav>

      <main id="main" tabIndex={-1} className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-7">
        {children}
      </main>
    </div>
  )
}
