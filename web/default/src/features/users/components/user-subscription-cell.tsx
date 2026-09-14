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
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatQuota, formatTimestamp } from '@/lib/format'

import type { AdminSubscriptionState, User } from '../types'
import { useUsers } from './users-provider'

export function SubscriptionFacts(props: {
  subscription: AdminSubscriptionState
}) {
  const { t } = useTranslation()
  const sub = props.subscription
  // eslint-disable-next-line react-hooks/purity
  const remainingHours = Math.max(
    0,
    Math.ceil((sub.end_time - Date.now() / 1000) / 3600)
  )
  const paid = sub.source === 'order' || sub.source === 'balance'
  return (
    <div className='min-w-0 space-y-1.5 text-xs'>
      <div className='flex flex-wrap items-center gap-1.5'>
        <Badge variant='secondary'>{sub.plan_title}</Badge>
        <span className='text-muted-foreground'>
          {paid
            ? t('Paid subscription')
            : t(
                sub.source === 'redemption'
                  ? 'Redeemed subscription'
                  : 'Admin assigned'
              )}
        </span>
      </div>
      <dl className='grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 tabular-nums'>
        <dt className='text-muted-foreground'>{t('5-hour balance')}</dt>
        <dd>
          {sub.five_hour_total > 0
            ? formatQuota(sub.five_hour_remaining)
            : t('Unlimited')}
        </dd>
        <dt className='text-muted-foreground'>{t('Period balance')}</dt>
        <dd>
          {sub.period_total > 0
            ? formatQuota(sub.period_remaining)
            : t('Unlimited')}
        </dd>
        <dt className='text-muted-foreground'>{t('Time remaining')}</dt>
        <dd title={formatTimestamp(sub.end_time)}>
          {t('{{days}}d {{hours}}h', {
            days: Math.floor(remainingHours / 24),
            hours: remainingHours % 24,
          })}
        </dd>
      </dl>
    </div>
  )
}

export function UserSubscriptionCell(props: { user: User }) {
  const { t } = useTranslation()
  const { setOpen, setCurrentRow } = useUsers()
  return (
    <div className='min-w-44 space-y-2'>
      {props.user.subscription ? (
        <SubscriptionFacts subscription={props.user.subscription} />
      ) : (
        <Badge variant='outline'>Free</Badge>
      )}
      <Button
        variant='link'
        size='sm'
        className='h-auto p-0 text-xs'
        onClick={() => {
          setCurrentRow(props.user)
          setOpen('subscription')
        }}
      >
        {t('Manage subscription')}
      </Button>
    </div>
  )
}
