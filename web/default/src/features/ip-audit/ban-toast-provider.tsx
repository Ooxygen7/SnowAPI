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
import { useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { getSelfRelayBan } from './api'

export const RELAY_BAN_TOAST_ID = 'relay-ban-persistent'

export function RelayBanToastProvider() {
  const { t } = useTranslation()
  const userId = useAuthStore((state) => state.auth.user?.id)
  const banQuery = useQuery({
    queryKey: ['relay-ban-self', userId],
    queryFn: getSelfRelayBan,
    enabled: Boolean(userId),
    staleTime: 10_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    retry: false,
  })
  const { data: banStatus, isSuccess: hasBanStatus, refetch } = banQuery

  const showBanToast = useCallback(() => {
    toast.error(t('You have been banned. Please contact the administrator.'), {
      id: RELAY_BAN_TOAST_ID,
      duration: Infinity,
      dismissible: false,
      closeButton: false,
    })
  }, [t])

  useEffect(() => {
    if (!userId) {
      toast.dismiss(RELAY_BAN_TOAST_ID)
      return
    }
    if (!hasBanStatus) return

    const status = banStatus
    const expiresAt = status.expires_at ?? 0
    const expired = expiresAt > 0 && expiresAt * 1000 <= Date.now()
    if (status.active && !expired) {
      showBanToast()
      return
    }
    toast.dismiss(RELAY_BAN_TOAST_ID)
  }, [banStatus, hasBanStatus, showBanToast, userId])

  useEffect(() => {
    if (!userId) return
    const interceptor = api.interceptors.response.use(undefined, (error) => {
      if (error?.response?.data?.error?.code === 'user_relay_banned') {
        showBanToast()
        void refetch()
      }
      return Promise.reject(error)
    })
    return () => api.interceptors.response.eject(interceptor)
  }, [refetch, showBanToast, userId])

  useEffect(() => {
    const expiresAt = banStatus?.expires_at ?? 0
    if (!banStatus?.active || expiresAt <= 0) return

    let timer: ReturnType<typeof setTimeout> | undefined
    const checkExpiry = () => {
      const remaining = expiresAt * 1000 - Date.now()
      if (remaining <= 0) {
        toast.dismiss(RELAY_BAN_TOAST_ID)
        void refetch()
        return
      }
      timer = setTimeout(checkExpiry, Math.min(remaining, 2_147_483_647))
    }
    checkExpiry()
    return () => {
      if (timer) clearTimeout(timer)
    }
  }, [banStatus?.active, banStatus?.expires_at, refetch])

  return null
}
