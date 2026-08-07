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
import { getCookie, setCookie } from '@/lib/cookies'

const APPEARANCE_DEFAULTS_VERSION = '20260805-1'
const APPEARANCE_DEFAULTS_COOKIE = 'snowapi_appearance_defaults'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365

type AppearancePreference = {
  name: string
  fallback: string
  legacyCookies: string[]
  siteAttributes: string[]
}

const APPEARANCE_PREFERENCES: AppearancePreference[] = [
  {
    name: 'vite-ui-theme',
    fallback: 'light',
    legacyCookies: ['theme', 'color-theme'],
    siteAttributes: ['data-theme'],
  },
  {
    name: 'theme_preset',
    fallback: 'default',
    legacyCookies: ['themePreset', 'theme-preset'],
    siteAttributes: ['data-theme-preset'],
  },
  {
    name: 'theme_font',
    fallback: 'sans',
    legacyCookies: ['themeFont', 'font'],
    siteAttributes: ['data-theme-font'],
  },
  {
    name: 'theme_radius',
    fallback: 'md',
    legacyCookies: ['themeRadius', 'radius'],
    siteAttributes: ['data-theme-radius'],
  },
  {
    name: 'theme_scale',
    fallback: 'sm',
    legacyCookies: ['themeScale', 'scale'],
    siteAttributes: ['data-theme-scale'],
  },
  {
    name: 'theme_content_layout',
    fallback: 'centered',
    legacyCookies: ['content_layout', 'contentLayout'],
    siteAttributes: ['data-theme-content-layout'],
  },
  {
    name: 'layout_variant',
    fallback: 'sidebar',
    legacyCookies: ['layout', 'layoutVariant'],
    siteAttributes: ['data-layout-variant'],
  },
  {
    name: 'layout_collapsible',
    fallback: 'icon',
    legacyCookies: ['layoutCollapsible'],
    siteAttributes: ['data-layout-collapsible'],
  },
  {
    name: 'sidebar_state',
    fallback: 'true',
    legacyCookies: ['sidebarState'],
    siteAttributes: ['data-sidebar-state'],
  },
  {
    name: 'dir',
    fallback: 'ltr',
    legacyCookies: ['direction'],
    siteAttributes: ['dir'],
  },
]

function getSitePreference(attributes: string[]) {
  if (typeof document === 'undefined') return undefined

  for (const attribute of attributes) {
    const value =
      document.documentElement.getAttribute(attribute) ||
      document.body?.getAttribute(attribute)
    if (value) return value
  }

  if (attributes.includes('data-theme')) {
    if (document.documentElement.classList.contains('dark')) return 'dark'
    if (document.documentElement.classList.contains('light')) return 'light'
  }

  return undefined
}

/**
 * Fill absent SnowAPI appearance cookies once. Explicit current or legacy
 * preferences always win, followed by a server-rendered DOM preference.
 */
export function applySnowApiAppearanceDefaultsOnce(): void {
  if (getCookie(APPEARANCE_DEFAULTS_COOKIE) === APPEARANCE_DEFAULTS_VERSION) {
    return
  }

  for (const preference of APPEARANCE_PREFERENCES) {
    if (getCookie(preference.name) !== undefined) continue

    const legacyValue = preference.legacyCookies
      .map((name) => getCookie(name))
      .find((value) => value !== undefined)
    const siteValue = getSitePreference(preference.siteAttributes)
    setCookie(
      preference.name,
      legacyValue ?? siteValue ?? preference.fallback,
      COOKIE_MAX_AGE
    )
  }

  setCookie(
    APPEARANCE_DEFAULTS_COOKIE,
    APPEARANCE_DEFAULTS_VERSION,
    COOKIE_MAX_AGE
  )
}
