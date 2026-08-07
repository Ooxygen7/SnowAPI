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
import {
  SideNav,
  SideNavCollapseButton,
  SideNavItem,
  SideNavSection,
} from '@astryxdesign/core/SideNav'
import { Link, useLocation } from '@tanstack/react-router'
import { useState, type CSSProperties, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import type {
  NavCollapsible,
  NavItem,
  NavLink,
} from '@/components/layout/types'
import { useSidebarView } from '@/hooks/use-sidebar-view'
import { DEFAULT_LOGO } from '@/lib/constants'

import { isMinimalModeRestrictedPath } from '../lib/minimal-mode-navigation'
import { checkIsActive } from '../lib/url-utils'

function getNavigationHref(url: NavLink['url']): string | undefined {
  if (typeof url === 'string') return url
  if (!url || typeof url !== 'object' || Array.isArray(url)) return undefined

  const value = url as Record<string, unknown>
  const pathname = typeof value.pathname === 'string' ? value.pathname : ''
  const search = typeof value.search === 'string' ? value.search : ''
  return pathname ? `${pathname}${search}` : undefined
}

function NavigationBadge(props: { children: string }) {
  return <span className='snowapi-astryx-nav-badge'>{props.children}</span>
}

function isMinimalModeHiddenItem(item: NavItem) {
  const href = 'url' in item ? getNavigationHref(item.url) : undefined
  return href ? isMinimalModeRestrictedPath(href) : false
}

function NavigationItem(props: {
  item: NavItem
  currentHref: string
  minimalModeEnabled: boolean
}) {
  if (
    props.item.type === 'chat-presets' ||
    (props.minimalModeEnabled && isMinimalModeHiddenItem(props.item))
  ) {
    return null
  }

  const isSelected = checkIsActive(props.currentHref, props.item)
  const icon = props.item.icon
  const endContent = props.item.badge ? (
    <NavigationBadge>{props.item.badge}</NavigationBadge>
  ) : undefined

  if (!props.item.items) {
    const item = props.item as NavLink
    return (
      <SideNavItem
        label={item.title}
        icon={icon}
        href={getNavigationHref(item.url)}
        isSelected={isSelected}
        endContent={endContent}
      />
    )
  }

  const item = props.item as NavCollapsible
  const visibleItems = props.minimalModeEnabled
    ? item.items.filter((subItem) => !isMinimalModeHiddenItem(subItem))
    : item.items
  if (visibleItems.length === 0) return null

  return (
    <SideNavItem
      key={`${item.title}-${isSelected}`}
      label={item.title}
      icon={icon}
      isSelected={isSelected}
      endContent={endContent}
      collapsible={{ defaultIsCollapsed: !isSelected }}
    >
      {visibleItems.map((subItem) => (
        <SideNavItem
          key={`${subItem.title}-${String(subItem.url)}`}
          label={subItem.title}
          icon={subItem.icon}
          href={getNavigationHref(subItem.url)}
          isSelected={checkIsActive(props.currentHref, subItem)}
          endContent={
            subItem.badge ? (
              <NavigationBadge>{subItem.badge}</NavigationBadge>
            ) : undefined
          }
        />
      ))}
    </SideNavItem>
  )
}

export function AstryxNavigation(props: {
  logo: string
  minimalModeEnabled: boolean
  footer?: ReactNode
}) {
  const { t } = useTranslation()
  const currentHref = useLocation({ select: (location) => location.href })
  const { key, view, navGroups } = useSidebarView()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const sideNavStyle = {
    '--snowapi-side-nav-width': isCollapsed ? '3rem' : '15rem',
  } as CSSProperties

  return (
    <SideNav
      className='snowapi-astryx-side-nav'
      style={sideNavStyle}
      data-snowapi-collapsed={isCollapsed || undefined}
      collapsible={{
        buttonLabel: t('Toggle sidebar'),
        isCollapsed,
        onCollapsedChange: setIsCollapsed,
        hasButton: false,
      }}
      header={
        <div className='snowapi-astryx-brand-row'>
          <Link
            to='/dashboard'
            className='snowapi-astryx-logo-link'
            aria-label='SnowAPI'
          >
            <img
              src={props.logo || DEFAULT_LOGO}
              alt=''
              width={24}
              height={24}
              onError={(event) => {
                if (event.currentTarget.src.endsWith(DEFAULT_LOGO)) return
                event.currentTarget.src = DEFAULT_LOGO
              }}
            />
          </Link>
          <SideNavCollapseButton className='snowapi-astryx-collapse-button' />
        </div>
      }
      topContent={
        view ? (
          <SideNavItem
            label={t(view.parent.label)}
            href={getNavigationHref(view.parent.to)}
          />
        ) : undefined
      }
      footer={props.footer}
    >
      <div key={key} className='snowapi-astryx-side-nav-content'>
        {navGroups.map((group) => (
          <SideNavSection
            key={group.id || group.title}
            title={group.title}
            isHeaderHidden
          >
            {group.items.map((item) => (
              <NavigationItem
                key={`${item.title}-${item.type || 'item'}`}
                item={item}
                currentHref={currentHref}
                minimalModeEnabled={props.minimalModeEnabled}
              />
            ))}
          </SideNavSection>
        ))}
      </div>
    </SideNav>
  )
}
