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
import { ArrowUpRight, CalendarClock, TimerReset } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SnowEventDialog } from '@/components/layout/components/snow-event-card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  findHighestActiveSubscription,
  getSnowEventTier,
} from '@/features/subscriptions/snow-event-plans'
import { useSubscriptionOverview } from '@/features/subscriptions/use-subscription-overview'

function getUsagePercentage(used: number, total: number): number {
  if (total <= 0) return 0
  return Math.min(100, Math.max(0, (used / total) * 100))
}

function normalizeLocale(language: string): string | undefined {
  if (/^zhcn$/i.test(language)) return 'zh-CN'
  if (/^zhtw$/i.test(language)) return 'zh-TW'
  const candidate = language.replace('_', '-')
  try {
    return Intl.DateTimeFormat.supportedLocalesOf([candidate])[0]
  } catch {
    return undefined
  }
}

function formatLocalTime(timestamp: number | undefined, language: string) {
  if (!timestamp || timestamp <= 0) return null
  return new Intl.DateTimeFormat(normalizeLocale(language), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp * 1000))
}

export function MySubscriptionCard() {
  const { t, i18n } = useTranslation()
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const overviewQuery = useSubscriptionOverview()
  const active = findHighestActiveSubscription(
    overviewQuery.data?.plans ?? [],
    overviewQuery.data?.activeSubscriptions ?? []
  )

  if (!overviewQuery.isSuccess || !active.record) return null

  const subscription = active.record.subscription
  const fiveHourWindow = active.record.five_hour_window
  const fiveHourTotal = Number(
    fiveHourWindow?.amount_total ?? subscription.five_hour_quota ?? 0
  )
  const fiveHourUsed = Number(fiveHourWindow?.amount_used ?? 0)
  const periodTotal = Number(subscription.amount_total ?? 0)
  const periodUsed = Number(subscription.amount_used ?? 0)
  const fiveHourPercentage = getUsagePercentage(fiveHourUsed, fiveHourTotal)
  const periodPercentage = getUsagePercentage(periodUsed, periodTotal)
  const fiveHourReset = formatLocalTime(
    fiveHourWindow?.end_time,
    i18n.resolvedLanguage ?? i18n.language
  )
  const periodReset = formatLocalTime(
    subscription.next_reset_time,
    i18n.resolvedLanguage ?? i18n.language
  )
  const expiresAt = formatLocalTime(
    subscription.end_time,
    i18n.resolvedLanguage ?? i18n.language
  )
  const canUpgrade = !active.plan || getSnowEventTier(active.plan) !== 'storm'

  return (
    <>
      <section
        className='snowapi-my-subscription order-2 md:order-none'
        aria-labelledby='my-plan'
      >
        <div className='snowapi-my-subscription-header'>
          <div>
            <p className='snowapi-my-subscription-eyebrow'>
              {t('My subscription')}
            </p>
            <h2 id='my-plan' className='snowapi-my-subscription-title'>
              {active.plan?.plan.title ?? t('Subscription')}
            </h2>
          </div>
          {canUpgrade ? (
            <Button
              type='button'
              className='snowapi-my-subscription-upgrade rounded-full'
              onClick={() => setUpgradeOpen(true)}
            >
              {t('Upgrade plan')}
              <ArrowUpRight className='size-4' aria-hidden='true' />
            </Button>
          ) : null}
        </div>

        <div className='snowapi-my-subscription-usage'>
          <div className='snowapi-my-subscription-meter'>
            <div className='flex items-center justify-between gap-4'>
              <span>{t('5-hour usage')}</span>
              <strong>{fiveHourPercentage.toFixed(3)}%</strong>
            </div>
            <Progress
              value={fiveHourPercentage}
              aria-label={t('5-hour usage')}
              className='snowapi-subscription-progress'
            />
          </div>
          <div className='snowapi-my-subscription-meter'>
            <div className='flex items-center justify-between gap-4'>
              <span>{t('Period usage')}</span>
              <strong>{periodPercentage.toFixed(3)}%</strong>
            </div>
            <Progress
              value={periodPercentage}
              aria-label={t('Period usage')}
              className='snowapi-subscription-progress'
            />
          </div>
        </div>

        <dl className='snowapi-my-subscription-times'>
          <div>
            <TimerReset className='size-4' aria-hidden='true' />
            <dt>{t('5-hour limit resets')}</dt>
            <dd>{fiveHourReset ?? t('Starts after first request')}</dd>
          </div>
          <div>
            <TimerReset className='size-4' aria-hidden='true' />
            <dt>{t('Period limit resets')}</dt>
            <dd>{periodReset ?? t('No scheduled reset')}</dd>
          </div>
          <div>
            <CalendarClock className='size-4' aria-hidden='true' />
            <dt>{t('Plan expires')}</dt>
            <dd>{expiresAt ?? t('No scheduled expiration')}</dd>
          </div>
        </dl>
      </section>

      <SnowEventDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} />
    </>
  )
}
