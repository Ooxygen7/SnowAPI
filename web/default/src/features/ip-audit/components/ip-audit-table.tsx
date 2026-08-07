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
import { ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

import type { IPAuditData, IPAuditItem } from '../types'

type IPAuditTableProps = {
  data?: IPAuditData
  loading: boolean
  page: number
  onPageChange: (page: number) => void
  numberFormat: Intl.NumberFormat
  formatTime: (timestamp: number) => string
}

export function IPAuditTable({
  data,
  loading,
  page,
  onPageChange,
  numberFormat,
  formatTime,
}: IPAuditTableProps) {
  const { t } = useTranslation()
  const items = data?.items ?? []
  const totalPages = Math.max(
    1,
    Math.ceil((data?.total ?? 0) / (data?.page_size ?? 20))
  )

  return (
    <Card size='sm'>
      <div className='flex flex-wrap items-center justify-between gap-2 px-3'>
        <div>
          <div className='text-sm font-medium'>{t('IP observations')}</div>
          <div className='text-muted-foreground text-xs'>
            {t('{{count}} matching IPs', {
              count: numberFormat.format(data?.total ?? 0),
            })}
          </div>
        </div>
        <div className='text-muted-foreground text-xs'>
          {t('Page {{page}} of {{total}}', { page, total: totalPages })}
        </div>
      </div>

      <CardContent className='px-0'>
        <AuditRowsContent
          items={items}
          loading={loading}
          numberFormat={numberFormat}
          formatTime={formatTime}
        />
      </CardContent>

      {!loading && (data?.total ?? 0) > 0 && (
        <div className='border-t px-3 pt-3'>
          <div className='flex items-center justify-end gap-2'>
            <Button
              variant='outline'
              size='sm'
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              {t('Previous')}
            </Button>
            <Button
              variant='outline'
              size='sm'
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              {t('Next')}
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}

function AuditRowsContent({
  items,
  loading,
  numberFormat,
  formatTime,
}: {
  items: IPAuditItem[]
  loading: boolean
  numberFormat: Intl.NumberFormat
  formatTime: (timestamp: number) => string
}) {
  const { t } = useTranslation()
  if (loading) {
    return (
      <div className='space-y-2 px-3 py-2'>
        {[0, 1, 2, 3, 4].map((row) => (
          <Skeleton key={row} className='h-14 w-full rounded-lg' />
        ))}
      </div>
    )
  }
  if (items.length === 0) {
    return (
      <div className='flex flex-col items-center px-4 py-14 text-center'>
        <div className='bg-muted mb-3 rounded-xl p-3'>
          <ShieldCheck className='text-muted-foreground size-5' />
        </div>
        <div className='font-medium'>{t('No matching IP activity')}</div>
        <p className='text-muted-foreground mt-1 max-w-md text-xs'>
          {t(
            'IP audit data appears after authenticated API requests are received.'
          )}
        </p>
      </div>
    )
  }
  return (
    <>
      <div className='hidden md:block'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className='w-2 px-0' />
              <TableHead>{t('IP address')}</TableHead>
              <TableHead>{t('Associated users')}</TableHead>
              <TableHead className='text-right'>{t('Requests')}</TableHead>
              <TableHead className='text-right'>{t('Peak RPM')}</TableHead>
              <TableHead>{t('Observed')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <DesktopRow
                key={item.ip}
                item={item}
                numberFormat={numberFormat}
                formatTime={formatTime}
              />
            ))}
          </TableBody>
        </Table>
      </div>
      <div className='space-y-2 px-3 md:hidden'>
        {items.map((item) => (
          <MobileRow
            key={item.ip}
            item={item}
            numberFormat={numberFormat}
            formatTime={formatTime}
          />
        ))}
      </div>
    </>
  )
}

function DesktopRow({
  item,
  numberFormat,
  formatTime,
}: {
  item: IPAuditItem
  numberFormat: Intl.NumberFormat
  formatTime: (timestamp: number) => string
}) {
  const { t } = useTranslation()
  return (
    <TableRow>
      <TableCell className='px-0'>
        <span
          className={cn('block h-10 w-1 rounded-r-full', riskRailClass(item))}
        />
      </TableCell>
      <TableCell>
        <code className='text-foreground font-mono text-xs'>{item.ip}</code>
        <div className='mt-1 flex gap-1'>
          {item.count_anomaly && (
            <Badge
              variant='outline'
              className='border-amber-500/40 text-amber-700 dark:text-amber-300'
            >
              {t('Count')}
            </Badge>
          )}
          {item.rpm_anomaly && <Badge variant='destructive'>{t('RPM')}</Badge>}
          {!item.count_anomaly && !item.rpm_anomaly && (
            <Badge
              variant='outline'
              className='text-emerald-700 dark:text-emerald-300'
            >
              {t('Normal')}
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell>
        <UserList item={item} numberFormat={numberFormat} />
      </TableCell>
      <TableCell className='text-right font-medium'>
        {numberFormat.format(item.request_count)}
      </TableCell>
      <TableCell
        className={cn(
          'text-right font-medium',
          item.rpm_anomaly && 'text-destructive'
        )}
      >
        {numberFormat.format(item.peak_rpm)}
      </TableCell>
      <TableCell>
        <div className='text-xs'>{formatTime(item.last_seen_at)}</div>
        <div className='text-muted-foreground mt-1 text-[11px]'>
          {t('First {{time}}', { time: formatTime(item.first_seen_at) })}
        </div>
      </TableCell>
    </TableRow>
  )
}

function MobileRow({
  item,
  numberFormat,
  formatTime,
}: {
  item: IPAuditItem
  numberFormat: Intl.NumberFormat
  formatTime: (timestamp: number) => string
}) {
  const { t } = useTranslation()
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-lg border p-3 pl-4',
        item.rpm_anomaly && 'border-red-500/30',
        !item.rpm_anomaly && item.count_anomaly && 'border-amber-500/30'
      )}
    >
      <span
        className={cn('absolute inset-y-0 left-0 w-1', riskRailClass(item))}
      />
      <div className='flex items-start justify-between gap-2'>
        <code className='font-mono text-xs break-all'>{item.ip}</code>
        <div className='flex shrink-0 gap-1'>
          {item.count_anomaly && <Badge variant='outline'>{t('Count')}</Badge>}
          {item.rpm_anomaly && <Badge variant='destructive'>{t('RPM')}</Badge>}
        </div>
      </div>
      <div className='mt-3 grid grid-cols-3 gap-2 text-xs'>
        <Metric
          label={t('Requests')}
          value={numberFormat.format(item.request_count)}
        />
        <Metric
          label={t('Peak RPM')}
          value={numberFormat.format(item.peak_rpm)}
        />
        <Metric
          label={t('Users')}
          value={numberFormat.format(item.user_count)}
        />
      </div>
      <div className='mt-3'>
        <UserList item={item} numberFormat={numberFormat} />
      </div>
      <div className='text-muted-foreground mt-3 text-[11px]'>
        {t('Last seen {{time}}', { time: formatTime(item.last_seen_at) })}
      </div>
    </div>
  )
}

function UserList({
  item,
  numberFormat,
}: {
  item: IPAuditItem
  numberFormat: Intl.NumberFormat
}) {
  const { t } = useTranslation()
  return (
    <div className='max-w-sm'>
      <div className='flex flex-wrap gap-1'>
        {item.users.map((user) => (
          <Badge
            key={user.user_id}
            variant='secondary'
            title={`#${user.user_id}`}
          >
            {user.username || `#${user.user_id}`}
            <span className='text-muted-foreground'>
              {numberFormat.format(user.request_count)}
            </span>
          </Badge>
        ))}
        {item.users_truncated && <Badge variant='outline'>{t('More')}</Badge>}
      </div>
      <div className='text-muted-foreground mt-1 text-[11px]'>
        {t('{{count}} associated users', {
          count: numberFormat.format(item.user_count),
        })}
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className='text-muted-foreground text-[10px] font-medium uppercase'>
        {label}
      </div>
      <div className='mt-0.5 font-medium tabular-nums'>{value}</div>
    </div>
  )
}

function riskRailClass(item: IPAuditItem) {
  if (item.rpm_anomaly) return 'bg-red-500'
  if (item.count_anomaly) return 'bg-amber-500'
  return 'bg-emerald-500'
}
