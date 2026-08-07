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
import i18next from 'i18next'
import { useState, useCallback, useEffect, useRef } from 'react'
import { toast } from 'sonner'

import {
  calculateAmount,
  getPaymentStatus,
  requestPayment,
  isApiSuccess,
} from '../api'
import {
  getPaymentTradeNo,
  monitorPaymentWindow,
  openPaymentWindow,
  submitPaymentForm,
} from '../lib'

interface PaymentCallbacks {
  onSuccess?: () => void | Promise<void>
}

interface ActivePaymentMonitor {
  controller: AbortController
  popup: Window
}

// ============================================================================
// Payment Hook
// ============================================================================

export function usePayment() {
  const [amount, setAmount] = useState<number>(0)
  const [calculating, setCalculating] = useState(false)
  const [processing, setProcessing] = useState(false)
  const activeMonitorRef = useRef<ActivePaymentMonitor | null>(null)

  const stopActiveMonitor = useCallback((closePopup: boolean) => {
    const activeMonitor = activeMonitorRef.current
    if (!activeMonitor) {
      return
    }

    activeMonitor.controller.abort()
    if (closePopup && !activeMonitor.popup.closed) {
      activeMonitor.popup.close()
    }
    activeMonitorRef.current = null
  }, [])

  useEffect(() => {
    return () => stopActiveMonitor(false)
  }, [stopActiveMonitor])

  // Calculate payment amount
  const calculatePaymentAmount = useCallback(
    async (topupAmount: number, _paymentType: string) => {
      try {
        setCalculating(true)

        const response = await calculateAmount({ amount: topupAmount })

        if (isApiSuccess(response) && response.data) {
          const calculatedAmount = Number.parseFloat(response.data)
          setAmount(calculatedAmount)
          return calculatedAmount
        }

        // Don't show error for calculation, just set to 0
        setAmount(0)
        return 0
      } catch {
        setAmount(0)
        return 0
      } finally {
        setCalculating(false)
      }
    },
    []
  )

  // Process payment
  const processPayment = useCallback(
    async (
      topupAmount: number,
      paymentType: string,
      callbacks?: PaymentCallbacks
    ) => {
      stopActiveMonitor(true)
      const paymentWindow = openPaymentWindow()
      if (!paymentWindow) {
        toast.error(i18next.t('Payment failed'))
        return false
      }

      try {
        setProcessing(true)

        const amount = Math.floor(topupAmount)
        const response = await requestPayment({
          amount,
          payment_method: paymentType,
        })

        if (!isApiSuccess(response)) {
          paymentWindow.popup.close()
          toast.error(response.message || i18next.t('Payment request failed'))
          return false
        }

        if (response.data) {
          const url = (response as unknown as { url?: string }).url
          const tradeNo = getPaymentTradeNo(response.data)
          if (url && tradeNo) {
            submitPaymentForm(url, response.data, paymentWindow.targetName)
            toast.success(i18next.t('Redirecting to payment page...'))

            const controller = new AbortController()
            const activeMonitor = {
              controller,
              popup: paymentWindow.popup,
            }
            activeMonitorRef.current = activeMonitor

            void monitorPaymentWindow({
              popup: paymentWindow.popup,
              signal: controller.signal,
              getStatus: () => getPaymentStatus(tradeNo),
            }).then(async (result) => {
              if (activeMonitorRef.current !== activeMonitor) {
                return
              }

              activeMonitorRef.current = null
              if (result === 'success') {
                if (!paymentWindow.popup.closed) {
                  paymentWindow.popup.close()
                }
                toast.success(i18next.t('Payment successful'))
                await callbacks?.onSuccess?.()
              } else if (result === 'failed') {
                toast.error(i18next.t('Payment failed'))
              }
            })
            return true
          }
        }

        paymentWindow.popup.close()
        toast.error(i18next.t('Payment failed'))
        return false
      } catch {
        paymentWindow.popup.close()
        toast.error(i18next.t('Payment request failed'))
        return false
      } finally {
        setProcessing(false)
      }
    },
    [stopActiveMonitor]
  )

  return {
    amount,
    calculating,
    processing,
    calculatePaymentAmount,
    processPayment,
    setAmount,
  }
}
