import { Link } from '@tanstack/react-router'

import { Card } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import type { MessageKey } from '@/i18n/messages'

/** Screens arriving in 8.2: the menu already points to them. */
export function ComingSoon({ title }: { title: MessageKey }) {
  const { t } = useI18n()
  return (
    <div className="flex flex-col gap-6">
      <h1 className="m-0 text-[28px] font-bold">{t(title)}</h1>
      <Card className="flex flex-col gap-1">
        <h2 className="m-0 text-[17px] font-semibold">{t('soon.title')}</h2>
        <p className="m-0 text-secondary">{t('soon.body')}</p>
      </Card>
    </div>
  )
}

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
