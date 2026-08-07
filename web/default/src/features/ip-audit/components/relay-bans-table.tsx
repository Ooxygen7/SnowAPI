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

import type { RelayBanListData, RelayBanListItem } from '../types'

type RelayBansTableProps = {
  data?: RelayBanListData
  loading: boolean
  page: number
  formatTime: (timestamp: number) => string
  onPageChange: (page: number) => void
  onInspect: (item: RelayBanListItem) => void
  onExtend: (item: RelayBanListItem) => void
  onRevoke: (item: RelayBanListItem) => void
}

export function RelayBansTable({
  data,
  loading,
  page,
  formatTime,
  onPageChange,
  onInspect,
  onExtend,
  onRevoke,
}: RelayBansTableProps) {
  const { t } = useTranslation()
  const items = data?.items ?? []
  const totalPages = Math.max(
    1,
    Math.ceil((data?.total ?? 0) / (data?.page_size ?? 20))
  )

  return (
    <Card size='sm'>
      <CardHeader>
        <CardTitle>{t('Relay bans')}</CardTitle>
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
            <div className='font-medium'>{t('No relay bans')}</div>
          </div>
        )}
        {!loading && items.length > 0 && (
          <>
            <div className='hidden md:block'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('User')}</TableHead>
                    <TableHead>{t('Status')}</TableHead>
                    <TableHead>{t('Source')}</TableHead>
                    <TableHead>{t('Started')}</TableHead>
                    <TableHead>{t('Expires')}</TableHead>
                    <TableHead>{t('Reason')}</TableHead>
                    <TableHead className='text-right'>{t('Actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.ban.user_id}>
                      <TableCell>
                        <div className='font-medium'>
                          {item.display_name ||
                            item.username ||
                            `#${item.ban.user_id}`}
                        </div>
                        <div className='text-muted-foreground text-xs'>
                          {item.username} · #{item.ban.user_id}
                        </div>
                      </TableCell>
                      <TableCell>
                        <BanStatus status={item.status} />
                      </TableCell>
                      <TableCell>
                        <BanSource source={item.ban.source} />
                      </TableCell>
                      <TableCell>{formatTime(item.ban.starts_at)}</TableCell>
                      <TableCell>
                        {item.ban.expires_at === 0
                          ? t('Permanent')
                          : formatTime(item.ban.expires_at)}
                      </TableCell>
                      <TableCell
                        className='max-w-60 truncate'
                        title={item.ban.reason}
                      >
                        {item.ban.reason || '—'}
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
                          {item.status === 'active' && (
                            <>
                              <Button
                                variant='outline'
                                size='sm'
                                onClick={() => onExtend(item)}
                              >
                                {t('Extend')}
                              </Button>
                              <Button
                                variant='destructive'
                                size='sm'
                                onClick={() => onRevoke(item)}
                              >
                                {t('Revoke')}
                              </Button>
                            </>
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
                <div key={item.ban.user_id} className='rounded-lg border p-3'>
                  <div className='flex items-start justify-between gap-2'>
                    <div>
                      <div className='font-medium'>
                        {item.display_name ||
                          item.username ||
                          `#${item.ban.user_id}`}
                      </div>
                      <div className='text-muted-foreground text-xs'>
                        {item.username} · #{item.ban.user_id}
                      </div>
                    </div>
                    <BanStatus status={item.status} />
                  </div>
                  <dl className='mt-3 grid grid-cols-2 gap-2 text-xs'>
                    <div>
                      <dt className='text-muted-foreground'>{t('Source')}</dt>
                      <dd className='mt-1'>
                        <BanSource source={item.ban.source} />
                      </dd>
                    </div>
                    <div>
                      <dt className='text-muted-foreground'>{t('Expires')}</dt>
                      <dd className='mt-1'>
                        {item.ban.expires_at === 0
                          ? t('Permanent')
                          : formatTime(item.ban.expires_at)}
                      </dd>
                    </div>
                  </dl>
                  <div className='mt-3 flex justify-end gap-1'>
                    <Button
                      variant='ghost'
                      size='sm'
                      onClick={() => onInspect(item)}
                    >
                      {t('Details')}
                    </Button>
                    {item.status === 'active' && (
                      <>
                        <Button
                          variant='outline'
                          size='sm'
                          onClick={() => onExtend(item)}
                        >
                          {t('Extend')}
                        </Button>
                        <Button
                          variant='destructive'
                          size='sm'
                          onClick={() => onRevoke(item)}
                        >
                          {t('Revoke')}
                        </Button>
                      </>
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

function BanStatus({ status }: { status: RelayBanListItem['status'] }) {
  const { t } = useTranslation()
  if (status === 'active') {
    return <Badge variant='destructive'>{t('Active')}</Badge>
  }
  if (status === 'expired') {
    return <Badge variant='secondary'>{t('Expired')}</Badge>
  }
  return <Badge variant='outline'>{t('Revoked')}</Badge>
}

function BanSource({ source }: { source: RelayBanListItem['ban']['source'] }) {
  const { t } = useTranslation()
  return (
    <Badge variant='outline'>
      {source === 'manual' ? t('Manual') : t('Automatic')}
    </Badge>
  )
}
