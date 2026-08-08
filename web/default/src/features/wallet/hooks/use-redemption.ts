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
import { useQueryClient } from '@tanstack/react-query'
import i18next from 'i18next'
import { useState, useCallback } from 'react'
import { toast } from 'sonner'

import { getSelf } from '@/lib/api'
import { formatQuota } from '@/lib/format'
import { useAuthStore, type AuthUser } from '@/stores/auth-store'

import { redeemTopupCode } from '../api'

// ============================================================================
// Redemption Hook
// ============================================================================

export function useRedemption() {
  const queryClient = useQueryClient()
  const [redeeming, setRedeeming] = useState(false)

  const redeemCode = useCallback(
    async (code: string): Promise<boolean> => {
      if (!code || code.trim() === '') {
        toast.error(i18next.t('Please enter a redemption code'))
        return false
      }

      try {
        setRedeeming(true)
        const response = await redeemTopupCode({ key: code })

        if (response.success && response.data !== undefined) {
          if (typeof response.data === 'number') {
            toast.success(
              i18next.t('Redemption successful! Added: {{quota}}', {
                quota: formatQuota(response.data),
              })
            )
          } else if (response.data.type === 'group') {
            toast.success(
              i18next.t('Group entitlement activated: {{group}}', {
                group: response.data.group_name,
              })
            )
          } else {
            toast.success(
              i18next.t('Redemption successful! Added: {{quota}}', {
                quota: formatQuota(response.data.quota),
              })
            )
          }
          const selfResponse = await getSelf().catch(() => null)
          if (selfResponse?.success && selfResponse.data) {
            useAuthStore.getState().auth.setUser(selfResponse.data as AuthUser)
          }
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['model-catalog'] }),
            queryClient.invalidateQueries({ queryKey: ['user-models'] }),
            queryClient.invalidateQueries({
              queryKey: ['user-models-ccswitch'],
            }),
            queryClient.invalidateQueries({ queryKey: ['user-groups'] }),
          ])
          return true
        }

        toast.error(response.message || i18next.t('Redemption failed'))
        return false
      } catch {
        toast.error(i18next.t('Redemption failed'))
        return false
      } finally {
        setRedeeming(false)
      }
    },
    [queryClient]
  )

  return {
    redeeming,
    redeemCode,
  }
}
