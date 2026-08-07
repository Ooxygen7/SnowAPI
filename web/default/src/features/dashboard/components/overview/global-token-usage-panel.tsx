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
import { useQuery } from '@tanstack/react-query'
import { VChart } from '@visactor/react-vchart'
import { Activity, ChartNoAxesCombined } from 'lucide-react'
import { useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { IconBadge } from '@/components/ui/icon-badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useTheme } from '@/context/theme-provider'
import { getGlobalTokenUsageOverview } from '@/features/dashboard/api'
import { toIntlLocale } from '@/i18n/languages'
import dayjs from '@/lib/dayjs'
import { VCHART_OPTION } from '@/lib/vchart'

let tokenUsageThemeManagerPromise: Promise<
  (typeof import('@visactor/vchart'))['ThemeManager']
> | null = null

interface HourlyChartPoint {
  hour: string
  fullTime: string
  tokens: number
}

export function GlobalTokenUsagePanel() {
  const { t, i18n } = useTranslation()
  const { resolvedTheme } = useTheme()
  const shouldReduceMotion = useReducedMotion()
  const [themeReady, setThemeReady] = useState(false)
  const themeManagerRef = useRef<
    (typeof import('@visactor/vchart'))['ThemeManager'] | null
  >(null)

  useEffect(() => {
    const updateTheme = async () => {
      setThemeReady(false)
      if (!tokenUsageThemeManagerPromise) {
        tokenUsageThemeManagerPromise = import('@visactor/vchart').then(
          (module) => module.ThemeManager
        )
      }
      const ThemeManager = await tokenUsageThemeManagerPromise
      themeManagerRef.current = ThemeManager
      ThemeManager.setCurrentTheme(resolvedTheme === 'dark' ? 'dark' : 'light')
      setThemeReady(true)
    }

    void updateTheme()
  }, [resolvedTheme])

  const usageQuery = useQuery({
    queryKey: ['dashboard', 'overview', 'global-token-usage'],
    queryFn: getGlobalTokenUsageOverview,
    select: (response) => (response.success ? response.data : undefined),
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: 1,
  })

  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const exactFormatter = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        maximumFractionDigits: 0,
      }),
    [locale]
  )
  const compactFormatter = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        notation: 'compact',
        maximumFractionDigits: 1,
      }),
    [locale]
  )

  const usage = usageQuery.data
  const chartPoints = useMemo<HourlyChartPoint[]>(
    () =>
      (usage?.hourly ?? []).map((point) => ({
        hour: dayjs(point.timestamp * 1000).format('HH:00'),
        fullTime: dayjs(point.timestamp * 1000).format('MM-DD HH:00'),
        tokens: Number(point.tokens) || 0,
      })),
    [usage]
  )

  const chartSpec = useMemo(
    () => ({
      type: 'line',
      data: [{ id: 'globalTokenUsage', values: chartPoints }],
      xField: 'hour',
      yField: 'tokens',
      padding: { top: 16, right: 20, bottom: 8, left: 8 },
      axes: [
        {
          orient: 'bottom',
          type: 'band',
          label: {
            autoLimit: true,
            style: { fontSize: 11 },
          },
          tick: { visible: false },
        },
        {
          orient: 'left',
          type: 'linear',
          min: 0,
          label: {
            formatMethod: (value: number) => compactFormatter.format(value),
            style: { fontSize: 11 },
          },
          grid: {
            visible: true,
            style: { lineDash: [3, 4], strokeOpacity: 0.28 },
          },
        },
      ],
      line: {
        style: {
          lineWidth: 3,
          curveType: 'monotone',
        },
      },
      point: {
        visible: true,
        style: {
          size: 5,
          lineWidth: 2,
        },
      },
      tooltip: {
        mark: {
          title: {
            value: (datum: HourlyChartPoint) => datum.fullTime,
          },
          content: [
            {
              key: t('Tokens'),
              value: (datum: HourlyChartPoint) =>
                exactFormatter.format(datum.tokens),
            },
          ],
        },
      },
      color: ['#737373'],
      background: 'transparent',
      animation: !shouldReduceMotion,
    }),
    [chartPoints, compactFormatter, exactFormatter, shouldReduceMotion, t]
  )

  let chartContent: ReactNode = null
  if (usageQuery.isLoading) {
    chartContent = <Skeleton className='mt-3 h-[calc(100%-0.75rem)] w-full' />
  } else if (usageQuery.isError || !usage) {
    chartContent = (
      <div className='text-muted-foreground flex h-full items-center justify-center px-6 text-center text-sm'>
        {t('Token usage data is temporarily unavailable.')}
      </div>
    )
  } else if (themeReady) {
    chartContent = (
      <VChart
        key={`global-token-usage-${resolvedTheme}-${chartPoints.length}`}
        spec={{
          ...chartSpec,
          theme: resolvedTheme === 'dark' ? 'dark' : 'light',
        }}
        option={VCHART_OPTION}
      />
    )
  }

  return (
    <section
      className='snowapi-rainflow-panel overflow-hidden'
      aria-labelledby='global-token-usage-title'
    >
      <div className='grid gap-4 border-b px-4 py-4 sm:px-5 lg:grid-cols-[minmax(15rem,0.38fr)_minmax(0,1fr)] lg:items-center'>
        <div className='flex min-w-0 items-start gap-3'>
          <IconBadge tone='info'>
            <Activity />
          </IconBadge>
          <div className='min-w-0'>
            <h3 id='global-token-usage-title' className='text-sm font-semibold'>
              {t('Platform Token Consumption')}
            </h3>
            <p className='text-muted-foreground mt-1 text-xs leading-relaxed'>
              {t('Tokens consumed across all users and models.')}
            </p>
          </div>
        </div>

        <div className='grid grid-cols-2 gap-2'>
          <div className='bg-muted/35 rounded-lg px-3 py-2.5'>
            <div className='text-muted-foreground text-xs'>
              {t('All-time tokens')}
            </div>
            {usageQuery.isLoading ? (
              <Skeleton className='mt-2 h-7 w-32' />
            ) : (
              <div className='mt-1 text-xl font-semibold tracking-tight tabular-nums sm:text-2xl'>
                {exactFormatter.format(usage?.total_tokens ?? 0)}
              </div>
            )}
          </div>
          <div className='bg-muted/35 rounded-lg px-3 py-2.5'>
            <div className='text-muted-foreground text-xs'>
              {t('Last 24 hours')}
            </div>
            {usageQuery.isLoading ? (
              <Skeleton className='mt-2 h-7 w-28' />
            ) : (
              <div className='mt-1 text-xl font-semibold tracking-tight tabular-nums sm:text-2xl'>
                {exactFormatter.format(usage?.last_24h_tokens ?? 0)}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className='px-3 pt-3 sm:px-5'>
        <div className='flex items-center justify-between gap-3'>
          <div className='flex items-center gap-2'>
            <ChartNoAxesCombined
              className='text-muted-foreground size-4'
              aria-hidden='true'
            />
            <span className='text-sm font-medium'>
              {t('Hourly Token Consumption')}
            </span>
          </div>
          <span className='text-muted-foreground rounded-md border px-2 py-1 font-mono text-[11px]'>
            24 × 1h
          </span>
        </div>
      </div>

      <div
        className='h-[260px] px-1 pb-2 sm:h-[300px] sm:px-3'
        role='img'
        aria-label={t(
          'Line chart of token consumption for each hour in the last 24 hours.'
        )}
      >
        {chartContent}
      </div>
    </section>
  )
}
