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
import { AppShell, useAppShellMobile } from '@astryxdesign/core/AppShell'
import { InternationalizationProvider } from '@astryxdesign/core/i18n'
import { LinkProvider } from '@astryxdesign/core/Link'
import { SideNavRenderContext } from '@astryxdesign/core/SideNav'
import { Cancel01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useIsFetching, useQuery } from '@tanstack/react-query'
import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ContentLoading } from '@/components/content-loading'
import { AnimatedOutlet } from '@/components/page-transition'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
} from '@/components/ui/sheet'
import { useDirection } from '@/context/direction-provider'
import {
  getMinimalMode,
  minimalModeQueryKey,
} from '@/features/system-settings/operations/minimal-mode-api'
import { useIsAdmin } from '@/hooks/use-admin'
import { useSystemConfig } from '@/hooks/use-system-config'
import { toIntlLocale } from '@/i18n/languages'
import { DEFAULT_LOGO } from '@/lib/constants'

import {
  isMinimalModeRestrictedPath,
  MINIMAL_MODE_REDIRECT_PATH,
} from '../lib/minimal-mode-navigation'
import { AstryxNavigation } from './astryx-navigation'
import { SidebarSignOutButton } from './sidebar-sign-out-button'
import {
  SnowEventCard,
  SnowEventDialog,
  SnowEventMobileCard,
} from './snow-event-card'

type AstryxAppShellProps = {
  children?: React.ReactNode
}

type SnowMobileNavigationProps = {
  logo: string
  minimalModeEnabled: boolean
}

function SnowMobileNavigation({
  logo,
  minimalModeEnabled,
}: SnowMobileNavigationProps) {
  const { t } = useTranslation()
  const { isMobileNavOpen, closeMobileNav, mobileNavId } = useAppShellMobile()
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const upgradeOpenTimerRef = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (upgradeOpenTimerRef.current !== null) {
        window.clearTimeout(upgradeOpenTimerRef.current)
      }
    },
    []
  )

  return (
    <>
      <Sheet
        open={isMobileNavOpen}
        onOpenChange={(open) => {
          if (!open) closeMobileNav()
        }}
      >
        <SheetContent
          id={mobileNavId}
          side='right'
          showCloseButton={false}
          overlayClassName='snowapi-mobile-sheet-overlay'
          className='snowapi-mobile-sheet w-[min(374px,100vw)] max-w-none gap-0 border-l duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] sm:max-w-none'
          aria-label={t('Navigation')}
          onClick={(event) => {
            if ((event.target as HTMLElement).closest('a')) closeMobileNav()
          }}
        >
          <SheetTitle className='sr-only'>{t('Navigation')}</SheetTitle>
          <div className='flex h-12 shrink-0 items-center justify-between border-b px-2'>
            <Link
              to='/dashboard'
              className='snowapi-astryx-logo-link'
              aria-label='SnowAPI'
            >
              <img src={logo || DEFAULT_LOGO} alt='' width={24} height={24} />
            </Link>
            <SheetClose
              render={
                <Button
                  variant='ghost'
                  size='icon-sm'
                  aria-label={t('Close navigation')}
                />
              }
            >
              <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
            </SheetClose>
          </div>
          <div className='min-h-0 flex-1 overflow-y-auto p-2'>
            <SideNavRenderContext value='drawer-content'>
              <AstryxNavigation
                logo={logo}
                minimalModeEnabled={minimalModeEnabled}
                footer={
                  <div className='snowapi-mobile-nav-footer'>
                    <SnowEventMobileCard
                      onActivate={() => {
                        closeMobileNav()
                        if (upgradeOpenTimerRef.current !== null) {
                          window.clearTimeout(upgradeOpenTimerRef.current)
                        }
                        upgradeOpenTimerRef.current = window.setTimeout(() => {
                          setUpgradeOpen(true)
                          upgradeOpenTimerRef.current = null
                        }, 260)
                      }}
                    />
                    <SidebarSignOutButton />
                  </div>
                }
              />
            </SideNavRenderContext>
          </div>
        </SheetContent>
      </Sheet>

      <SnowEventDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} />
    </>
  )
}

