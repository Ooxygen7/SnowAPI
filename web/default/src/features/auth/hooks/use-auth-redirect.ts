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
import { useNavigate } from '@tanstack/react-router'
import i18n from 'i18next'
import { useCallback } from 'react'

import type { User } from '@/features/users/types'
import { normalizeInterfaceLanguage } from '@/i18n/languages'
import { api, getSelf } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { useLoginTransition } from '@/stores/login-transition-store'

import { saveUserId } from '../lib/storage'

function getSavedLanguage(user: User): string | undefined {
  const userData = user as Record<string, unknown>
  if (typeof userData.language === 'string') {
    return userData.language
  }

  if (typeof userData.setting !== 'string') {
    return undefined
  }

  try {
    const setting = JSON.parse(userData.setting) as { language?: unknown }
    return typeof setting.language === 'string' ? setting.language : undefined
  } catch {
    return undefined
  }
}

/**
 * Hook for handling authentication redirects and user data management
 */
export function useAuthRedirect() {
  const navigate = useNavigate()
  const setUser = useAuthStore((state) => state.auth.setUser)

  /**
   * Handle successful login
   * @param userData - Optional user data from login response
   * @param redirectTo - Redirect path after login
   */
  const handleLoginSuccess = useCallback(
    async (userData?: { id?: number } | null, redirectTo?: string) => {
      const language = normalizeInterfaceLanguage(i18n.language)
      // Save user ID if available
      if (userData?.id) {
        saveUserId(userData.id)
      }

      const self = await getSelf()
      if (!self?.success || !self.data) {
        throw new Error(i18n.t('Failed to load user profile'))
      }
      const user = self.data as User
      setUser(user)
      if (user.id) saveUserId(user.id)
      // The language selected on this device wins over an old account setting.
      await i18n.changeLanguage(language)
      if (getSavedLanguage(user) !== language) {
        void api
          .put(
            '/api/user/self',
            { language },
            {
              skipBusinessError: true,
              skipErrorHandler: true,
            }
          )
          .catch(() => {
            /* Keep the local language when preference sync fails. */
          })
      }

      const transition = useLoginTransition.getState()
      await transition.start(user.username || user.display_name || '')

      // Navigate to target page
      const targetPath = redirectTo || '/dashboard'
      try {
        await navigate({ to: targetPath, replace: true })
        transition.leave()
      } catch (error) {
        transition.reset()
        throw error
      }
    },
    [navigate, setUser]
  )

  /**
   * Redirect to login page
   */
  const redirectToLogin = () => {
    navigate({ to: '/sign-in', replace: true })
  }

  /**
   * Redirect to register page
   */
  const redirectToRegister = () => {
    navigate({ to: '/sign-up', replace: true })
  }

  return {
    handleLoginSuccess,
    redirectToLogin,
    redirectToRegister,
  }
}
