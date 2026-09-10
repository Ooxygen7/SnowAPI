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
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ContentLoading, ContentReveal } from '@/components/content-loading'
import { RichContent } from '@/components/rich-content'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useAnnouncements } from '@/features/dashboard/hooks/use-status-data'
import { getPreviewText } from '@/features/dashboard/lib'
import type { AnnouncementItem } from '@/features/dashboard/types'
import { formatDateTimeObject } from '@/lib/time'

function getPublishTimestamp(announcement: AnnouncementItem): number {
  if (!announcement.publishDate) return 0
  const timestamp = Date.parse(announcement.publishDate)
  return Number.isFinite(timestamp) ? timestamp : 0
}

function AnnouncementTime(props: { announcement: AnnouncementItem }) {
  const timestamp = getPublishTimestamp(props.announcement)
  if (!timestamp) return null

  return (
    <time
      className='text-muted-foreground text-xs tabular-nums'
      dateTime={props.announcement.publishDate}
    >
      {formatDateTimeObject(new Date(timestamp))}
    </time>
  )
}

function AllAnnouncementsDialog(props: {
  announcements: AnnouncementItem[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className='max-h-[min(82vh,720px)] gap-0 overflow-hidden p-0 sm:max-w-2xl'>
        <DialogHeader className='px-5 pt-5 pr-14 pb-4'>
          <DialogTitle>{t('All Announcements')}</DialogTitle>
          <DialogDescription>
            {t('Latest platform updates and notices')}
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className='max-h-[min(68vh,580px)] px-5 pb-5'>
          <div className='flex flex-col gap-3'>
            {props.announcements.map((announcement, index) => (
              <article
                key={announcement.id ?? `${announcement.publishDate}-${index}`}
                className='bg-muted/70 flex flex-col gap-3 rounded-[10px] p-4'
              >
                <div className='flex items-center justify-between gap-3'>
                  <span className='text-sm font-medium'>
                    {index === 0
                      ? t('Latest Announcement')
                      : t('Announcements')}
                  </span>
                  <AnnouncementTime announcement={announcement} />
                </div>
                <RichContent
                  breaks
                  content={announcement.content}
                  className='text-sm leading-6'
                />
                {announcement.extra ? (
                  <p className='bg-background/70 text-muted-foreground rounded-lg px-3 py-2 text-xs leading-5'>
                    {announcement.extra}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

export function AnnouncementsPanel() {
  const { t } = useTranslation()
  const { items, loading, enabled } = useAnnouncements()
  const [showAll, setShowAll] = useState(false)
  const announcements = useMemo(
    () =>
      [...items]
        .filter((announcement) => announcement.content?.trim())
        .sort(
          (left, right) =>
            (right.revision ?? getPublishTimestamp(right)) -
            (left.revision ?? getPublishTimestamp(left))
        ),
    [items]
  )
  const latest = announcements[0]

  if (!loading && !enabled) return null

  return (
    <>
      <section
        className='snowapi-rainflow-panel overflow-hidden p-4 sm:p-5'
        aria-labelledby='overview-announcements-title'
      >
        <div className='flex items-start justify-between gap-3'>
          <div className='min-w-0'>
            <h2
              id='overview-announcements-title'
              className='text-sm font-medium'
            >
              {t('Announcements')}
            </h2>
            <p className='text-muted-foreground mt-0.5 text-xs'>
              {t('Latest platform updates and notices')}
            </p>
          </div>
          {latest ? (
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() => setShowAll(true)}
            >
              {t('All Announcements')}
            </Button>
          ) : null}
        </div>

        {loading ? (
          <ContentLoading className='min-h-24' />
        ) : (
          <ContentReveal className='mt-4'>
            {latest ? (
              <div className='bg-background/70 flex flex-col gap-2 rounded-[10px] p-4'>
                <div className='flex flex-wrap items-center justify-between gap-2'>
                  <span className='text-xs font-medium'>
                    {t('Latest Announcement')}
                  </span>
                  <AnnouncementTime announcement={latest} />
                </div>
                <p className='line-clamp-3 text-sm leading-6'>
                  {getPreviewText(latest.content, 260)}
                </p>
              </div>
            ) : (
              <p className='text-muted-foreground bg-background/70 rounded-[10px] px-4 py-5 text-sm'>
                {t('No announcements at this time')}
              </p>
            )}
          </ContentReveal>
        )}
      </section>

      <AllAnnouncementsDialog
        announcements={announcements}
        open={showAll}
        onOpenChange={setShowAll}
      />
    </>
  )
}
