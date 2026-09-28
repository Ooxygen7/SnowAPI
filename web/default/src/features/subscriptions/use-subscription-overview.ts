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
import { useEffect, useState } from 'react'

import { getPublicPlans, getSelfSubscriptionFull } from './api'
import {
  getEffectiveFiveHourWindow,
  getNextSubscriptionBoundary,
} from './quota-window'

export const subscriptionOverviewQueryKey = [
  'self-subscription-overview',
] as const

export function useSubscriptionOverview(enabled = true) {
  const [, refreshClock] = useState(0)
  const query = useQuery({
    queryKey: subscriptionOverviewQueryKey,
    enabled,
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: 'always',
    queryFn: async () => {
      const [plansResponse, subscriptionsResponse] = await Promise.all([
        getPublicPlans(),
        getSelfSubscriptionFull(),
      ])
      if (!plansResponse.success) {
        throw new Error(plansResponse.message || 'Failed to load plans')
      }
      if (!subscriptionsResponse.success) {
        throw new Error(
          subscriptionsResponse.message || 'Failed to load subscriptions'
        )
      }

      return {
        receivedAt: Date.now(),
        serverTime: subscriptionsResponse.data?.server_time,
        billingPreference:
          subscriptionsResponse.data?.billing_preference ??
          'subscription_first',
        plans: plansResponse.data ?? [],
        activeSubscriptions: subscriptionsResponse.data?.subscriptions ?? [],
        allSubscriptions: subscriptionsResponse.data?.all_subscriptions ?? [],
      }
    },
  })
  const localNow = Date.now()
  const now = query.data?.serverTime
    ? query.data.serverTime + (localNow - query.data.receivedAt) / 1000
    : localNow / 1000
  const boundary = getNextSubscriptionBoundary(
    query.data?.activeSubscriptions ?? [],
    now
  )
  const refetch = query.refetch
  useEffect(() => {
    if (!enabled || boundary == null) return
    const delay = Math.min(
      2_147_483_647,
      Math.max(0, (boundary - now) * 1000 + 50)
    )
    const timer = window.setTimeout(() => {
      refreshClock((value) => value + 1)
      if (document.visibilityState === 'visible') void refetch()
    }, delay)
    return () => window.clearTimeout(timer)
  }, [enabled, boundary, now, refetch])

  if (!query.data) return { ...query, now }
  const normalize = (record: (typeof query.data.allSubscriptions)[number]) => ({
    ...record,
    five_hour_window: getEffectiveFiveHourWindow(record, now),
  })
  return {
    ...query,
    now,
    data: {
      ...query.data,
      activeSubscriptions: query.data.activeSubscriptions
        .filter((record) => record.subscription.end_time > now)
        .map(normalize),
      allSubscriptions: query.data.allSubscriptions.map(normalize),
    },
  }
}
