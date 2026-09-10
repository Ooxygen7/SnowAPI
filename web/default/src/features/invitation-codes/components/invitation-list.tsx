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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Search,
  Trash2,
} from 'lucide-react'
import { useDeferredValue, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import {
  deleteInvitationCode,
  getInvitationCodes,
  updateInvitationCodeStatus,
} from '../api'
import { INVITATION_STATUS, type InvitationCode } from '../types'

const PAGE_SIZE = 20

function formatTimestamp(value: number) {
  return value ? new Date(value * 1000).toLocaleString() : '—'
}

export function InvitationList() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState(0)
  const deferredKeyword = useDeferredValue(keyword.trim())

  useEffect(() => setPage(1), [deferredKeyword, status])

  const invitationQuery = useQuery({
    queryKey: ['invitation-codes', page, deferredKeyword, status],
    queryFn: async () => {
      const response = await getInvitationCodes({
        page,
        pageSize: PAGE_SIZE,
        keyword: deferredKeyword,
        status,
      })
      if (!response.success) {
        throw new Error(
          response.message || t('Failed to load invitation codes')
        )
      }
      return {
        items: response.data?.items || [],
        total: response.data?.total || 0,
      }
    },
    placeholderData: (previous) => previous,
  })

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['invitation-codes'] })

  const statusMutation = useMutation({
    mutationFn: ({ id, nextStatus }: { id: number; nextStatus: number }) =>
      updateInvitationCodeStatus(id, nextStatus),
    onSuccess: (response) => {
      if (!response.success) {
        toast.error(response.message || t('Failed to update invitation code'))
        return
      }
      toast.success(t('Invitation code status updated'))
      refresh()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteInvitationCode,
    onSuccess: (response) => {
      if (!response.success) {
        toast.error(response.message || t('Failed to delete invitation code'))
        return
      }
      toast.success(t('Invitation code deleted'))
      refresh()
    },
  })

  const items = invitationQuery.data?.items || []
  const total = invitationQuery.data?.total || 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const statusBadge = (itemStatus: number) => {
    if (itemStatus === INVITATION_STATUS.USED) {
      return <Badge variant='secondary'>{t('Used')}</Badge>
    }
    if (itemStatus === INVITATION_STATUS.DISABLED) {
      return <Badge variant='outline'>{t('Disabled')}</Badge>
    }
    return <Badge>{t('Available')}</Badge>
  }

  const actions = (item: InvitationCode) => {
    if (item.status === INVITATION_STATUS.USED) {
      return (
        <span className='text-muted-foreground text-xs'>{t('Locked')}</span>
      )
    }
    const nextStatus =
      item.status === INVITATION_STATUS.ENABLED
        ? INVITATION_STATUS.DISABLED
        : INVITATION_STATUS.ENABLED
    return (
      <div className='flex justify-end gap-1'>
        <Button
          size='sm'
          variant='outline'
          disabled={statusMutation.isPending}
          onClick={() => statusMutation.mutate({ id: item.id, nextStatus })}
        >
          {nextStatus === INVITATION_STATUS.ENABLED
            ? t('Enable')
            : t('Disable')}
        </Button>
        <Button
          size='icon'
          variant='ghost'
          disabled={deleteMutation.isPending}
          aria-label={t('Delete invitation code')}
          onClick={() => {
            if (
              window.confirm(
                t('Delete this unused invitation code permanently?')
              )
            ) {
              deleteMutation.mutate(item.id)
            }
          }}
        >
          <Trash2 className='h-4 w-4' />
        </Button>
      </div>
    )
  }

  return (
    <div className='space-y-4'>
      <div className='flex flex-col gap-3 sm:flex-row'>
        <div className='relative flex-1'>
          <Search className='text-muted-foreground absolute top-2.5 left-3 h-4 w-4' />
          <Input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder={t('Search by batch name or masked code')}
            className='pl-9'
          />
        </div>
        <select
          value={status}
          onChange={(event) => setStatus(Number(event.target.value))}
          className='border-input bg-background h-9 rounded-md border px-3 text-sm'
          aria-label={t('Filter by status')}
        >
          <option value={0}>{t('All statuses')}</option>
          <option value={INVITATION_STATUS.ENABLED}>{t('Available')}</option>
          <option value={INVITATION_STATUS.DISABLED}>{t('Disabled')}</option>
          <option value={INVITATION_STATUS.USED}>{t('Used')}</option>
        </select>
      </div>

      {
        <>
          {invitationQuery.isLoading ? (
            <div className='text-muted-foreground flex min-h-56 items-center justify-center gap-2'>
              <Loader2 className='h-4 w-4 animate-spin' />
              {t('Loading invitation codes')}
            </div>
          ) : null}
          {!invitationQuery.isLoading && invitationQuery.isError ? (
            <div className='border-destructive/30 text-destructive rounded-xl border p-6 text-sm'>
              {invitationQuery.error.message}
            </div>
          ) : null}
          {!invitationQuery.isLoading &&
          !invitationQuery.isError &&
          items.length === 0 ? (
            <div className='border-border text-muted-foreground rounded-xl border border-dashed p-10 text-center text-sm'>
              {t('No invitation codes found.')}
            </div>
          ) : null}
          {!invitationQuery.isLoading &&
          !invitationQuery.isError &&
          !(items.length === 0) ? (
            <>
              <div className='hidden overflow-hidden rounded-xl border md:block'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('Batch')}</TableHead>
                      <TableHead>{t('Invitation code')}</TableHead>
                      <TableHead>{t('Status')}</TableHead>
                      <TableHead>{t('Created by')}</TableHead>
                      <TableHead>{t('Used by')}</TableHead>
                      <TableHead>{t('Created')}</TableHead>
                      <TableHead className='text-right'>
                        {t('Actions')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className='font-medium'>
                          {item.name}
                        </TableCell>
                        <TableCell className='font-mono text-xs'>
                          {item.code_prefix}
                        </TableCell>
                        <TableCell>{statusBadge(item.status)}</TableCell>
                        <TableCell>
                          {item.creator_username || `#${item.created_by}`}
                        </TableCell>
                        <TableCell>
                          {item.used_username ||
                            (item.used_by ? `#${item.used_by}` : '—')}
                        </TableCell>
                        <TableCell>
                          {formatTimestamp(item.created_at)}
                        </TableCell>
                        <TableCell>{actions(item)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className='grid gap-3 md:hidden'>
                {items.map((item) => (
                  <div
                    key={item.id}
                    className='space-y-3 rounded-xl border p-4'
                  >
                    <div className='flex items-start justify-between gap-3'>
                      <div>
                        <p className='font-medium'>{item.name}</p>
                        <p className='text-muted-foreground font-mono text-xs'>
                          {item.code_prefix}
                        </p>
                      </div>
                      {statusBadge(item.status)}
                    </div>
                    <div className='text-muted-foreground grid grid-cols-2 gap-2 text-xs'>
                      <span>
                        {t('Created by')}:{' '}
                        {item.creator_username || `#${item.created_by}`}
                      </span>
                      <span>
                        {t('Used by')}: {item.used_username || '—'}
                      </span>
                      <span className='col-span-2'>
                        {formatTimestamp(item.created_at)}
                      </span>
                    </div>
                    {actions(item)}
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </>
      }

      <div className='flex items-center justify-between'>
        <p className='text-muted-foreground text-sm'>
          {t('{{count}} invitation codes', { count: total })}
        </p>
        <div className='flex items-center gap-2'>
          <Button
            size='icon'
            variant='outline'
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            <ChevronLeft className='h-4 w-4' />
          </Button>
          <span className='text-sm'>
            {page} / {totalPages}
          </span>
          <Button
            size='icon'
            variant='outline'
            disabled={page >= totalPages}
            onClick={() =>
              setPage((current) => Math.min(totalPages, current + 1))
            }
          >
            <ChevronRight className='h-4 w-4' />
          </Button>
        </div>
      </div>
    </div>
  )
}
