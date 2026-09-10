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
import { useLocation } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { RichContent } from '@/components/rich-content'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import type { AnnouncementItem } from '../types'

type PublishedAnnouncement = AnnouncementItem & { revision: number }

export function AnnouncementNotice() {
  const { t } = useTranslation()
  const userId = useAuthStore((state) => state.auth.user?.id)
  const locationKey = useLocation({ select: (location) => location.href })
  const client = useQueryClient()
  const [dismissed, setDismissed] = useState('')
  const query = useQuery({
    queryKey: ['unread-announcement', userId, locationKey],
    enabled: Boolean(userId),
    staleTime: 0,
    retry: false,
    queryFn: async () => {
      const response = await api.get<{
        success: boolean
        data: PublishedAnnouncement | null
        message?: string
      }>('/api/user/announcements')
      if (!response.data.success) throw new Error(response.data.message)
      return response.data.data
    },
  })
  const acknowledge = useMutation({
    mutationFn: async (revision: number) => {
      const response = await api.post('/api/user/announcements/acknowledge', {
        revision,
      })
      if (!response.data.success) throw new Error(response.data.message)
    },
    onSuccess: (_result, revision) => {
      // Do not hide a newer notice fetched while this acknowledgement ran.
      setDismissed(`${userId}:${revision}`)
      void client.invalidateQueries({
        queryKey: ['unread-announcement', userId],
      })
    },
    onError: () => toast.error(t('Failed to save settings')),
  })
  const notice = query.data
  const noticeKey = `${userId}:${notice?.revision}`
  const open = Boolean(
    notice && query.isSuccess && !query.isFetching && dismissed !== noticeKey
  )
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setDismissed(noticeKey)
      }}
    >
      <DialogContent className='max-h-[85dvh] max-w-[calc(100vw-2rem)] gap-4 sm:max-w-xl'>
        <DialogHeader>
          <DialogTitle>{t('Latest Announcement')}</DialogTitle>
          <DialogDescription>
            {t('Latest platform updates and notices')}
          </DialogDescription>
        </DialogHeader>
        {notice ? (
          <div className='min-h-0 overflow-y-auto overscroll-contain text-sm leading-6'>
            <RichContent content={notice.content} breaks />
            {notice.extra ? (
              <p className='text-muted-foreground mt-3'>{notice.extra}</p>
            ) : null}
          </div>
        ) : null}
        <Button
          type='button'
          disabled={acknowledge.isPending}
          onClick={() => {
            if (notice) acknowledge.mutate(notice.revision)
          }}
        >
          {t('Understood, do not show again')}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
