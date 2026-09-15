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
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
  PackageIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { TFunction } from 'i18next'
import {
  Crown,
  Gauge,
  KeyRound,
  Package,
  ShieldCheck,
  Sparkles,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'

import { SnowApiLogoMark } from '@/components/snowapi-logo-mark'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Spinner } from '@/components/ui/spinner'
import { SubscriptionPurchaseDialog } from '@/features/subscriptions/components/dialogs/subscription-purchase-dialog'
import {
  compareSnowEventPlans,
  findHighestActiveSubscription,
  getSnowEventTier,
  type SnowEventTier,
} from '@/features/subscriptions/snow-event-plans'
import type { PlanRecord } from '@/features/subscriptions/types'
import {
  subscriptionOverviewQueryKey,
  useSubscriptionOverview,
} from '@/features/subscriptions/use-subscription-overview'
import { useIsMobile } from '@/hooks/use-mobile'
import { getSelf } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

import { SnowEventAurora } from './snow-event-aurora'

type SnowEventUpgradeDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type SelfSummary = {
  quota?: number
}

type SnowEventFeature = {
  icon: LucideIcon
  label: string
}

type SnowEventFeatureKind =
  | 'early-access'
  | 'model-access'
  | 'priority'
  | 'request-limits'
  | 'support'
  | 'usage'
  | 'velocity'

const snowEventFeatureIcons: Record<SnowEventFeatureKind, LucideIcon> = {
  'early-access': Sparkles,
  'model-access': KeyRound,
  priority: Crown,
  'request-limits': Gauge,
  support: ShieldCheck,
  usage: Package,
  velocity: Zap,
}

function feature(kind: SnowEventFeatureKind, label: string): SnowEventFeature {
  return { icon: snowEventFeatureIcons[kind], label }
}

function getSnowEventFeatures(
  tier: SnowEventTier,
  t: TFunction
): SnowEventFeature[] {
  switch (tier) {
    case 'light':
      return [
        feature('request-limits', t('Relaxed request limits')),
        feature('usage', t('Usage included for each plan period')),
        feature('model-access', t('Unlock access to selected models')),
      ]
    case 'moderate':
      return [
        feature('request-limits', t('More relaxed request limits')),
        feature('usage', t('Twice the usage of Light')),
        feature('model-access', t('Unlock access to more models')),
        feature('velocity', t('Access high-speed channels')),
      ]
    case 'heavy':
      return [
        feature('request-limits', t('Most relaxed request limits')),
        feature('usage', t('More than twice the usage of Moderate')),
        feature('model-access', t('Unlock access to all models')),
        feature('velocity', t('More high-speed channel calls')),
        feature('priority', t('Priority responses')),
        feature('early-access', t('Early access to new content')),
      ]
    case 'storm':
      return [
        feature('request-limits', t('Most relaxed request limits')),
        feature('usage', t('More than three times the usage of Heavy')),
        feature('model-access', t('Unlock access to all models')),
        feature('velocity', t('Unlimited high-speed channel calls')),
        feature('priority', t('Priority responses')),
        feature('early-access', t('Early access to new content')),
        feature('support', t('Dedicated customer support')),
      ]
    default:
      return [
        feature('request-limits', t('Flexible request limits')),
        feature('usage', t('Usage included for each plan period')),
        feature('model-access', t('Model access based on your plan')),
      ]
  }
}