export function AstryxAppShell(props: AstryxAppShellProps) {
  const { i18n, t } = useTranslation()
  const { dir } = useDirection()
  const pathname = useLocation({ select: (location) => location.pathname })
  const navigate = useNavigate()
  const { logo } = useSystemConfig()
  const isAdmin = useIsAdmin()
  const initialQueryFetches = useIsFetching({
    predicate: (query) =>
      query.state.fetchStatus === 'fetching' && query.state.data === undefined,
  })
  const minimalModeQuery = useQuery({
    queryKey: minimalModeQueryKey,
    queryFn: getMinimalMode,
    enabled: isAdmin,
    retry: false,
    staleTime: 30 * 1000,
  })
  const minimalModeEnabled = minimalModeQuery.data?.enabled === true
  const shellRef = useRef<HTMLDivElement>(null)
  const minimalModeRedirectRef = useRef(false)
  const locale = toIntlLocale(i18n.resolvedLanguage ?? i18n.language) ?? 'en'

  const astryxOverrides = useMemo(
    () => ({
      [locale]: {
        '@astryx.appShell.mobileNavigation': t('Mobile navigation'),
        '@astryx.mobileNav.closeNavigation': t('Close navigation'),
        '@astryx.mobileNav.navigation': t('Navigation'),
        '@astryx.mobileNav.toggle.open': t('Open navigation'),
        '@astryx.sideNav.label': t('Navigation'),
        '@astryx.sideNavCollapseButton.collapseSidebar': t('Collapse sidebar'),
        '@astryx.sideNavCollapseButton.expandSidebar': t('Expand sidebar'),
        '@astryx.sideNavItem.collapse': t('Collapse {label}'),
        '@astryx.sideNavItem.expand': t('Expand {label}'),
      },
    }),
    [locale, t]
  )

  useEffect(() => {
    const skipLink = shellRef.current?.querySelector<HTMLAnchorElement>(
      '[data-testid="skip-to-content"]'
    )
    if (skipLink) skipLink.textContent = t('Skip to Main')
  }, [i18n.resolvedLanguage, t])

  useEffect(() => {
    if (!minimalModeEnabled || !isMinimalModeRestrictedPath(pathname)) {
      minimalModeRedirectRef.current = false
      return
    }
    if (minimalModeRedirectRef.current) return

    minimalModeRedirectRef.current = true
    toast.info(t('Not available'))
    void navigate({
      to: MINIMAL_MODE_REDIRECT_PATH,
      params: { section: 'minimal' },
      replace: true,
    })
  }, [minimalModeEnabled, navigate, pathname, t])

  return (
    <InternationalizationProvider
      locale={locale}
      dir={dir}
      overrides={astryxOverrides}
    >
      <LinkProvider component={Link}>
        <>
          <AppShell
            ref={shellRef}
            className='snowapi-astryx-shell'
            data-visual-region='console-shell'
            variant='surface'
            height='fill'
            contentPadding={0}
            mobileNav={{
              breakpoint: 'md',
              content: (
                <SnowMobileNavigation
                  logo={logo}
                  minimalModeEnabled={minimalModeEnabled}
                />
              ),
            }}
            sideNav={
              <AstryxNavigation
                logo={logo}
                minimalModeEnabled={minimalModeEnabled}
                footer={<SidebarSignOutButton />}
              />
            }
          >
            <div
              data-visual-region='content-frame'
              className='snowapi-astryx-content @container/content'
            >
              <div
                className='snowapi-console-content-state'
                data-loading={initialQueryFetches > 0 || undefined}
              >
                {initialQueryFetches > 0 ? (
                  <ContentLoading className='snowapi-console-loading-indicator absolute inset-0 z-10 min-h-0' />
                ) : null}
                <div className='snowapi-console-loaded-content flex min-h-0 flex-1 flex-col'>
                  {props.children ?? <AnimatedOutlet />}
                </div>
              </div>
            </div>
          </AppShell>
          <SnowEventCard />
        </>
      </LinkProvider>
    </InternationalizationProvider>
  )
}
