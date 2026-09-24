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
import { ArrowLeft, Check, CreditCard, Wallet } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SlideCommit } from '@/components/slide-commit'
import { SnowApiLogoMark } from '@/components/snowapi-logo-mark'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { toIntlLocale } from '@/i18n/languages'
import { appPath } from '@/lib/deployment-mode'
import { formatQuota } from '@/lib/format'
import { useAuthStore } from '@/stores/auth-store'

import { getSubscriptionCheckout } from '../../checkout-api'
import { formatDuration } from '../../lib'
import { getSnowEventTier } from '../../snow-event-plans'
import { useSubscriptionRevealStore } from '../../subscription-reveal-store'
import type { PlanRecord } from '../../types'
import { useSubscriptionCheckoutPayment } from './subscription-checkout-payment'

import '@/styles/subscription-checkout.css'

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
  const userId = useAuthStore((state) => state.auth.user?.id)
  if (!props.open || !props.plan || !userId) return null
  return (
    <SubscriptionCheckout
      key={`${userId}:${props.plan.plan.id}`}
      {...props}
      plan={props.plan}
      userId={userId}
    />
  )
}

function SubscriptionCheckout(
  props: Props & { plan: PlanRecord; userId: number }
) {
  const { t, i18n } = useTranslation()
  const username = useAuthStore((state) => state.auth.user?.username)
  const plan = props.plan.plan
  const [selected, setSelected] = useState('balance')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    []
  )
  const checkout = useQuery({
    queryKey: ['subscription-checkout', props.userId, plan.id],
    queryFn: () => getSubscriptionCheckout(plan.id),
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  })
  const payment = useSubscriptionCheckoutPayment(plan.id, props.userId)
  const methods = checkout.data?.payment_methods ?? []
  const method = methods.find((item) => item.type === selected) ?? null
  const quote = checkout.data?.quote
  const balance = Math.max(0, props.userQuota ?? 0)
  const usingBalance = selected === 'balance'
  const insufficient = usingBalance && !!quote && balance < quote.required_quota
  const limitReached =
    (props.purchaseLimit ?? 0) > 0 &&
    (props.purchaseCount ?? 0) >= (props.purchaseLimit ?? 0)
  const locked = payment.busy || payment.paid
  const blocked =
    !quote ||
    checkout.isFetching ||
    limitReached ||
    payment.review ||
    (usingBalance && (plan.allow_balance_pay === false || insufficient)) ||
    (!usingBalance && !method)
  const amount = usingBalance ? quote?.amount_due : method?.amount
  const formattedAmount =
    amount === undefined
      ? '—'
      : new Intl.NumberFormat(toIntlLocale(i18n.language), {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(amount)
  const currency = usingBalance ? 'USD' : (method?.name ?? '')
  const showReveal = () => {
    timer.current = setTimeout(() => {
      if (useAuthStore.getState().auth.user?.id !== props.userId) return
      props.onOpenChange(false)
      useSubscriptionRevealStore
        .getState()
        .show(plan.title, getSnowEventTier({ plan }))
      // A refresh error cannot undo a confirmed payment.
      void Promise.resolve(props.onPurchaseSuccess?.()).catch(() => {})
    }, 1000)
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!locked) props.onOpenChange(open)
      }}
    >
      <DialogContent
        className='snowapi-checkout inset-0 translate-x-0 translate-y-0'
        showCloseButton={false}
      >
        <div className='snowapi-checkout-sheet'>
          <header className='snowapi-checkout-header'>
            <Button
              variant='ghost'
              className='snowapi-checkout-back'
              disabled={locked}
              onClick={() => props.onOpenChange(false)}
              aria-label={t('Back')}
            >
              <ArrowLeft aria-hidden='true' />
            </Button>
            <SnowApiLogoMark className='size-7 dark:invert' />
            <span>SnowAPI</span>
          </header>
          <div className='snowapi-checkout-body'>
            <div className='snowapi-checkout-details'>
              <DialogTitle className='snowapi-checkout-title mb-9 text-3xl leading-tight font-semibold'>
                {t('Checkout')}
              </DialogTitle>
              <DialogDescription className='sr-only'>
                {t('Review your subscription and choose a payment method.')}
              </DialogDescription>
              <section aria-labelledby='checkout-account'>
                <h2 id='checkout-account'>{t('Account info')}</h2>
                <div className='snowapi-checkout-account'>
                  <span>{t('Username')}</span>
                  <strong>{username}</strong>
                </div>
              </section>
              <section aria-labelledby='checkout-method'>
                <h2 id='checkout-method'>{t('Payment')}</h2>
                <fieldset
                  className='snowapi-checkout-methods'
                  disabled={locked || !!payment.pendingOrder}
                >
                  <legend className='sr-only'>{t('Payment Method')}</legend>
                  <label
                    className='snowapi-checkout-method'
                    data-selected={usingBalance}
                  >
                    <input
                      type='radio'
                      name='subscription-payment'
                      value='balance'
                      checked={usingBalance}
                      onChange={() => setSelected('balance')}
                    />
                    <Wallet aria-hidden='true' />
                    <span>{t('Account balance')}</span>
                    <Check
                      className='snowapi-method-check'
                      aria-hidden='true'
                    />
                  </label>
                  {methods.map((item) => (
                    <label
                      key={item.type}
                      className='snowapi-checkout-method'
                      data-selected={selected === item.type}
                    >
                      <input
                        type='radio'
                        name='subscription-payment'
                        value={item.type}
                        checked={selected === item.type}
                        onChange={() => setSelected(item.type)}
                      />
                      <CreditCard aria-hidden='true' />
                      <span>{item.name}</span>
                      <Check
                        className='snowapi-method-check'
                        aria-hidden='true'
                      />
                    </label>
                  ))}
                </fieldset>
                {usingBalance ? (
                  <div className='snowapi-checkout-balance'>
                    <span>{t('Available balance')}</span>
                    <strong>{formatQuota(balance)}</strong>
                  </div>
                ) : (
                  <p className='snowapi-checkout-note'>
                    {t(
                      'Complete payment in the payment window. This page will update automatically.'
                    )}
                  </p>
                )}
                {usingBalance && plan.allow_balance_pay === false && (
                  <p className='snowapi-checkout-error'>
                    {t('This plan does not allow balance redemption')}
                  </p>
                )}
                {insufficient && (
                  <p className='snowapi-checkout-error'>
                    {t('Insufficient balance')}
                  </p>
                )}
              </section>
            </div>
            <aside
              className='snowapi-checkout-summary'
              aria-label={t('Order summary')}
            >
              <div className='snowapi-checkout-product'>
                <SnowApiLogoMark className='size-8 dark:invert' />
                <p>
                  SnowAPI <strong>{plan.title} Subscription</strong>
                </p>
              </div>
              <div className='snowapi-checkout-price' aria-live='polite'>
                <strong>{formattedAmount}</strong>
                <span>{currency}</span>
              </div>
              <dl>
                <div>
                  <dt>{t('Validity Period')}</dt>
                  <dd>{formatDuration(plan, t)}</dd>
                </div>
                {quote?.is_upgrade && (
                  <div>
                    <dt>{t('Upgrade from')}</dt>
                    <dd>{quote.current_plan_title}</dd>
                  </div>
                )}
                <div className='snowapi-checkout-total'>
                  <dt>{t('Total')}</dt>
                  <dd>
                    {formattedAmount} {currency}
                  </dd>
                </div>
              </dl>
              {checkout.isError && (
                <div role='alert' className='snowapi-checkout-error'>
                  {t('Unable to load the payment quote.')}
                  <Button
                    variant='ghost'
                    onClick={() => void checkout.refetch()}
                  >
                    {t('Retry')}
                  </Button>
                </div>
              )}
              {limitReached && (
                <p className='snowapi-checkout-error'>
                  {t('Purchase limit reached')}
                </p>
              )}
              {payment.error && (
                <p role='alert' className='snowapi-checkout-error'>
                  <span>{payment.error}</span>
                  {!payment.pendingOrder && (
                    <Button
                      variant='ghost'
                      onClick={() => void checkout.refetch()}
                    >
                      {t('Retry')}
                    </Button>
                  )}
                </p>
              )}
              <SlideCommit
                disabled={blocked}
                awaitingConfirmation={!!payment.pendingOrder}
                onConfirm={() =>
                  payment
                    .confirm(method, quote?.required_quota ?? 0)
                    .catch((error: unknown) => {
                      if (usingBalance) void checkout.refetch()
                      throw error
                    })
                }
                onDone={showReveal}
              />
              <p
                className='snowapi-checkout-note snowapi-checkout-status'
                role='status'
              >
                {payment.paid && t('Payment successful')}
                {payment.busy && t('Processing payment…')}
              </p>
            </aside>
          </div>
          <footer className='snowapi-checkout-footer'>
            <span>SnowAPI</span>
            <a
              href={appPath('/user-agreement')}
              target='_blank'
              rel='noreferrer'
            >
              {t('Terms of Service')}
            </a>
            <a
              href={appPath('/privacy-policy')}
              target='_blank'
              rel='noreferrer'
            >
              {t('Privacy Policy')}
            </a>
          </footer>
        </div>
      </DialogContent>
    </Dialog>
  )
}
