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
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import type { TopupStatus } from '../types'
import {
  getPaymentTradeNo,
  monitorPaymentWindow,
  type PaymentPopup,
} from './payment.ts'

const waitImmediately = async () => {}

describe('payment window monitoring', () => {
  test('timeout and unavailable order status remain unconfirmed', async () => {
    for (const getStatus of [
      async () => 'pending' as const,
      async () => {
        throw new Error('offline')
      },
    ]) {
      assert.equal(
        await monitorPaymentWindow({
          popup: { closed: false, close: () => {} },
          getStatus,
          maxChecks: 2,
          wait: waitImmediately,
        }),
        'pending'
      )
    }
  })

  test('accepts a delayed success after checkout closes', async () => {
    const statuses: TopupStatus[] = ['pending', 'success']
    assert.equal(
      await monitorPaymentWindow({
        popup: { closed: true, close: () => {} },
        getStatus: async () => statuses.shift() ?? null,
        closureGraceChecks: 2,
        maxChecks: 3,
        wait: waitImmediately,
      }),
      'success'
    )
  })

  test('extracts the EasyPay order number from form parameters', () => {
    assert.equal(
      getPaymentTradeNo({ out_trade_no: ' USR1NO123 ' }),
      'USR1NO123'
    )
    assert.equal(getPaymentTradeNo({ trade_no: 'fallback' }), 'fallback')
    assert.equal(getPaymentTradeNo({}), null)
  })

  test('reports success when the webhook updates the pending order', async () => {
    const statuses: Array<TopupStatus | null> = ['pending', 'success']
    const popup: PaymentPopup = { closed: false, close: () => {} }

    const result = await monitorPaymentWindow({
      popup,
      getStatus: async () => statuses.shift() ?? null,
      maxChecks: 3,
      wait: waitImmediately,
    })

    assert.equal(result, 'success')
  })

  test('keeps a pending order unconfirmed after the popup closes', async () => {
    const popup: PaymentPopup = { closed: true, close: () => {} }

    const result = await monitorPaymentWindow({
      popup,
      getStatus: async () => 'pending',
      closureGraceChecks: 1,
      maxChecks: 3,
      wait: waitImmediately,
    })

    assert.equal(result, 'pending')
  })

  test('reports an explicit failed order without waiting for popup closure', async () => {
    const popup: PaymentPopup = { closed: false, close: () => {} }

    const result = await monitorPaymentWindow({
      popup,
      getStatus: async () => 'failed',
      maxChecks: 3,
      wait: waitImmediately,
    })

    assert.equal(result, 'failed')
  })
})
