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
import type { UserSubscriptionRecord } from './types'

// Historical windows remain immutable accounting references. Current allowance
// becomes available at the deadline even if a refresh is delayed or offline.
export function getEffectiveFiveHourWindow(
  record: UserSubscriptionRecord,
  now: number
) {
  const subscription = record.subscription
  const window = record.five_hour_window
  if (
    !window ||
    subscription.status !== 'active' ||
    subscription.end_time <= now
  ) {
    return window
  }
  if (
    window.state === 'idle' ||
    window.state === 'expired' ||
    (window.end_time != null && window.end_time <= now)
  ) {
    const total = subscription.five_hour_quota ?? window.amount_total
    return {
      state: 'idle' as const,
      amount_total: total,
      amount_used: 0,
      remaining: total,
    }
  }
  return window
}

export function getNextSubscriptionBoundary(
  records: UserSubscriptionRecord[],
  now: number
): number | undefined {
  let next: number | undefined
  for (const record of records) {
    if (record.subscription.status !== 'active') continue
    for (const deadline of [
      record.subscription.end_time,
      record.subscription.next_reset_time,
      record.five_hour_window?.end_time,
    ]) {
      if (deadline && deadline > now && (next == null || deadline < next)) {
        next = deadline
      }
    }
  }
  return next
}
