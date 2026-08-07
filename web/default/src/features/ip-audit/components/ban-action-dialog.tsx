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
import { useMutation, useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { useDebounce } from '@/hooks'

import {
  applyRelayBan,
  extendRelayBan,
  revokeRelayBan,
  searchRelayBanUsers,
} from '../api'

export type RelayBanAction = 'apply' | 'extend' | 'revoke'

type BanActionDialogProps = {
  open: boolean
  action: RelayBanAction
  user?: { id: number; username: string }
  onOpenChange: (open: boolean) => void
  onCompleted: () => void
}

export function BanActionDialog({
  open,
  action,
  user,
  onOpenChange,
  onCompleted,
}: BanActionDialogProps) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [selectedUserId, setSelectedUserId] = useState(0)
  const [duration, setDuration] = useState('0')
  const [reason, setReason] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const userSearch = useQuery({
    queryKey: ['relay-ban-user-search', debouncedSearch],
    queryFn: () => searchRelayBanUsers(debouncedSearch),
    enabled: open && action === 'apply' && !user && debouncedSearch.length > 0,
    staleTime: 30_000,
  })

  useEffect(() => {
    if (!open) return
    setSearch('')
    setSelectedUserId(user?.id ?? 0)
    setDuration('0')
    setReason('')
  }, [open, user?.id])

  const mutation = useMutation({
    mutationFn: async () => {
      const userId = user?.id ?? selectedUserId
      if (userId <= 0) throw new Error('A user must be selected')
      if (action === 'revoke') return revokeRelayBan(userId, reason)

      const payload = {
        reason,
        permanent: duration === '0',
        duration_seconds: Number(duration),
      }
      if (action === 'extend') return extendRelayBan(userId, payload)
      return applyRelayBan(userId, payload)
    },
    onSuccess: () => {
      let message = t('Relay ban applied')
      if (action === 'extend') message = t('Relay ban extended')
      if (action === 'revoke') message = t('Relay ban revoked')
      toast.success(message)
      onOpenChange(false)
      onCompleted()
    },
  })

  let title = t('Manual relay ban')
  if (action === 'extend') title = t('Extend relay ban')
  if (action === 'revoke') title = t('Revoke relay ban')
  const targetId = user?.id ?? selectedUserId

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {action === 'revoke'
              ? t('The user can make relay requests again after revocation.')
              : t(
                  'This blocks model and generation relay requests for the selected user.'
                )}
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4'>
          {action === 'apply' && !user ? (
            <div className='space-y-2'>
              <Label htmlFor='relay-ban-user-search'>{t('Search users')}</Label>
              <Input
                id='relay-ban-user-search'
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('Username or user ID')}
                autoComplete='off'
              />
              <NativeSelect
                className='w-full'
                value={selectedUserId || ''}
                onChange={(event) =>
                  setSelectedUserId(Number(event.target.value))
                }
                aria-label={t('User')}
              >
                <NativeSelectOption value=''>
                  {userSearch.isFetching ? t('Loading...') : t('Select a user')}
                </NativeSelectOption>
                {(userSearch.data ?? []).map((item) => (
                  <NativeSelectOption key={item.id} value={item.id}>
                    {item.display_name || item.username} ({item.username}, #
                    {item.id})
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          ) : (
            <div className='bg-muted/50 rounded-lg px-3 py-2 text-sm'>
              <span className='font-medium'>{user?.username}</span>
              <span className='text-muted-foreground ml-2'>#{user?.id}</span>
            </div>
          )}

          {action !== 'revoke' && (
            <div className='space-y-2'>
              <Label htmlFor='relay-ban-duration'>{t('Duration')}</Label>
              <NativeSelect
                id='relay-ban-duration'
                className='w-full'
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
              >
                <NativeSelectOption value='0'>
                  {t('Permanent')}
                </NativeSelectOption>
                <NativeSelectOption value='3600'>
                  {t('1 hour')}
                </NativeSelectOption>
                <NativeSelectOption value='86400'>
                  {t('24 hours')}
                </NativeSelectOption>
                <NativeSelectOption value='604800'>
                  {t('7 days')}
                </NativeSelectOption>
                <NativeSelectOption value='2592000'>
                  {t('30 days')}
                </NativeSelectOption>
              </NativeSelect>
            </div>
          )}

          <div className='space-y-2'>
            <Label htmlFor='relay-ban-reason'>{t('Reason')}</Label>
            <Textarea
              id='relay-ban-reason'
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={t('Optional administrator note')}
              rows={3}
            />
          </div>

          {mutation.isError && (
            <p role='alert' className='text-destructive text-sm'>
              {t('Request failed')}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant='outline'
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            {t('Cancel')}
          </Button>
          <Button
            variant={action === 'revoke' ? 'destructive' : 'default'}
            onClick={() => mutation.mutate()}
            disabled={targetId <= 0 || mutation.isPending}
          >
            {mutation.isPending ? t('Loading...') : title}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
