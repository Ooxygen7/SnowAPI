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

import { useQuery } from '@tanstack/react-query'
import { CalendarClock, Crown, Package } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { GroupBadge } from '@/components/group-badge'
import { SnowApiLogoMark } from '@/components/snowapi-logo-mark'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { formatQuota } from '@/lib/format'

import { getSubscriptionBalanceQuote, paySubscriptionBalance } from '../../api'
import { formatDuration, formatResetPeriod } from '../../lib'
import { getSnowEventTier } from '../../snow-event-plans'
import { useSubscriptionRevealStore } from '../../subscription-reveal-store'
import type { PlanRecord } from '../../types'

interface Props {
  appearance?: 'default' | 'snow-event'
  open: boolean
  onOpenChange: (open: boolean) => void
  plan: PlanRecord | null
  purchaseLimit?: number
  purchaseCount?: number
  userQuota?: number
  onPurchaseSuccess?: () => void | Promise<void>
}

export function SubscriptionPurchaseDialog(props: Props) {
  const { t } = useTranslation()
  const [paying, setPaying] = useState(false)
  const planId = props.plan?.plan.id ?? 0
  const quoteQuery = useQuery({
    queryKey: ['subscription-balance-quote', planId],
    enabled: props.open && planId > 0,
    staleTime: 0,
    queryFn: async () => {
      const response = await getSubscriptionBalanceQuote(planId)
      if (!response.success || !response.data) {
        throw new Error(response.message)
      }
      return response.data
    },
  })

  const plan = props.plan?.plan
  if (!plan) return null

  const isSnowEvent = props.appearance === 'snow-event'
  const price = quoteQuery.data
    ? Number(quoteQuery.data.amount_due || 0).toFixed(2)
    : '—'
  const balanceCost = Math.max(0, Number(quoteQuery.data?.required_quota || 0))
  const userQuota = Math.max(0, Number(props.userQuota || 0))
  const allowBalancePay = plan.allow_balance_pay !== false
  const quoteUnavailable = !quoteQuery.isSuccess || !quoteQuery.data
  const insufficientBalance = !quoteUnavailable && userQuota < balanceCost
  const limitReached =
    (props.purchaseLimit || 0) > 0 &&
    (props.purchaseCount || 0) >= (props.purchaseLimit || 0)

  const handlePayBalance = async () => {
    if (!allowBalancePay) {
      toast.error(t('This plan does not allow balance redemption'))
      return
    }
    setPaying(true)
    try {
      const res = await paySubscriptionBalance({ plan_id: plan.id })
      if (res.success) {
        props.onOpenChange(false)
        useSubscriptionRevealStore
          .getState()
          .show(plan.title, getSnowEventTier({ plan }))
        // A refresh failure does not undo a successful purchase.
        try {
          await props.onPurchaseSuccess?.()
        } catch {
          // The purchase is final even if refreshing the local view fails.
        }
      } else {
        toast.error(
          res.message && res.message !== 'success'
            ? res.message
            : t('Payment request failed')
        )
      }
    } catch {
      toast.error(t('Payment request failed'))
    } finally {
      setPaying(false)
    }
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={
        <>
          {isSnowEvent ? (
            <SnowApiLogoMark className='size-5 dark:invert' />
          ) : (
            <Crown className='size-5' />
          )}
          {t('Purchase Subscription')}
        </>
      }
      contentClassName='max-sm:w-[calc(100vw-1.5rem)] sm:max-w-md'
      titleClassName='flex items-center gap-2'
      contentHeight='auto'
      bodyClassName='space-y-4'
    >
      <div className='space-y-3 sm:space-y-4'>
        <div className='bg-muted/50 space-y-2.5 rounded-lg border p-3 sm:space-y-3 sm:p-4'>
          <div className='flex justify-between'>
            <span className='text-muted-foreground text-sm'>
              {t('Plan Name')}
            </span>
            <span className='max-w-[200px] truncate text-sm font-medium'>
              {plan.title}
            </span>
          </div>
          <div className='flex items-center justify-between'>
            <span className='text-muted-foreground text-sm'>
              {t('Validity Period')}
            </span>
            <span className='flex items-center gap-1 text-sm'>
              <CalendarClock className='h-3.5 w-3.5' />
              {formatDuration(plan, t)}
            </span>
          </div>
          {formatResetPeriod(plan, t) !== t('No Reset') && (
            <div className='flex justify-between'>
              <span className='text-muted-foreground text-sm'>
                {t('Reset Period')}
              </span>
              <span className='text-sm'>{formatResetPeriod(plan, t)}</span>
            </div>
          )}
          {!isSnowEvent ? (
            <>
              <div className='flex items-center justify-between'>
                <span className='text-muted-foreground text-sm'>
                  {t('Plan Quota')}
                </span>
                <span className='flex items-center gap-1 text-sm'>
                  <Package className='h-3.5 w-3.5' />
                  {Number(plan.total_amount || 0) > 0
                    ? formatQuota(Number(plan.total_amount))
                    : t('Unlimited')}
                </span>
              </div>
              {plan.upgrade_group ? (
                <div className='flex items-center justify-between'>
                  <span className='text-muted-foreground text-sm'>
                    {t('Upgrade Group')}
                  </span>
                  <GroupBadge group={plan.upgrade_group} />
                </div>
              ) : null}
            </>
          ) : null}
          <Separator />
          <div className='flex items-center justify-between'>
            <span className='text-sm font-medium'>{t('Amount Due')}</span>
            <span className='text-primary text-lg font-bold'>${price}</span>
          </div>
        </div>

        {limitReached && (
          <Alert variant='destructive'>
            <AlertDescription>
              {t('Purchase limit reached')} ({props.purchaseCount}/
              {props.purchaseLimit})
            </AlertDescription>
          </Alert>
        )}

        <div className='flex flex-col gap-2 rounded-md border p-3'>
          <div className='flex items-center justify-between gap-2 text-xs'>
            <span className='text-muted-foreground'>{t('Required')}</span>
            <span>{quoteUnavailable ? '—' : formatQuota(balanceCost)}</span>
          </div>
          <div className='flex items-center justify-between gap-2 text-xs'>
            <span className='text-muted-foreground'>{t('Available')}</span>
            <span>{formatQuota(userQuota)}</span>
          </div>
          {!allowBalancePay ? (
            <Alert variant='destructive'>
              <AlertDescription>
                {t('This plan does not allow balance redemption')}
              </AlertDescription>
            </Alert>
          ) : (
            insufficientBalance && (
              <Alert variant='destructive'>
                <AlertDescription>{t('Insufficient balance')}</AlertDescription>
              </Alert>
            )
          )}
          <Button
            variant='outline'
            onClick={handlePayBalance}
            disabled={
              paying ||
              limitReached ||
              !allowBalancePay ||
              quoteUnavailable ||
              insufficientBalance
            }
          >
            {t('Pay with Balance')}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
