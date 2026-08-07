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
import { flexRender, type Cell, type Table } from '@tanstack/react-table'
import { Database } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import {
  dotColorMap,
  textColorMap,
  type StatusVariant,
} from '@/components/status-badge'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { formatTimestampToDate } from '@/lib/format'
import { cn } from '@/lib/utils'

import { LOG_TYPE_ENUM } from '../constants'
import type { UsageLog } from '../data/schema'
import { parseLogOther } from '../lib/format'
import {
  getLogTypeConfig,
  isDisplayableLogType,
  isTimingLogType,
} from '../lib/utils'
import { StreamTpsCell, TimingMetricsCell } from './timing-metrics-cell'
import { useUsageLogsContext } from './usage-logs-provider'

const logTypeRowTint: Record<number, string> = {
  [LOG_TYPE_ENUM.ERROR]:
    'bg-rose-50/40 dark:bg-rose-950/20 border-rose-200/50 dark:border-rose-900/30',
  [LOG_TYPE_ENUM.REFUND]:
    'bg-blue-50/30 dark:bg-blue-950/15 border-blue-200/50 dark:border-blue-900/30',
}

interface UsageLogsMobileListProps<TData> {
  table: Table<TData>
  isLoading?: boolean
  emptyTitle?: string
  emptyDescription?: string
}

