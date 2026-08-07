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
import type { PlanRecord, UserSubscriptionRecord } from './types'

export type SnowEventTier = 'light' | 'moderate' | 'heavy' | 'storm' | 'other'

export const snowEventTierOrder: Record<SnowEventTier, number> = {
  light: 0,
  moderate: 1,
  heavy: 2,
  storm: 3,
  other: 4,
}

export function getSnowEventTier(record: PlanRecord): SnowEventTier {
  const identity = `${record.plan.title} ${record.plan.upgrade_group ?? ''}`
    .trim()
    .toLowerCase()

  if (identity.includes('storm')) return 'storm'
  if (identity.includes('moderate')) return 'moderate'
  if (identity.includes('heavy')) return 'heavy'
  if (identity.includes('light')) return 'light'
  return 'other'
}

export function compareSnowEventPlans(
  left: PlanRecord,
  right: PlanRecord
): number {
  const tierDifference =
    snowEventTierOrder[getSnowEventTier(left)] -
    snowEventTierOrder[getSnowEventTier(right)]
  if (tierDifference !== 0) return tierDifference

  const sortDifference = left.plan.sort_order - right.plan.sort_order
  if (sortDifference !== 0) return sortDifference

  return left.plan.price_amount - right.plan.price_amount
}

export function findHighestActiveSubscription(
  plans: PlanRecord[],
  subscriptions: UserSubscriptionRecord[]
): { plan: PlanRecord | null; record: UserSubscriptionRecord | null } {
  const planById = new Map(plans.map((record) => [record.plan.id, record]))
  const now = Date.now() / 1000
  const candidates = subscriptions
    .filter((record) => {
      const subscription = record.subscription
      return (
        subscription.status === 'active' &&
        (subscription.end_time <= 0 || subscription.end_time > now)
      )
    })
    .map((record) => ({
      plan: planById.get(record.subscription.plan_id) ?? null,
      record,
    }))

  candidates.sort((left, right) => {
    if (!left.plan && !right.plan) {
      return (
        left.record.subscription.end_time - right.record.subscription.end_time
      )
    }
    if (!left.plan) return -1
    if (!right.plan) return 1
    return compareSnowEventPlans(left.plan, right.plan)
  })

  return candidates.at(-1) ?? { plan: null, record: null }
}
