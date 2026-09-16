/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { Copy, ExternalLink } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useApiInfo, useFAQ } from '@/features/dashboard/hooks/use-status-data'
import { appPath } from '@/lib/deployment-mode'

export function ApiAccessPanel() {
  const { t } = useTranslation()
  const { items, loading } = useApiInfo()
  const { items: questions } = useFAQ()
  const links = [
    { href: '/user-agreement', label: t('Terms of Service') },
    { href: '/privacy-policy', label: t('Privacy Policy') },
    ...(questions.some((item) => item.question?.trim() && item.answer?.trim())
      ? [{ href: '/faq', label: t('Frequently Asked Questions') }]
      : []),
  ]

  return (
    <section className='snowapi-rainflow-panel space-y-3 p-4 sm:p-5'>
      <h2 className='text-muted-foreground text-xs'>{t('API URL')}</h2>
      <div className='space-y-3'>
        {items.map((item) => {
          let hash = 0
          for (const character of item.route) {
            hash = (hash * 31 + character.charCodeAt(0)) >>> 0
          }
          const hue = [210, 155, 275, 25, 185, 330][hash % 6]
          return (
            <div
              key={`${item.url}-${item.route}`}
              className='flex min-w-0 items-center gap-3'
            >
              <div className='flex min-w-0 flex-1 flex-wrap items-center gap-2'>
                <code className='min-w-0 font-mono text-sm break-all'>
                  {item.url}
                </code>
                <Popover>
                  <PopoverTrigger
                    className='shrink-0 rounded-full px-2 py-0.5 text-xs font-medium outline-offset-2'
                    style={{
                      backgroundColor: `hsl(${hue} 80% 50% / 0.13)`,
                      color: `light-dark(hsl(${hue} 65% 35%), hsl(${hue} 75% 75%))`,
                    }}
                  >
                    {item.route}
                  </PopoverTrigger>
                  <PopoverContent className='max-w-[calc(100vw-2rem)] p-3 text-xs leading-5 break-words'>
                    {item.description}
                  </PopoverContent>
                </Popover>
              </div>
              <Button
                type='button'
                variant='outline'
                size='sm'
                aria-label={`${t('Copy')} ${item.url}`}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(item.url)
                    toast.success(t('Copied'))
                  } catch {
                    toast.error(t('Failed to copy'))
                  }
                }}
              >
                <Copy className='size-4' />
                <span className='max-sm:sr-only'>{t('Copy')}</span>
              </Button>
            </div>
          )
        })}
        {!loading && items.length === 0 ? (
          <p className='text-muted-foreground text-xs'>
            {t('No API routes configured')}
          </p>
        ) : null}
      </div>
      <div className='text-muted-foreground flex flex-wrap gap-x-4 gap-y-2 pt-1 text-xs'>
        {links.map((link) => (
          <a
            key={link.href}
            href={appPath(link.href)}
            className='hover:text-foreground inline-flex items-center gap-1'
          >
            {link.label}
            <ExternalLink className='size-3' />
          </a>
        ))}
      </div>
    </section>
  )
}