export function SnowEventUpgradeDialog(props: SnowEventUpgradeDialogProps) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const queryClient = useQueryClient()
  const overviewQuery = useSubscriptionOverview(props.open)
  const [selectedPlan, setSelectedPlan] = useState<PlanRecord | null>(null)
  const [purchaseOpen, setPurchaseOpen] = useState(false)
  const [mobilePlanIndex, setMobilePlanIndex] = useState(0)

  const selfQuery = useQuery({
    queryKey: ['snow-event-user'],
    enabled: props.open,
    staleTime: 30 * 1000,
    queryFn: async () => {
      const response = await getSelf()
      if (!response.success) {
        throw new Error(response.message || 'Failed to load user')
      }
      return (response.data ?? {}) as SelfSummary
    },
  })

  const orderedPlans = useMemo(
    () => [...(overviewQuery.data?.plans ?? [])].sort(compareSnowEventPlans),
    [overviewQuery.data?.plans]
  )
  const activeSubscription = useMemo(
    () =>
      findHighestActiveSubscription(
        overviewQuery.data?.plans ?? [],
        overviewQuery.data?.activeSubscriptions ?? []
      ),
    [overviewQuery.data]
  )
  const currentPlanIndex = activeSubscription.plan
    ? orderedPlans.findIndex(
        (record) => record.plan.id === activeSubscription.plan?.plan.id
      )
    : -1
  const purchaseCounts = useMemo(() => {
    const counts = new Map<number, number>()
    for (const record of overviewQuery.data?.allSubscriptions ?? []) {
      const planId = record.subscription.plan_id
      counts.set(planId, (counts.get(planId) ?? 0) + 1)
    }
    return counts
  }, [overviewQuery.data?.allSubscriptions])

  useEffect(() => {
    if (!props.open || orderedPlans.length === 0) return
    const index = currentPlanIndex >= 0 ? currentPlanIndex : 0
    setMobilePlanIndex(index)
  }, [currentPlanIndex, orderedPlans, props.open])

  const selectMobilePlan = (index: number) => {
    const record = orderedPlans[index]
    if (!record) return
    setMobilePlanIndex(index)
  }

  const refresh = async () => {
    const selfResponse = await getSelf().catch(() => null)
    if (selfResponse?.success && selfResponse.data) {
      useAuthStore.getState().auth.setUser(selfResponse.data)
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: subscriptionOverviewQueryKey }),
      queryClient.invalidateQueries({ queryKey: ['snow-event-user'] }),
      queryClient.invalidateQueries({ queryKey: ['model-catalog'] }),
      queryClient.invalidateQueries({ queryKey: ['user-models'] }),
      queryClient.invalidateQueries({ queryKey: ['user-models-ccswitch'] }),
      queryClient.invalidateQueries({ queryKey: ['user-groups'] }),
    ])
  }

  const isLoading = overviewQuery.isLoading || selfQuery.isLoading
  const isError = overviewQuery.isError || selfQuery.isError

  return (
    <>
      <Dialog open={props.open} onOpenChange={props.onOpenChange}>
        <DialogContent
          showCloseButton={false}
          overlayClassName='bg-black/70 backdrop-blur-sm'
          className='snowapi-upgrade-dialog inset-0 block max-w-none translate-x-0 translate-y-0 overflow-x-hidden overflow-y-auto rounded-none p-0 ring-0 sm:max-w-none'
        >
          <DialogHeader className='sr-only'>
            <DialogTitle>SnowEvent</DialogTitle>
            <DialogDescription>
              {t('Unlock higher privileges')}
            </DialogDescription>
          </DialogHeader>

          <SnowEventAurora />

          <Button
            type='button'
            variant='ghost'
            size='icon-lg'
            className='snowapi-upgrade-close fixed top-4 right-4 z-20 size-10 rounded-full'
            aria-label={t('Close')}
            onClick={() => props.onOpenChange(false)}
          >
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2.4} />
          </Button>

          <main className='snowapi-upgrade-main relative z-10 mx-auto flex min-h-full w-full max-w-[92rem] flex-col justify-center px-0 py-8 sm:px-8 sm:py-16 lg:px-12 lg:py-10'>
            <div className='snowapi-upgrade-layout flex w-full flex-col'>
              <header className='flex shrink-0 flex-col items-center px-5 text-center sm:px-0'>
                <div className='flex items-center gap-3'>
                  <SnowApiLogoMark className='snowapi-upgrade-logo' />
                  <h1 className='text-3xl font-semibold tracking-[-0.045em] sm:text-4xl'>
                    SnowEvent
                  </h1>
                </div>
                <p className='text-muted-foreground mt-2 text-sm font-medium'>
                  {t('Unlock higher privileges')}
                </p>
              </header>

              <section className='snowapi-upgrade-plans mt-6 flex min-h-0 flex-col items-center justify-center sm:mt-10 sm:min-h-[24rem]'>
                {isLoading ? (
                  <div className='flex min-h-[24rem] items-center justify-center'>
                    <Spinner className='size-6' />
                  </div>
                ) : null}

                {isError ? (
                  <Empty className='min-h-[24rem] border-0'>
                    <EmptyHeader>
                      <EmptyMedia variant='icon'>
                        <HugeiconsIcon icon={PackageIcon} strokeWidth={1.8} />
                      </EmptyMedia>
                      <EmptyTitle>{t('Request failed')}</EmptyTitle>
                      <EmptyDescription>
                        {t('Please try again later.')}
                      </EmptyDescription>
                    </EmptyHeader>
                    <EmptyContent>
                      <Button
                        variant='outline'
                        onClick={() => void overviewQuery.refetch()}
                      >
                        {t('Refresh')}
                      </Button>
                    </EmptyContent>
                  </Empty>
                ) : null}

                {overviewQuery.data && orderedPlans.length === 0 ? (
                  <Empty className='min-h-[24rem] border-0'>
                    <EmptyHeader>
                      <EmptyMedia variant='icon'>
                        <HugeiconsIcon icon={PackageIcon} strokeWidth={1.8} />
                      </EmptyMedia>
                      <EmptyTitle>{t('No subscription plans yet')}</EmptyTitle>
                      <EmptyDescription>
                        {t('Subscribe to a plan for model access')}
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : null}

                {overviewQuery.data && orderedPlans.length > 0 ? (
                  <div className='flex w-full flex-col items-center gap-4'>
                    <div className='snowapi-upgrade-plan-viewport w-full'>
                      <div className='snowapi-upgrade-plan-clip w-full overflow-hidden md:overflow-visible'>
                        <div
                          className='snowapi-upgrade-plan-grid grid w-full grid-cols-1 place-items-center gap-4 md:grid-cols-2 md:place-items-stretch xl:grid-cols-4'
                          style={
                            isMobile
                              ? ({
                                  '--snowapi-mobile-plan-offset': `${mobilePlanIndex * -100}%`,
                                } as CSSProperties)
                              : undefined
                          }
                        >
                          {orderedPlans.map((record, index) => {
                            const plan = record.plan
                            const tier = getSnowEventTier(record)
                            const current = index === currentPlanIndex
                            const higherSubscriptionActive =
                              currentPlanIndex >= 0 && index < currentPlanIndex
                            const limitReached =
                              plan.max_purchase_per_user > 0 &&
                              (purchaseCounts.get(plan.id) ?? 0) >=
                                plan.max_purchase_per_user
                            const disabled =
                              current ||
                              higherSubscriptionActive ||
                              limitReached
                            const features = getSnowEventFeatures(tier, t)
                            let actionLabel = t('Upgrade')
                            if (current) actionLabel = t('Current subscription')
                            if (higherSubscriptionActive) {
                              actionLabel = t('Higher subscription active')
                            }

                            return (
                              <div
                                key={plan.id}
                                className='snowapi-upgrade-plan-slide'
                                aria-hidden={
                                  isMobile && index !== mobilePlanIndex
                                }
                              >
                                <article
                                  data-snow-active={
                                    isMobile && index === mobilePlanIndex
                                  }
                                  className='snowapi-upgrade-plan-card flex min-h-[29rem] w-full max-w-[22rem] flex-col rounded-[1.25rem] p-5 sm:p-6 md:max-w-none'
                                >
                                  <h2 className='text-base font-semibold'>
                                    {plan.title}
                                  </h2>
                                  <div className='mt-3 flex items-end gap-1.5'>
                                    <span className='text-3xl font-semibold tracking-tight'>
                                      {plan.currency === 'USD' ? '$' : ''}
                                      {Number(plan.price_amount || 0).toFixed(
                                        2
                                      )}
                                    </span>
                                    <span className='text-muted-foreground pb-1 text-xs'>
                                      {plan.currency}
                                    </span>
                                  </div>
                                  <Button
                                    className={cn(
                                      'mt-6 w-full rounded-full',
                                      disabled && 'disabled:opacity-55'
                                    )}
                                    disabled={
                                      disabled ||
                                      (isMobile && index !== mobilePlanIndex)
                                    }
                                    onClick={() => {
                                      setSelectedPlan(record)
                                      setPurchaseOpen(true)
                                    }}
                                  >
                                    {actionLabel}
                                  </Button>
                                  <ul className='mt-5 flex flex-col gap-3.5 border-t pt-5'>
                                    {features.map((feature) => (
                                      <li
                                        key={feature.label}
                                        className='flex items-start gap-3 text-xs leading-5'
                                      >
                                        <span className='bg-muted mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full'>
                                          <feature.icon
                                            className='size-3'
                                            aria-hidden='true'
                                          />
                                        </span>
                                        <span>{feature.label}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </article>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </div>

                    {isMobile && orderedPlans.length > 1 ? (
                      <nav
                        className='snowapi-upgrade-mobile-pager'
                        aria-label='SnowEvent'
                      >
                        <Button
                          type='button'
                          variant='outline'
                          size='icon-lg'
                          className='rounded-full'
                          aria-label={t('Previous')}
                          disabled={mobilePlanIndex === 0}
                          onClick={() => selectMobilePlan(mobilePlanIndex - 1)}
                        >
                          <HugeiconsIcon
                            icon={ArrowLeft01Icon}
                            strokeWidth={2}
                            data-icon='inline-start'
                          />
                        </Button>

                        <div className='snowapi-upgrade-page-dots'>
                          {orderedPlans.map((record, index) => (
                            <button
                              key={record.plan.id}
                              type='button'
                              className='snowapi-upgrade-page-dot'
                              data-active={mobilePlanIndex === index}
                              aria-current={
                                mobilePlanIndex === index ? 'page' : undefined
                              }
                              aria-label={record.plan.title}
                              onClick={() => selectMobilePlan(index)}
                            />
                          ))}
                        </div>

                        <Button
                          type='button'
                          variant='outline'
                          size='icon-lg'
                          className='rounded-full'
                          aria-label={t('Next')}
                          disabled={mobilePlanIndex === orderedPlans.length - 1}
                          onClick={() => selectMobilePlan(mobilePlanIndex + 1)}
                        >
                          <HugeiconsIcon
                            icon={ArrowRight01Icon}
                            strokeWidth={2}
                            data-icon='inline-end'
                          />
                        </Button>
                      </nav>
                    ) : null}
                  </div>
                ) : null}
              </section>
            </div>
          </main>
        </DialogContent>
      </Dialog>

      <SubscriptionPurchaseDialog
        open={purchaseOpen}
        onOpenChange={setPurchaseOpen}
        plan={selectedPlan}
        appearance='snow-event'
        purchaseLimit={selectedPlan?.plan.max_purchase_per_user}
        purchaseCount={
          selectedPlan ? (purchaseCounts.get(selectedPlan.plan.id) ?? 0) : 0
        }
        userQuota={selfQuery.data?.quota}
        onPurchaseSuccess={() => {
          props.onOpenChange(false)
          return refresh()
        }}
      />
    </>
  )
}
