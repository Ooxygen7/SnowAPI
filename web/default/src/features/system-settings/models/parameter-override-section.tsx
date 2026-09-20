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
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { searchChannels } from '@/features/channels/api'
import {
  ADMIN_PERMISSION_ACTIONS,
  ADMIN_PERMISSION_RESOURCES,
  hasPermission,
} from '@/lib/admin-permissions'
import { useAuthStore } from '@/stores/auth-store'

import { SettingsSection } from '../components/settings-section'
import { ParameterOverrideDialog } from './parameter-override-dialog'

export function ParameterOverrideSection() {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.auth.user)
  const canEdit =
    hasPermission(
      user,
      ADMIN_PERMISSION_RESOURCES.CHANNEL,
      ADMIN_PERMISSION_ACTIONS.SENSITIVE_WRITE
    ) &&
    hasPermission(
      user,
      ADMIN_PERMISSION_RESOURCES.CHANNEL,
      ADMIN_PERMISSION_ACTIONS.WRITE
    )
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState({ keyword: '', p: 1 })
  const [channelId, setChannelId] = useState<number | null>(null)
  const query = useQuery({
    queryKey: ['channels', 'parameter-override', user?.id, filter],
    queryFn: () =>
      searchChannels({ ...filter, page_size: 20, tag_mode: false }),
    placeholderData: keepPreviousData,
  })
  const data = query.data?.data
  const failed = query.isError || query.data?.success === false
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / 20))

  return (
    <SettingsSection title={t('Parameter Override')}>
      <p className='text-muted-foreground text-sm'>
        {t(
          'Create request parameter override rules with a visual editor or raw JSON.'
        )}
      </p>
      <form
        className='flex gap-2'
        onSubmit={(event) => {
          event.preventDefault()
          setFilter({ keyword: search.trim(), p: 1 })
        }}
      >
        <Input
          aria-label={t('Search')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('Search')}
          className='max-w-sm'
        />
        <Button type='submit' variant='outline'>
          {t('Search')}
        </Button>
      </form>
      {failed && (
        <Alert variant='destructive'>
          <AlertDescription>
            {t('Failed to load')}
            <Button variant='link' onClick={() => void query.refetch()}>
              {t('Retry')}
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {!failed && query.isPending && <Skeleton className='h-48 w-full' />}
      {!failed && !query.isPending && (
        <>
          <div className='divide-y rounded-xl border'>
            {!data?.items.length && (
              <p className='text-muted-foreground p-6 text-center text-sm'>
                {t('No channels found')}
              </p>
            )}
            {data?.items.map((channel) => (
              <div
                key={channel.id}
                className='flex items-center justify-between gap-3 p-4'
              >
                <div className='min-w-0'>
                  <p className='truncate text-sm font-medium'>{channel.name}</p>
                  <p className='text-muted-foreground text-xs'>
                    ID: {channel.id}
                  </p>
                </div>
                <Button
                  variant='outline'
                  disabled={!canEdit || query.isPlaceholderData}
                  onClick={() => setChannelId(channel.id)}
                  aria-label={`${t('Parameter Override')}: ${channel.name}`}
                >
                  {t('Edit')}
                </Button>
              </div>
            ))}
          </div>
          <div className='flex items-center justify-center gap-3'>
            <Button
              variant='outline'
              disabled={filter.p <= 1 || query.isFetching}
              onClick={() => setFilter({ ...filter, p: filter.p - 1 })}
            >
              {t('Previous')}
            </Button>
            <span className='text-muted-foreground text-sm'>
              {filter.p} / {pages}
            </span>
            <Button
              variant='outline'
              disabled={filter.p >= pages || query.isFetching}
              onClick={() => setFilter({ ...filter, p: filter.p + 1 })}
            >
              {t('Next')}
            </Button>
          </div>
        </>
      )}
      {!canEdit && (
        <p className='text-muted-foreground text-sm'>
          {t('No permission to perform this action')}
        </p>
      )}
      {channelId !== null && (
        <ParameterOverrideDialog
          key={channelId}
          channelId={channelId}
          onClose={() => setChannelId(null)}
        />
      )}
    </SettingsSection>
  )
}
