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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import type { RelayBan, RelayRiskData, RelayRiskItem } from '../types'

type RelayRiskTableProps = {
  data?: RelayRiskData
  loading: boolean
  page: number
  formatTime: (timestamp: number) => string
  onPageChange: (page: number) => void
  onInspect: (item: RelayRiskItem) => void
  onBan: (item: RelayRiskItem) => void
}

export function RelayRiskTable({
  data,
  loading,
  page,
  formatTime,
  onPageChange,
  onInspect,
  onBan,
}: RelayRiskTableProps) {
  const { t } = useTranslation()
  const items = data?.items ?? []
  const totalPages = Math.max(
    1,
    Math.ceil((data?.total ?? 0) / (data?.page_size ?? 20))
  )

  return (
    <Card size='sm'>
      <CardHeader>
        <CardTitle>{t('Recent relay risk')}</CardTitle>
      </CardHeader>
      <CardContent className='px-0'>
        {loading && (
          <div className='space-y-2 px-3 py-2'>
            {[0, 1, 2, 3, 4].map((row) => (
              <Skeleton key={row} className='h-14 w-full' />
            ))}
          </div>
        )}
        {!loading && items.length === 0 && (
          <div className='flex flex-col items-center px-4 py-14 text-center'>
            <div className='bg-muted mb-3 rounded-xl p-3'>
              <ShieldCheck className='text-muted-foreground size-5' />
            </div>
            <div className='font-medium'>{t('No recent risky activity')}</div>
            <p className='text-muted-foreground mt-1 text-xs'>
              {t('The exact rolling window is the last 10 minutes.')}
            </p>
          </div>
        )}
        {!loading && items.length > 0 && (
          <>
            <div className='hidden md:block'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('User')}</TableHead>
                    <TableHead className='text-right'>
                      {t('Requests')}
                    </TableHead>
                    <TableHead className='text-right'>
                      {t('Eligible IPs')}
                    </TableHead>
                    <TableHead className='text-right'>
                      {t('Countries')}
                    </TableHead>
                    <TableHead className='text-right'>{t('ASNs')}</TableHead>
                    <TableHead>{t('Minimum switch gap')}</TableHead>
                    <TableHead>{t('Status')}</TableHead>
                    <TableHead className='text-right'>{t('Actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.user_id}>
                      <TableCell>
                        <div className='font-medium'>
                          {item.username || `#${item.user_id}`}
                        </div>
                        <div className='text-muted-foreground text-xs'>
                          #{item.user_id} · {formatTime(item.last_seen_at)}
                        </div>
                      </TableCell>
                      <TableCell className='text-right'>
                        {item.request_count}
                      </TableCell>
                      <TableCell className='text-right'>
                        {item.evidence.eligible_ips}
                      </TableCell>
                      <TableCell className='text-right'>
                        {item.evidence.country_count}
                      </TableCell>
                      <TableCell className='text-right'>
                        {item.evidence.asn_count}
                      </TableCell>
                      <TableCell>
                        {item.evidence.minimum_gap_seconds < 0
                          ? '—'
                          : t('{{count}} seconds', {
                              count: item.evidence.minimum_gap_seconds,
                            })}
                      </TableCell>
                      <TableCell>
                        <RiskStatus item={item} now={data?.end_at ?? 0} />
                      </TableCell>
                      <TableCell>
                        <div className='flex justify-end gap-1'>
                          <Button
                            variant='ghost'
                            size='sm'
                            onClick={() => onInspect(item)}
                          >
                            {t('Details')}
                          </Button>
                          {!isBanActive(item.ban, data?.end_at ?? 0) && (
                            <Button
                              variant='outline'
                              size='sm'
                              onClick={() => onBan(item)}
                            >
                              {t('Ban')}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className='space-y-2 px-3 md:hidden'>
              {items.map((item) => (
                <div key={item.user_id} className='rounded-lg border p-3'>
                  <div className='flex items-start justify-between gap-2'>
                    <div>
                      <div className='font-medium'>
                        {item.username || `#${item.user_id}`}
                      </div>
                      <div className='text-muted-foreground text-xs'>
                        #{item.user_id}
                      </div>
                    </div>
                    <RiskStatus item={item} now={data?.end_at ?? 0} />
                  </div>
                  <div className='mt-3 grid grid-cols-4 gap-2 text-center text-xs'>
                    <Metric label={t('Requests')} value={item.request_count} />
                    <Metric
                      label={t('Eligible IPs')}
                      value={item.evidence.eligible_ips}
                    />
                    <Metric
                      label={t('Countries')}
                      value={item.evidence.country_count}
                    />
                    <Metric label={t('ASNs')} value={item.evidence.asn_count} />
                  </div>
                  <div className='mt-3 flex justify-end gap-1'>
                    <Button
                      variant='ghost'
                      size='sm'
                      onClick={() => onInspect(item)}
                    >
                      {t('Details')}
                    </Button>
                    {!isBanActive(item.ban, data?.end_at ?? 0) && (
                      <Button
                        variant='outline'
                        size='sm'
                        onClick={() => onBan(item)}
                      >
                        {t('Ban')}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>

      {!loading && (data?.total ?? 0) > 0 && (
        <div className='flex items-center justify-between border-t px-3 pt-3'>
          <span className='text-muted-foreground text-xs'>
            {t('Page {{page}} of {{total}}', { page, total: totalPages })}
          </span>
          <div className='flex gap-2'>
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

function RiskStatus({ item, now }: { item: RelayRiskItem; now: number }) {
  const { t } = useTranslation()
  if (isBanActive(item.ban, now)) {
    return <Badge variant='destructive'>{t('Banned')}</Badge>
  }
  if (item.evidence.triggers_ban) {
    return <Badge variant='destructive'>{t('Rule matched')}</Badge>
  }
  return <Badge variant='outline'>{t('Observed')}</Badge>
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className='text-muted-foreground truncate'>{label}</div>
      <div className='mt-1 font-medium tabular-nums'>{value}</div>
    </div>
  )
}

function isBanActive(ban: RelayBan | undefined, now: number) {
  return Boolean(
    ban &&
    ban.version > 0 &&
    ban.revoked_at === 0 &&
    ban.starts_at <= now &&
    (ban.expires_at === 0 || ban.expires_at > now)
  )
}
