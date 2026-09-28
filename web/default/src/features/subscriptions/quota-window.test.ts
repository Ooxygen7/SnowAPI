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

import {
  getEffectiveFiveHourWindow,
  getNextSubscriptionBoundary,
} from './quota-window.ts'
import type { UserSubscriptionRecord } from './types'

const record: UserSubscriptionRecord = {
  subscription: {
    id: 206,
    user_id: 1,
    plan_id: 1,
    status: 'active',
    start_time: 100,
    end_time: 100000,
    amount_total: 2500000,
    amount_used: 0,
    five_hour_quota: 1000000,
    next_reset_time: 80000,
  },
  five_hour_window: {
    state: 'active',
    window_id: 39,
    amount_total: 1000000,
    amount_used: 139240,
    remaining: 860760,
    start_time: 100,
    end_time: 18100,
  },
}

describe('five-hour current allowance', () => {
  test('keeps real usage and fixed deadline until the boundary', () => {
    assert.deepEqual(
      getEffectiveFiveHourWindow(record, 18099),
      record.five_hour_window
    )
    assert.equal(getNextSubscriptionBoundary([record], 18099), 18100)
  })

  test('restores allowance exactly at expiry even with a stale API snapshot', () => {
    assert.deepEqual(getEffectiveFiveHourWindow(record, 18100), {
      state: 'idle',
      amount_total: 1000000,
      amount_used: 0,
      remaining: 1000000,
    })
    assert.equal(
      record.five_hour_window?.amount_used,
      139240,
      'do not mutate cached ledger snapshots'
    )
    assert.equal(getNextSubscriptionBoundary([record], 18100), 80000)
  })

  test('handles old-backend expired state and missing/disabled windows', () => {
    assert.ok(record.five_hour_window)
    assert.equal(
      getEffectiveFiveHourWindow(
        {
          ...record,
          five_hour_window: { ...record.five_hour_window, state: 'expired' },
        },
        19000
      )?.amount_used,
      0
    )
    assert.equal(
      getEffectiveFiveHourWindow({ ...record, five_hour_window: null }, 19000),
      null
    )
  })

  test('retains historical usage for ended subscriptions without claiming a new allowance', () => {
    assert.deepEqual(
      getEffectiveFiveHourWindow(record, 100000),
      record.five_hour_window
    )
    assert.deepEqual(
      getEffectiveFiveHourWindow(
        {
          ...record,
          subscription: { ...record.subscription, status: 'cancelled' },
        },
        19000
      ),
      record.five_hour_window
    )
    assert.equal(getNextSubscriptionBoundary([record], 100000), undefined)
  })
})
