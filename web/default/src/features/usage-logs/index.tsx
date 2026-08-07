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
import { getRouteApi } from '@tanstack/react-router'
import {
  ChartNoAxesColumnIncreasing,
  Ellipsis,
  ReceiptText,
} from 'lucide-react'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CacheStatsDialog } from '@/features/system-settings/general/channel-affinity/cache-stats-dialog'

import { UserInfoDialog } from './components/dialogs/user-info-dialog'
import {
  type LogsViewScope,
  UsageLogsProvider,
  useLogsViewScope,
  useUsageLogsContext,
} from './components/usage-logs-provider'
import { UsageLogsTable } from './components/usage-logs-table'
import type { UsageLogView } from './types'

const route = getRouteApi('/_authenticated/usage-logs/$section')
const LOG_VIEWS = [
  {
    id: 'consume',
    labelKey: 'Consume',
    icon: ChartNoAxesColumnIncreasing,
  },
  {
    id: 'billing',
    labelKey: 'Bills',
    icon: ReceiptText,
  },
  {
    id: 'other',
    labelKey: 'Other',
    icon: Ellipsis,
  },
] as const

function isUsageLogView(value: string): value is UsageLogView {
  return LOG_VIEWS.some((view) => view.id === value)
}

function UsageLogsContent() {
  const { t } = useTranslation()
  const navigate = route.useNavigate()
  const searchParams = route.useSearch()
  const activeView: UsageLogView = searchParams.category ?? 'consume'
  const {
    selectedUserId,
    userInfoDialogOpen,
    setUserInfoDialogOpen,
    affinityTarget,
    affinityDialogOpen,
    setAffinityDialogOpen,
  } = useUsageLogsContext()
  const { canManageScope, viewScope, setViewScope } = useLogsViewScope()
  const handleViewScopeChange = useCallback(
    (scope: string) => {
      if (scope === 'all' || scope === 'self') {
        setViewScope(scope as LogsViewScope)
      }
    },
    [setViewScope]
  )
  const handleLogViewChange = useCallback(
    (value: string) => {
      if (!isUsageLogView(value) || value === activeView) return
      navigate({
        to: '/usage-logs/$section',
        params: { section: 'common' },
        search: {
          ...searchParams,
          category: value,
          page: 1,
        },
      })
    },
    [activeView, navigate, searchParams]
  )

  return (
    <>
      <SectionPageLayout fixedContent>
        <SectionPageLayout.Title>{t('Usage Logs')}</SectionPageLayout.Title>
        <SectionPageLayout.Description>
          {t('API usage records')}
        </SectionPageLayout.Description>
        {canManageScope && (
          <SectionPageLayout.Actions>
            <Tabs value={viewScope} onValueChange={handleViewScopeChange}>
              <TabsList>
                <TabsTrigger value='all'>{t('All')}</TabsTrigger>
                <TabsTrigger value='self'>{t('Only Mine')}</TabsTrigger>
              </TabsList>
            </Tabs>
          </SectionPageLayout.Actions>
        )}
        <SectionPageLayout.Content>
          <div className='flex h-full min-h-0 flex-col gap-4'>
            <Tabs
              value={activeView}
              onValueChange={handleLogViewChange}
              className='shrink-0'
            >
              <TabsList
                aria-label={t('Usage Logs')}
                className='bg-muted/45 h-10 rounded-xl p-1 group-data-horizontal/tabs:h-10'
              >
                {LOG_VIEWS.map((view) => {
                  const Icon = view.icon
                  return (
                    <TabsTrigger
                      key={view.id}
                      value={view.id}
                      className='data-active:border-foreground h-8 rounded-lg px-3 data-active:shadow-none'
                    >
                      <Icon aria-hidden='true' />
                      {t(view.labelKey)}
                    </TabsTrigger>
                  )
                })}
              </TabsList>
            </Tabs>
            <div className='min-h-0 flex-1'>
              <UsageLogsTable logView={activeView} />
            </div>
          </div>
        </SectionPageLayout.Content>
      </SectionPageLayout>

      <UserInfoDialog
        userId={selectedUserId}
        open={userInfoDialogOpen}
        onOpenChange={setUserInfoDialogOpen}
      />

      <CacheStatsDialog
        open={affinityDialogOpen}
        onOpenChange={setAffinityDialogOpen}
        target={
          affinityTarget
            ? {
                rule_name: affinityTarget.rule_name || '',
                using_group:
                  affinityTarget.using_group ||
                  affinityTarget.selected_group ||
                  '',
                key_hint: affinityTarget.key_hint || '',
                key_fp: affinityTarget.key_fp || '',
              }
            : null
        }
      />
    </>
  )
}

export function UsageLogs() {
  return (
    <UsageLogsProvider>
      <UsageLogsContent />
    </UsageLogsProvider>
  )
}
