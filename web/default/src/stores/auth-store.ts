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
import { create } from 'zustand'

import type { AdminCapabilities } from '@/lib/admin-permissions'

export type UserPermissions = {
  sidebar_settings?: boolean
  sidebar_modules?: Record<string, unknown>
  admin_permissions?: AdminCapabilities
}

export interface AuthUser {
  id: number
  username: string
  display_name?: string
  email?: string
  role: number
  status?: number
  group?: string
  quota?: number
  used_quota?: number
  request_count?: number
  github_id?: string
  oidc_id?: string
  wechat_id?: string
  telegram_id?: string
  linux_do_id?: string
  setting?: Record<string, unknown> | string
  sidebar_modules?: string
  permissions?: UserPermissions
}

interface AuthState {
  auth: {
    user: AuthUser | null
    sessionVersion: number
    setUser: (user: AuthUser | null) => void
    reset: () => void
  }
}

export const useAuthStore = create<AuthState>()((set) => {
  // Restore user info from localStorage
  const initUser = (() => {
    try {
      if (typeof window !== 'undefined') {
        const saved = window.localStorage.getItem('user')
        return saved ? JSON.parse(saved) : null
      }
    } catch {
      // Clear dirty data when parsing fails
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem('user')
      }
    }
    return null
  })()

  return {
    auth: {
      user: initUser,
      sessionVersion: 0,
      setUser: (user) =>
        set((state) => {
          // Persist user to localStorage
          try {
            if (typeof window !== 'undefined') {
              if (user) {
                window.localStorage.setItem('user', JSON.stringify(user))
                window.localStorage.setItem('uid', String(user.id))
              } else {
                window.localStorage.removeItem('user')
                window.localStorage.removeItem('uid')
              }
            }
          } catch {
            // Storage failure must not prevent the in-memory account change.
          }
          const changed = state.auth.user?.id !== user?.id
          return {
            ...state,
            auth: {
              ...state.auth,
              user,
              sessionVersion: state.auth.sessionVersion + Number(changed),
            },
          }
        }),
      reset: () =>
        set((state) => {
          try {
            if (typeof window !== 'undefined') {
              window.localStorage.removeItem('user')
              window.localStorage.removeItem('uid')
            }
          } catch {
            // Still invalidate requests and private caches in restricted mode.
          }
          return {
            ...state,
            auth: {
              ...state.auth,
              user: null,
              sessionVersion: state.auth.sessionVersion + 1,
            },
          }
        }),
    },
  }
})