function UsageLogsMobileSkeleton() {
  return (
    <div className='border-border/50 bg-card overflow-hidden rounded-lg border'>
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className='border-border/40 space-y-2.5 border-b p-3 last:border-b-0'
        >
          <div className='flex items-center justify-between gap-3'>
            <Skeleton className='h-5 w-40 rounded-md' />
            <Skeleton className='h-5 w-16 rounded-md' />
          </div>
          <div className='grid grid-cols-2 gap-x-4 gap-y-2'>
            {[1, 2, 3, 4, 5, 6].map((j) => (
              <div key={j} className='min-w-0 space-y-1'>
                <Skeleton className='h-3 w-10 rounded' />
                <Skeleton className='h-4 w-full rounded' />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function CompactCell<TData>({
  cell,
  fallback = '-',
  className,
  primaryOnly = false,
}: {
  cell?: Cell<TData, unknown>
  fallback?: string
  className?: string
  primaryOnly?: boolean
}) {
  return (
    <div
      className={cn(
        'min-w-0 overflow-hidden leading-tight [&_button]:max-w-full [&_span]:max-w-full',
        primaryOnly &&
          '[&_.flex-col]:min-w-0 [&_.flex-col>*:not(:first-child)]:hidden',
        className
      )}
    >
      {cell ? (
        flexRender(cell.column.columnDef.cell, cell.getContext())
      ) : (
        <span className='text-muted-foreground/50'>{fallback}</span>
      )}
    </div>
  )
}

function MobileLogTimeStatus({
  createdAt,
  type,
}: {
  createdAt: unknown
  type: unknown
}) {
  const { t } = useTranslation()
  const timestamp = typeof createdAt === 'number' ? createdAt : undefined
  const logType = typeof type === 'number' ? type : undefined
  const config = getLogTypeConfig(logType ?? LOG_TYPE_ENUM.UNKNOWN)
  const variant = config.color as StatusVariant

  return (
    <div className='flex min-w-0 items-center gap-2'>
      <div className='shrink-0 font-mono text-[11px] leading-none tabular-nums'>
        {formatTimestampToDate(timestamp)}
      </div>
      <div
        className={cn(
          'inline-flex min-w-0 items-center gap-1 text-[11px] leading-none font-medium',
          textColorMap[variant]
        )}
      >
        <span
          className={cn('size-1.5 shrink-0 rounded-full', dotColorMap[variant])}
          aria-hidden='true'
        />
        <span className='truncate'>{t(config.label)}</span>
      </div>
    </div>
  )
}

/** Mobile-only token block with optional cache token details. */
function MobileTokensField({ log }: { log: UsageLog }) {
  const { t } = useTranslation()

  if (!isDisplayableLogType(log.type)) return null

  const promptTokens = log.prompt_tokens || 0
  const completionTokens = log.completion_tokens || 0
  if (promptTokens === 0 && completionTokens === 0) {
    return (
      <div className='min-w-0'>
        <span className='text-muted-foreground text-xs'>-</span>
      </div>
    )
  }

  const other = parseLogOther(log.other)
  const cacheReadTokens = other?.cache_tokens || 0
  const cacheWrite5m = other?.cache_creation_tokens_5m || 0
  const cacheWrite1h = other?.cache_creation_tokens_1h || 0
  const hasSplitCache = cacheWrite5m > 0 || cacheWrite1h > 0
  const cacheWriteTokens = hasSplitCache
    ? cacheWrite5m + cacheWrite1h
    : other?.cache_creation_tokens || 0
  const showCache = cacheReadTokens > 0 || cacheWriteTokens > 0

  return (
    <div className='min-w-0'>
      <div className='flex flex-col gap-0.5'>
        <span className='font-mono text-xs font-medium tabular-nums'>
          {promptTokens.toLocaleString()} / {completionTokens.toLocaleString()}
        </span>
        {showCache && (
          <div className='text-muted-foreground flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] leading-none'>
            {cacheReadTokens > 0 && (
              <span>
                {t('Cache Read')} {cacheReadTokens.toLocaleString()}
              </span>
            )}
            {cacheWriteTokens > 0 && (
              <span>
                {t('Cache Write')} {cacheWriteTokens.toLocaleString()}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/** Mobile-only user block with a compact, text-first layout. */
function MobileUserField({ log }: { log: UsageLog }) {
  const { sensitiveVisible, setSelectedUserId, setUserInfoDialogOpen } =
    useUsageLogsContext()

  if (!log.username) return null

  return (
    <button
      type='button'
      className='text-muted-foreground hover:text-foreground flex max-w-[7rem] min-w-0 items-center text-left'
      onClick={(e) => {
        e.stopPropagation()
        setSelectedUserId(log.user_id)
        setUserInfoDialogOpen(true)
      }}
    >
      <span className='min-w-0 truncate text-[11px]'>
        {sensitiveVisible ? log.username : '••••'}
      </span>
    </button>
  )
}

/** Merge stream badge + TPS with first-token / duration on one row. */
function MobileStreamTimingField({ log }: { log: UsageLog }) {
  if (!isTimingLogType(log.type)) return null

  const other = parseLogOther(log.other)
  const useTime = log.use_time || 0
  const tokensPerSecond =
    useTime > 0 && log.completion_tokens > 0
      ? log.completion_tokens / useTime
      : null

  return (
    <div className='flex min-w-0 items-center gap-2'>
      <TimingMetricsCell
        useTimeSec={useTime}
        completionTokens={log.completion_tokens}
        frtMs={other?.frt}
        isStream={log.is_stream}
        indicator='dot'
        className='min-w-0 flex-1'
      />
      <StreamTpsCell
        isStream={log.is_stream}
        tokensPerSecond={tokensPerSecond}
        streamStatus={other?.stream_status}
        className='shrink-0'
      />
    </div>
  )
}

function CommonLogsCard<TData>({
  cells,
}: {
  cells: Map<string, Cell<TData, unknown>>
}) {
  const modelCell = cells.get('model_name')
  const quotaCell = cells.get('quota')
  const rowData = cells.get('created_at')?.row.original as UsageLog | undefined
  const showUsageFields = rowData != null && isDisplayableLogType(rowData.type)

  return (
    <div className='flex min-w-0 flex-col gap-1.5'>
      {showUsageFields ? (
        <div className='flex min-w-0 items-center justify-between gap-3'>
          <CompactCell cell={modelCell} className='flex-1' />
          <CompactCell
            cell={quotaCell}
            className='shrink-0 text-right [&_.flex-col]:items-end'
          />
        </div>
      ) : null}

      <div className='flex min-w-0 items-center justify-between gap-2'>
        <MobileLogTimeStatus
          createdAt={rowData?.created_at}
          type={rowData?.type}
        />
        {rowData && cells.has('user') ? (
          <MobileUserField log={rowData} />
        ) : null}
      </div>

      {showUsageFields ? (
        <div className='grid min-w-0 grid-cols-2 items-center gap-3'>
          <MobileTokensField log={rowData} />
          <MobileStreamTimingField log={rowData} />
        </div>
      ) : null}

      <CompactCell
        cell={cells.get('content')}
        className='text-xs [&_button]:w-full [&_button]:truncate'
      />
    </div>
  )
}

export function UsageLogsMobileList<TData>({
  table,
  isLoading = false,
  emptyTitle,
  emptyDescription,
}: UsageLogsMobileListProps<TData>) {
  const { t } = useTranslation()

  const resolvedEmptyTitle = emptyTitle ?? t('No Logs Found')
  const resolvedEmptyDescription =
    emptyDescription ??
    t('No usage logs available. Logs will appear here once API calls are made.')

  if (isLoading) {
    return <UsageLogsMobileSkeleton />
  }

  const rows = table.getRowModel().rows

  if (!rows || rows.length === 0) {
    return (
      <div className='rounded-lg border p-6'>
        <Empty className='border-none p-0'>
          <EmptyHeader>
            <EmptyMedia variant='icon'>
              <Database className='size-6' />
            </EmptyMedia>
            <EmptyTitle>{resolvedEmptyTitle}</EmptyTitle>
            <EmptyDescription>{resolvedEmptyDescription}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    )
  }

  return (
    <div className='border-border/50 bg-card overflow-hidden rounded-lg border'>
      {rows.map((row) => {
        const cells = new Map(
          row.getVisibleCells().map((cell) => [cell.column.id, cell])
        )

        const logType = (row.original as Record<string, unknown>).type as
          | number
          | undefined
        const tintClass = logType != null ? (logTypeRowTint[logType] ?? '') : ''

        return (
          <div
            key={row.id}
            className={cn(
              'snowapi-usage-log-mobile-row border-border/40 border-b border-l-2 border-l-transparent px-3 py-2.5 transition-colors last:border-b-0',
              tintClass
            )}
          >
            <CommonLogsCard cells={cells} />
          </div>
        )
      })}
    </div>
  )
}
