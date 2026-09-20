import { useMutation } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  getPaymentTradeNo,
  monitorPaymentWindow,
  openPaymentWindow,
  submitPaymentForm,
} from '@/features/wallet/lib/payment'
import { useAuthStore } from '@/stores/auth-store'

import { paySubscriptionBalance } from '../../api'
import {
  createSubscriptionPayment,
  getSubscriptionPaymentStatus,
  type CheckoutMethod,
} from '../../checkout-api'

export function useSubscriptionCheckoutPayment(planId: number, userId: number) {
  const { t } = useTranslation()
  const [error, setError] = useState('')
  const [paid, setPaid] = useState(false)
  const [pendingOrder, setPendingOrder] = useState<string | null>(null)
  const [review, setReview] = useState(false)
  const live = useRef(true)
  const controller = useRef<AbortController | null>(null)
  const popup = useRef<Window | null>(null)
  const popupName = useRef('')
  const locked = useRef(false)
  const requests = useRef(new Map<string, string>())
  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
      controller.current?.abort()
    }
  }, [])
  const currentAccount = () =>
    live.current && useAuthStore.getState().auth.user?.id === userId

  const payment = useMutation({
    retry: false,
    onError: () => {}, // Checkout owns its inline error and retry state.
    mutationFn: async ({
      method,
      expectedQuota,
    }: {
      method: CheckoutMethod | null
      expectedQuota: number
    }) => {
      if (!method) {
        const response = await paySubscriptionBalance({
          plan_id: planId,
          expected_quota: expectedQuota,
        })
        if (!response.success) {
          throw new Error(response.message || t('Payment failed'))
        }
        return
      }
      let tradeNo = pendingOrder
      if (!tradeNo) {
        let requestId = requests.current.get(method.type)
        if (!requestId) {
          requestId = crypto.randomUUID()
          requests.current.set(method.type, requestId)
        }
        const response = await createSubscriptionPayment(
          planId,
          method,
          requestId
        )
        if (
          !response.data ||
          !response.url ||
          (response.success !== true && response.message !== 'success')
        ) {
          requests.current.delete(method.type)
          popup.current?.close()
          throw new Error(response.message || t('Payment failed'))
        }
        tradeNo = getPaymentTradeNo(response.data)
        if (!tradeNo) throw new Error(t('Payment failed'))
        if (!currentAccount()) throw new Error(t('Payment failed'))
        setPendingOrder(tradeNo)
        submitPaymentForm(response.url, response.data, popupName.current)
      }
      let needsReview = false
      controller.current = new AbortController()
      const result = await monitorPaymentWindow({
        popup: popup.current ?? { closed: false, close: () => {} },
        signal: controller.current.signal,
        getStatus: async () => {
          const status = await getSubscriptionPaymentStatus(tradeNo)
          if (status === 'paid_review') {
            needsReview = true
            return 'failed'
          }
          if (
            status === 'success' ||
            status === 'failed' ||
            status === 'expired'
          ) {
            return status
          }
          return 'pending'
        },
      })
      if (result === 'success') {
        popup.current?.close()
        return
      }
      if (needsReview) {
        setReview(true)
        throw new Error(
          t(
            'Payment received. Your subscription changed during checkout. Please contact an administrator.'
          )
        )
      }
      if (result === 'failed') {
        setPendingOrder(null)
        throw new Error(t('Payment failed'))
      }
      throw new Error(
        t(
          'Payment is awaiting confirmation. Check order history before paying again.'
        )
      )
    },
  })

  const confirm = async (
    method: CheckoutMethod | null,
    expectedQuota: number
  ) => {
    if (locked.current || paid || review || !currentAccount()) {
      throw new Error('checkout unavailable')
    }
    locked.current = true
    setError('')
    // Open in the original pointer/key event, before any async request.
    if (method && !pendingOrder) {
      const target = openPaymentWindow()
      if (!target) {
        locked.current = false
        setError(t('Allow pop-ups to open the payment window.'))
        throw new Error('popup blocked')
      }
      popup.current = target.popup
      popupName.current = target.targetName
    }
    try {
      await payment.mutateAsync({ method, expectedQuota })
      if (!currentAccount()) throw new Error('account changed')
      setPaid(true)
    } catch (reason) {
      if (currentAccount()) {
        setError(reason instanceof Error ? reason.message : t('Payment failed'))
      }
      throw reason
    } finally {
      locked.current = false
    }
  }
  return { confirm, error, paid, pendingOrder, review, busy: payment.isPending }
}
