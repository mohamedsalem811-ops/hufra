import { Link } from '@tanstack/react-router'

import { useI18n } from '@/i18n/i18n'

export function NotFound() {
  const { t } = useI18n()
  return (
    <div className="flex flex-col items-start gap-4">
      <h1 className="m-0 text-[28px] font-bold">{t('notFound.title')}</h1>
      <Link to="/" className="font-semibold">
        {t('notFound.back')}
      </Link>
    </div>
  )
}
