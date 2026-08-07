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
import { Cancel01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { lazy, Suspense, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  findHighestActiveSubscription,
  getSnowEventTier,
} from '@/features/subscriptions/snow-event-plans'
import { useSubscriptionOverview } from '@/features/subscriptions/use-subscription-overview'

const SnowEventUpgradeDialog = lazy(async () => {
  const module = await import('./snow-event-upgrade-dialog')
  return { default: module.SnowEventUpgradeDialog }
})

const snowParticles = Array.from({ length: 9 }, (_, index) => index)

function SnowEventSnow() {
  return (
    <span className='snowapi-event-snow' aria-hidden='true'>
      {snowParticles.map((particle) => (
        <span key={particle} />
      ))}
    </span>
  )
}

export function SnowEventDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [hasOpened, setHasOpened] = useState(props.open)

  useEffect(() => {
    if (props.open) setHasOpened(true)
  }, [props.open])

  if (!hasOpened) return null

  return (
    <Suspense fallback={null}>
      <SnowEventUpgradeDialog
        open={props.open}
        onOpenChange={props.onOpenChange}
      />
    </Suspense>
  )
}

export function SnowEventCard() {
  const { t } = useTranslation()
  const overviewQuery = useSubscriptionOverview()
  const [isVisible, setIsVisible] = useState(true)
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const highestActiveSubscription = findHighestActiveSubscription(
    overviewQuery.data?.plans ?? [],
    overviewQuery.data?.activeSubscriptions ?? []
  )
  const hasStormSubscription = highestActiveSubscription.plan
    ? getSnowEventTier(highestActiveSubscription.plan) === 'storm'
    : false
  const shouldShow =
    isVisible && overviewQuery.isSuccess && !hasStormSubscription

  return (
    <>
      {shouldShow ? (
        <aside className='snowapi-event-card' aria-label='SnowEvent'>
          <SnowEventSnow />

          <Button
            type='button'
            variant='ghost'
            size='icon-xs'
            className='snowapi-event-dismiss'
            aria-label={t('Close SnowEvent')}
            onClick={() => setIsVisible(false)}
          >
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
          </Button>

          <div className='snowapi-event-copy'>
            <p className='snowapi-event-name'>SnowEvent</p>
            <p className='snowapi-event-description'>
              {t('Unlock higher privileges')}
            </p>
          </div>

          <Button
            type='button'
            className='snowapi-event-upgrade'
            onClick={() => setUpgradeOpen(true)}
          >
            {t('Upgrade')}
          </Button>
        </aside>
      ) : null}

      <SnowEventDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} />
    </>
  )
}

export function SnowEventMobileCard(props: { onActivate: () => void }) {
  const { t } = useTranslation()

  return (
    <button
      type='button'
      className='snowapi-mobile-event-card'
      aria-label={`${t('Upgrade')} SnowEvent`}
      onClick={props.onActivate}
    >
      <SnowEventSnow />
      <span className='snowapi-event-copy'>
        <span className='snowapi-event-name'>SnowEvent</span>
        <span className='snowapi-event-description'>
          {t('Unlock higher privileges')}
        </span>
      </span>
      <span className='snowapi-mobile-event-upgrade'>{t('Upgrade')}</span>
    </button>
  )
}
