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

import { getPublicPlans, getSelfSubscriptionFull } from './api'

export const subscriptionOverviewQueryKey = [
  'self-subscription-overview',
] as const

export function useSubscriptionOverview(enabled = true) {
  return useQuery({
    queryKey: subscriptionOverviewQueryKey,
    enabled,
    staleTime: 30 * 1000,
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
        plans: plansResponse.data ?? [],
        activeSubscriptions: subscriptionsResponse.data?.subscriptions ?? [],
        allSubscriptions: subscriptionsResponse.data?.all_subscriptions ?? [],
      }
    },
  })
}
