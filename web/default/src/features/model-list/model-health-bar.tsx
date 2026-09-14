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
import { useTranslation } from 'react-i18next'

import {
  formatUptimePct,
  getSuccessRateDotClass,
  getSuccessRateTextClass,
  getSuccessRateLevel,
} from '@/features/performance-metrics/lib/format'
import { cn } from '@/lib/utils'

import type { CatalogModelHealthHour } from './types'

export function ModelHealthBar(props: {
  modelName: string
  successRate: number | null
  hourlyHealth: CatalogModelHealthHour[]
  showLabel?: boolean
}) {
  const { t } = useTranslation()
  const successRate =
    props.successRate === null
      ? null
      : Math.min(100, Math.max(0, props.successRate))
  const label =
    successRate === null
      ? `${t('Success rate')}: ${t('No data')}`
      : `${t('Success rate')}: ${formatUptimePct(successRate)}`
  const hourlyHealth = props.hourlyHealth.slice(-24)
  const missingHealthHours = Math.max(0, 24 - hourlyHealth.length)
  const missingHealthSlots = [...Array(missingHealthHours).keys()]
  const healthTimelineLabel = `${props.modelName}. ${label}. ${t('23 hours ago')} - ${t('Now')}`

  return (
    <div data-slot='model-health' className='min-w-0'>
      {props.showLabel ? (
        <div className='mb-2 flex items-center justify-between gap-3'>
          <span className='text-muted-foreground text-xs'>
            {t('Success rate')}
          </span>
          <span
            className={cn('font-mono text-sm font-semibold tabular-nums', {
              [getSuccessRateTextClass(successRate ?? 0)]: successRate !== null,
              'text-muted-foreground': successRate === null,
            })}
          >
            {successRate === null ? t('No data') : formatUptimePct(successRate)}
          </span>
        </div>
      ) : null}
      <div className='flex items-center gap-2.5'>
        <div
          role={successRate === null ? 'img' : 'progressbar'}
          aria-label={healthTimelineLabel}
          aria-valuemin={successRate === null ? undefined : 0}
          aria-valuemax={successRate === null ? undefined : 100}
          aria-valuenow={successRate ?? undefined}
          data-health-hours={24}
          className='grid min-w-20 flex-1 grid-cols-[repeat(24,minmax(0,1fr))] gap-0.5'
        >
          {missingHealthSlots.map((index) => (
            <span
              key={`missing-${index}`}
              aria-hidden='true'
              data-health-level='unknown'
              title={t('No data')}
              className={cn(
                'bg-muted-foreground/15 rounded-[2px]',
                props.showLabel ? 'h-4' : 'h-2.5'
              )}
            />
          ))}
          {hourlyHealth.map((health) => (
            <span
              key={health.hour}
              aria-hidden='true'
              data-health-level={
                health.successRate === null
                  ? 'unknown'
                  : getSuccessRateLevel(health.successRate)
              }
              title={
                health.successRate === null
                  ? t('No data')
                  : `${t('Success rate')}: ${formatUptimePct(health.successRate)}`
              }
              className={cn(
                'rounded-[2px] transition-colors duration-300 motion-reduce:transition-none',
                props.showLabel ? 'h-4' : 'h-2.5',
                health.successRate === null
                  ? 'bg-muted-foreground/15'
                  : getSuccessRateDotClass(health.successRate)
              )}
            />
          ))}
        </div>
        {props.showLabel ? null : (
          <span
            className={cn(
              'w-12 text-right font-mono text-[11px] font-medium tabular-nums',
              successRate === null
                ? 'text-muted-foreground'
                : getSuccessRateTextClass(successRate)
            )}
          >
            {successRate === null ? t('No data') : formatUptimePct(successRate)}
          </span>
        )}
      </div>
      {props.showLabel ? (
        <div className='text-muted-foreground mt-1.5 flex justify-between text-[10px]'>
          <span>{t('23 hours ago')}</span>
          <span>{t('Now')}</span>
        </div>
      ) : null}
    </div>
  )
}
