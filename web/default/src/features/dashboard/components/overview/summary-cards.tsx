import { useQuery } from '@tanstack/react-query'
import { Copy, ExternalLink } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { getUserQuotaDates } from '@/features/dashboard/api'
import type { QuotaDataItem } from '@/features/dashboard/types'
import { useStatus } from '@/hooks/use-status'
import { formatNumber, formatQuota } from '@/lib/format'
import { computeTimeRange } from '@/lib/time'
import { useAuthStore } from '@/stores/auth-store'

const CHART_BUCKETS = 24
const CHART_WIDTH = 1000
const CHART_HEIGHT = 220
const CHART_TOP = 24
const CHART_BOTTOM = 192
const HOUR_BUCKET_KEYS = Array.from(
  { length: CHART_BUCKETS },
  (_, index) => `hour-bucket-${index}`
)

function buildHourlySeries(
  data: QuotaDataItem[],
  start: number,
  end: number,
  selectValue: (item: QuotaDataItem) => number
) {
  const buckets = Array.from({ length: CHART_BUCKETS }, () => 0)
  const duration = Math.max(1, end - start)
  for (const item of data) {
    const timestamp = Number(item.created_at) || start
    const ratio = Math.min(
      0.999999,
      Math.max(0, (timestamp - start) / duration)
    )
    buckets[Math.floor(ratio * CHART_BUCKETS)] += selectValue(item)
  }
  return buckets
}

function UsageTrendChart({
  values,
  label,
  formatValue,
}: {
  values: number[]
  label: string
  formatValue: (value: number) => string
}) {
  const { t } = useTranslation()
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const gradientId = `overview-area-${useId().replaceAll(':', '')}`
  const peak = Math.max(1, ...values)
  const points = values.map((value, index) => ({
    x: (index / Math.max(1, values.length - 1)) * CHART_WIDTH,
    y: CHART_BOTTOM - (Math.max(0, value) / peak) * (CHART_BOTTOM - CHART_TOP),
  }))
  const polyline = points.map((point) => `${point.x},${point.y}`).join(' ')
  const area = `0,${CHART_BOTTOM} ${polyline} ${CHART_WIDTH},${CHART_BOTTOM}`
  const activePoint = activeIndex === null ? null : points[activeIndex]

  return (
    <section
      className='snowapi-rainflow-panel overflow-hidden'
      aria-label={label}
    >
      <div className='flex items-center justify-between px-4 pt-4 sm:px-5'>
        <h2 className='text-sm font-medium'>{label}</h2>
        <span className='text-muted-foreground text-xs'>{t('24 hours')}</span>
      </div>
      <div className='h-[240px] px-3 pt-2 pb-3 sm:h-[260px] sm:px-5'>
        <div className='relative h-[calc(100%-18px)]'>
          <svg
            viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
            preserveAspectRatio='none'
            className='h-full w-full overflow-visible'
            role='img'
            aria-label={label}
          >
            {[CHART_TOP, 80, 136, CHART_BOTTOM].map((y) => (
              <line
                key={y}
                x1='0'
                x2={CHART_WIDTH}
                y1={y}
                y2={y}
                stroke='currentColor'
                className='text-border'
                strokeWidth='1'
                strokeDasharray='3 5'
                vectorEffect='non-scaling-stroke'
              />
            ))}
            <defs>
              <linearGradient id={gradientId} x1='0' y1='0' x2='0' y2='1'>
                <stop offset='0%' stopColor='currentColor' stopOpacity='0.12' />
                <stop offset='100%' stopColor='currentColor' stopOpacity='0' />
              </linearGradient>
            </defs>
            <polygon points={area} fill={`url(#${gradientId})`} />
            <polyline
              points={polyline}
              fill='none'
              stroke='currentColor'
              className='text-foreground'
              strokeWidth='2'
              strokeLinejoin='round'
              strokeLinecap='round'
              vectorEffect='non-scaling-stroke'
            />
            {activePoint ? (
              <circle
                cx={activePoint.x}
                cy={activePoint.y}
                r='5'
                className='fill-background stroke-foreground'
                strokeWidth='2'
                vectorEffect='non-scaling-stroke'
              />
            ) : null}
          </svg>

          <div className='absolute inset-0 grid grid-cols-24'>
            {values.map((value, index) => (
              <button
                key={HOUR_BUCKET_KEYS[index]}
                type='button'
                className='h-full cursor-crosshair outline-none'
                aria-label={`${23 - index} ${t('hours ago')}: ${formatValue(value)}`}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseLeave={() => setActiveIndex(null)}
                onFocus={() => setActiveIndex(index)}
                onBlur={() => setActiveIndex(null)}
              />
            ))}
          </div>

          {activeIndex !== null && activePoint ? (
            <div
              className='bg-foreground text-background pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg px-2.5 py-1.5 text-xs shadow-sm'
              style={{
                left: `${((activeIndex + 0.5) / CHART_BUCKETS) * 100}%`,
                top: `${(activePoint.y / CHART_HEIGHT) * 100}%`,
              }}
            >
              <div className='font-medium'>
                {formatValue(values[activeIndex])}
              </div>
              <div className='opacity-70'>
                {activeIndex === values.length - 1
                  ? t('Current hour')
                  : t('{{count}} hours ago', {
                      count: values.length - 1 - activeIndex,
                    })}
              </div>
            </div>
          ) : null}
        </div>
        <div className='text-muted-foreground flex justify-between text-[10px]'>
          <span>{t('23 hours ago')}</span>
          <span>{t('Now')}</span>
        </div>
      </div>
    </section>
  )
}

