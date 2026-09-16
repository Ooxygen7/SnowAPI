import { useTranslation } from 'react-i18next'

export function DemoNotice() {
  const { t } = useTranslation()
  return (
    <div className='pointer-events-none fixed inset-x-16 top-3 z-[100] flex justify-center'>
      <span className='bg-background/95 text-foreground border-border max-w-full rounded-full border px-3 py-1 text-center text-[10px] shadow-sm'>
        {t('Demo · Virtual data · Stored only in your browser')}
      </span>
    </div>
  )
}
