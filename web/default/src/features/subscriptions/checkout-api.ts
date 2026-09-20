import type { PaymentResponse } from '@/features/wallet/types'
import { api } from '@/lib/api'

import type { SubscriptionBalanceQuote } from './types'

export interface CheckoutMethod {
  type: string
  name: string
  icon?: string
  amount: number
}
export interface CheckoutData {
  quote: SubscriptionBalanceQuote
  payment_methods: CheckoutMethod[]
}
const quiet = { skipBusinessError: true, skipErrorHandler: true }

export async function getSubscriptionCheckout(
  planId: number
): Promise<CheckoutData> {
  const { data } = await api.get('/api/subscription/checkout', {
    ...quiet,
    params: { plan_id: planId },
  })
  if (!data.success || !data.data) throw new Error(data.message)
  return data.data
}

export async function createSubscriptionPayment(
  planId: number,
  method: CheckoutMethod,
  requestId: string
): Promise<PaymentResponse> {
  const { data } = await api.post(
    '/api/subscription/epay/pay',
    {
      plan_id: planId,
      payment_method: method.type,
      expected_money: method.amount,
      request_id: requestId,
    },
    quiet
  )
  return data
}

export async function getSubscriptionPaymentStatus(
  tradeNo: string
): Promise<string> {
  const { data } = await api.get('/api/subscription/checkout/status', {
    ...quiet,
    params: { trade_no: tradeNo },
  })
  if (!data.success || !data.data) throw new Error(data.message)
  return data.data.status
}