function SummaryMetric({
  label,
  value,
  loading,
}: {
  label: string
  value: string
  loading?: boolean
}) {
  return (
    <div className='snowapi-rainflow-panel min-h-24 p-4 sm:p-5'>
      <div className='text-muted-foreground text-xs'>{label}</div>
      {loading ? (
        <Skeleton className='mt-3 h-7 w-28' />
      ) : (
        <div className='mt-3 text-2xl leading-none font-medium tracking-tight tabular-nums'>
          {value}
        </div>
      )}
    </div>
  )
}

export function SummaryCards() {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.auth.user)
  const { status } = useStatus()
  const timeRange = useMemo(() => computeTimeRange(1), [])
  const usageQuery = useQuery({
    queryKey: [
      'dashboard',
      'overview',
      'hourly-usage',
      timeRange.start_timestamp,
      timeRange.end_timestamp,
    ],
    queryFn: () =>
      getUserQuotaDates({
        start_timestamp: timeRange.start_timestamp,
        end_timestamp: timeRange.end_timestamp,
        default_time: 'hour',
      }),
    staleTime: 60 * 1000,
  })
  const usageItems = useMemo(
    () => usageQuery.data?.data ?? [],
    [usageQuery.data?.data]
  )
  const hourlyTokens = useMemo(
    () =>
      buildHourlySeries(
        usageItems,
        timeRange.start_timestamp,
        timeRange.end_timestamp,
        (item) => Number(item.token_used) || 0
      ),
    [usageItems, timeRange]
  )
  const hourlyRequests = useMemo(
    () =>
      buildHourlySeries(
        usageItems,
        timeRange.start_timestamp,
        timeRange.end_timestamp,
        (item) => Number(item.count) || 0
      ),
    [usageItems, timeRange]
  )
  const recentQuota = useMemo(
    () =>
      usageItems.reduce((total, item) => total + (Number(item.quota) || 0), 0),
    [usageItems]
  )
  const apiBase = `${String(status?.server_address || window.location.origin).replace(/\/$/, '')}/v1`

  const copyApiBase = async () => {
    await navigator.clipboard.writeText(apiBase)
    toast.success(t('Copied'))
  }

  const metrics = [
    {
      label: t('Credit remaining'),
      value: formatQuota(Number(user?.quota ?? 0)),
    },
    {
      label: t('Last 24h usage'),
      value: formatQuota(recentQuota),
      loading: usageQuery.isLoading,
    },
    {
      label: t('Historical Usage'),
      value: formatQuota(Number(user?.used_quota ?? 0)),
    },
    {
      label: t('Request Count'),
      value: formatNumber(Number(user?.request_count ?? 0)),
    },
  ]

  return (
    <div className='flex flex-col gap-4'>
      <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4'>
        {metrics.map((metric) => (
          <SummaryMetric key={metric.label} {...metric} />
        ))}
      </div>
      <UsageTrendChart
        values={hourlyTokens}
        label={t('Hourly Token Consumption')}
        formatValue={formatNumber}
      />
      <UsageTrendChart
        values={hourlyRequests}
        label={t('Hourly Request Count')}
        formatValue={formatNumber}
      />

      <section className='snowapi-rainflow-panel grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:p-5'>
        <div className='min-w-0'>
          <p className='text-muted-foreground text-xs'>{t('API URL')}</p>
          <code className='mt-2 block truncate font-mono text-sm'>
            {apiBase}
          </code>
          <div className='text-muted-foreground mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs'>
            <a
              className='hover:text-foreground inline-flex items-center gap-1'
              href='/user-agreement'
            >
              {t('Terms of Service')} <ExternalLink className='size-3' />
            </a>
            <a
              className='hover:text-foreground inline-flex items-center gap-1'
              href='/privacy-policy'
            >
              {t('Privacy Policy')} <ExternalLink className='size-3' />
            </a>
          </div>
        </div>
        <Button variant='outline' onClick={copyApiBase}>
          <Copy className='size-4' /> {t('Copy')}
        </Button>
      </section>
    </div>
  )
}
