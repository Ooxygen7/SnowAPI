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
  DEFAULT_PRESET_MULTIPLIERS,
  DEFAULT_PAYMENT_TYPE,
  DEFAULT_MIN_TOPUP,
} from '../constants'
import type {
  EpayFormData,
  PresetAmount,
  TopupInfo,
  TopupStatus,
} from '../types'

// ============================================================================
// Payment Processing Functions
// ============================================================================

export interface PaymentPopup {
  readonly closed: boolean
  close: () => void
}

export interface PaymentWindowTarget {
  popup: Window
  targetName: string
}

export type PaymentMonitorResult =
  | 'success'
  | 'failed'
  | 'cancelled'
  | 'pending'

interface PaymentMonitorOptions {
  popup: PaymentPopup
  getStatus: () => Promise<TopupStatus | null>
  signal?: AbortSignal
  pollIntervalMs?: number
  maxChecks?: number
  closureGraceChecks?: number
  wait?: (durationMs: number) => Promise<void>
}

/**
 * Open the payment destination synchronously from the user's click so browser
 * popup protection does not discard the checkout window while the order API is
 * still running.
 */
export function openPaymentWindow(): PaymentWindowTarget | null {
  const targetName = `snowapi-payment-${Date.now()}`
  const width = Math.min(560, window.screen.availWidth)
  const height = Math.min(760, window.screen.availHeight)
  const left = Math.max(0, Math.round((window.screen.availWidth - width) / 2))
  const top = Math.max(0, Math.round((window.screen.availHeight - height) / 2))
  const popup = window.open(
    '',
    targetName,
    `popup=yes,width=${width},height=${height},left=${left},top=${top}`
  )

  if (!popup) {
    return null
  }

  try {
    popup.document.documentElement.style.background = '#000'
    popup.document.body.style.background = '#000'
    popup.opener = null
  } catch {
    // The window can become cross-origin immediately in some browsers.
  }

  return { popup, targetName }
}

/**
 * Submit the Epay payment form.
 */
export function submitPaymentForm(
  url: string,
  params: Record<string, unknown>,
  targetName: string
): void {
  const form = document.createElement('form')
  form.action = url
  form.method = 'POST'

  form.target = targetName

  // Add form parameters
  Object.entries(params).forEach(([key, value]) => {
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = key
    input.value = String(value)
    form.appendChild(input)
  })

  document.body.appendChild(form)
  form.submit()
  document.body.removeChild(form)
}

export function getPaymentTradeNo(params: EpayFormData): string | null {
  const tradeNo = params.out_trade_no ?? params.trade_no
  return typeof tradeNo === 'string' && tradeNo.trim() !== ''
    ? tradeNo.trim()
    : null
}

/**
 * Poll the user-scoped order status while observing the checkout window. A
 * short grace period after the popup closes avoids racing the payment webhook.
 */
export async function monitorPaymentWindow(
  options: PaymentMonitorOptions
): Promise<PaymentMonitorResult> {
  const pollIntervalMs = options.pollIntervalMs ?? 2000
  const maxChecks = options.maxChecks ?? 300
  const closureGraceChecks = options.closureGraceChecks ?? 2
  const wait =
    options.wait ??
    ((durationMs: number) =>
      new Promise<void>((resolve) => window.setTimeout(resolve, durationMs)))
  let remainingClosureChecks: number | null = null

  for (let check = 0; check < maxChecks; check += 1) {
    if (options.signal?.aborted) {
      return 'cancelled'
    }

    try {
      const status = await options.getStatus()
      if (status === 'success') {
        return 'success'
      }
      if (status === 'failed' || status === 'expired') {
        return 'failed'
      }
    } catch {
      // A transient status request failure should not terminate checkout.
    }

    if (options.popup.closed) {
      if (remainingClosureChecks === null) {
        remainingClosureChecks = closureGraceChecks
      } else if (remainingClosureChecks <= 0) {
        return 'pending'
      } else {
        remainingClosureChecks -= 1
      }
    }

    await wait(pollIntervalMs)
  }

  return options.signal?.aborted ? 'cancelled' : 'pending'
}

/**
 * Get default payment type from topup info
 */
export function getDefaultPaymentType(topupInfo: TopupInfo | null): string {
  if (!topupInfo) {
    return DEFAULT_PAYMENT_TYPE
  }

  // Return first available payment method or default
  if (topupInfo.pay_methods?.length > 0) {
    return topupInfo.pay_methods[0].type
  }

  return DEFAULT_PAYMENT_TYPE
}

/**
 * Get minimum topup amount from topup info
 */
export function getMinTopupAmount(topupInfo: TopupInfo | null): number {
  if (!topupInfo) {
    return DEFAULT_MIN_TOPUP
  }

  if (topupInfo.enable_online_topup) {
    return topupInfo.min_topup
  }

  return DEFAULT_MIN_TOPUP
}

/**
 * Generate preset amounts based on minimum topup
 */
export function generatePresetAmounts(minAmount: number): PresetAmount[] {
  return DEFAULT_PRESET_MULTIPLIERS.map((multiplier) => ({
    value: minAmount * multiplier,
  }))
}

/**
 * Merge custom preset amounts with discounts
 */
export function mergePresetAmounts(
  amountOptions: number[],
  discounts: Record<number, number>
): PresetAmount[] {
  if (!amountOptions || amountOptions.length === 0) {
    return []
  }

  return amountOptions.map((amount) => ({
    value: amount,
    discount: discounts[amount] || 1.0,
  }))
}
