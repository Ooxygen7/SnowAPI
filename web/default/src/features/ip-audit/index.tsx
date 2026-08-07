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
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Activity, Network, RefreshCw, ShieldAlert, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useDebounce } from '@/hooks'
import { toIntlLocale } from '@/i18n/languages'

import { getRelayBanReadiness, getRelayBans, getRelayRisk } from './api'
import {
  BanActionDialog,
  type RelayBanAction,
} from './components/ban-action-dialog'
import { BanDetailsDialog } from './components/ban-details-dialog'
import { RelayBansTable } from './components/relay-bans-table'
import { RelayRiskTable } from './components/relay-risk-table'
import type {
  RelayBanListItem,
  RelayBanReadiness,
  RelayRiskItem,
} from './types'

type ActiveDialog = {
  action: RelayBanAction
  user?: { id: number; username: string }
} | null

type DetailsDialog = {
  user: { id: number; username: string }
  ban?: RelayBanListItem['ban']
  evidence?: RelayRiskItem['evidence']
} | null

export function IPAudit() {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<'risk' | 'bans'>('risk')
  const [riskPage, setRiskPage] = useState(1)
  const [riskSearch, setRiskSearch] = useState('')
  const [riskSort, setRiskSort] = useState<'recent' | 'requests' | 'oldest'>(
    'recent'
  )
  const [banPage, setBanPage] = useState(1)
  const [banSearch, setBanSearch] = useState('')
  const [banStatus, setBanStatus] = useState<'all' | 'active' | 'inactive'>(
    'all'
  )
  const [activeDialog, setActiveDialog] = useState<ActiveDialog>(null)
  const [detailsDialog, setDetailsDialog] = useState<DetailsDialog>(null)
  const debouncedRiskSearch = useDebounce(riskSearch, 350)
  const debouncedBanSearch = useDebounce(banSearch, 350)

  const riskQuery = useQuery({
    queryKey: ['relay-risk', riskPage, debouncedRiskSearch, riskSort],
    queryFn: () =>
      getRelayRisk({
        page: riskPage,
        pageSize: 20,
        query: debouncedRiskSearch,
        sort: riskSort,
      }),
    placeholderData: (previous) => previous,
    refetchInterval: 30_000,
  })
  const bansQuery = useQuery({
    queryKey: ['relay-bans', banPage, debouncedBanSearch, banStatus],
    queryFn: () =>
      getRelayBans({
        page: banPage,
        pageSize: 20,
        query: debouncedBanSearch,
        status: banStatus,
      }),
    placeholderData: (previous) => previous,
    refetchInterval: 30_000,
  })
  const readinessQuery = useQuery({
    queryKey: ['relay-ban-readiness'],
    queryFn: getRelayBanReadiness,
    refetchInterval: 30_000,
  })

  const riskData = riskQuery.data?.data.risk
  const readiness = riskQuery.data?.data.readiness ?? readinessQuery.data
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const numberFormat = useMemo(() => new Intl.NumberFormat(locale), [locale])
  const dateTimeFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }),
    [locale]
  )
  const formatTime = (timestamp: number) =>
    timestamp > 0 ? dateTimeFormat.format(new Date(timestamp * 1000)) : '—'
  const isFetching =
    riskQuery.isFetching || bansQuery.isFetching || readinessQuery.isFetching

  function refreshAll() {
    void queryClient.invalidateQueries({ queryKey: ['relay-risk'] })
    void queryClient.invalidateQueries({ queryKey: ['relay-bans'] })
    void queryClient.invalidateQueries({ queryKey: ['relay-ban-readiness'] })
  }

  function completeMutation() {
    refreshAll()
    void queryClient.invalidateQueries({ queryKey: ['relay-ban-events'] })
    void queryClient.invalidateQueries({ queryKey: ['relay-ban-self'] })
  }

  function inspectRisk(item: RelayRiskItem) {
    setDetailsDialog({
      user: { id: item.user_id, username: item.username },
      ban: item.ban,
      evidence: item.evidence,
    })
  }

  function inspectBan(item: RelayBanListItem) {
    setDetailsDialog({
      user: { id: item.ban.user_id, username: item.username },
      ban: item.ban,
    })
  }

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('IP Audit')}</SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        <Button
          variant='outline'
          size='sm'
          onClick={() => setActiveDialog({ action: 'apply' })}
        >
          {t('Manual relay ban')}
        </Button>
        <Button
          variant='ghost'
          size='sm'
          onClick={refreshAll}
          disabled={isFetching}
        >
          <RefreshCw className={isFetching ? 'animate-spin' : undefined} />
          {t('Refresh')}
        </Button>
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <div className='space-y-3'>
          <ReadinessBanner readiness={readiness} />
          <RiskSummary
            data={riskData?.summary}
            loading={riskQuery.isLoading}
            numberFormat={numberFormat}
          />

          {(riskQuery.isError ||
            bansQuery.isError ||
            readinessQuery.isError) && (
            <div
              role='alert'
              className='border-destructive/30 bg-destructive/5 text-destructive rounded-lg border px-4 py-3 text-sm'
            >
              {t('Request failed')}
            </div>
          )}

          <Tabs
            value={tab}
            onValueChange={(value) => setTab(value as 'risk' | 'bans')}
          >
            <TabsList variant='line'>
              <TabsTrigger value='risk'>{t('Recent risk')}</TabsTrigger>
              <TabsTrigger value='bans'>{t('Banned users')}</TabsTrigger>
            </TabsList>

            <TabsContent value='risk' className='space-y-3'>
              <FilterBar>
                <Input
                  value={riskSearch}
                  onChange={(event) => {
                    setRiskSearch(event.target.value)
                    setRiskPage(1)
                  }}
                  placeholder={t('Search users')}
                  aria-label={t('Search users')}
                />
                <NativeSelect
                  value={riskSort}
                  onChange={(event) => {
                    setRiskSort(event.target.value as typeof riskSort)
                    setRiskPage(1)
                  }}
                  aria-label={t('Sort')}
                >
                  <NativeSelectOption value='recent'>
                    {t('Most recent')}
                  </NativeSelectOption>
                  <NativeSelectOption value='requests'>
                    {t('Most requests')}
                  </NativeSelectOption>
                  <NativeSelectOption value='oldest'>
                    {t('Oldest')}
                  </NativeSelectOption>
                </NativeSelect>
              </FilterBar>
              <RelayRiskTable
                data={riskData}
                loading={riskQuery.isLoading}
                page={riskPage}
                formatTime={formatTime}
                onPageChange={setRiskPage}
                onInspect={inspectRisk}
                onBan={(item) =>
                  setActiveDialog({
                    action: 'apply',
                    user: { id: item.user_id, username: item.username },
                  })
                }
              />
            </TabsContent>

            <TabsContent value='bans' className='space-y-3'>
              <FilterBar>
                <Input
                  value={banSearch}
                  onChange={(event) => {
                    setBanSearch(event.target.value)
                    setBanPage(1)
                  }}
                  placeholder={t('Search users')}
                  aria-label={t('Search users')}
                />
                <NativeSelect
                  value={banStatus}
                  onChange={(event) => {
                    setBanStatus(event.target.value as typeof banStatus)
                    setBanPage(1)
                  }}
                  aria-label={t('Status')}
                >
                  <NativeSelectOption value='all'>
                    {t('All')}
                  </NativeSelectOption>
                  <NativeSelectOption value='active'>
                    {t('Active')}
                  </NativeSelectOption>
                  <NativeSelectOption value='inactive'>
                    {t('Inactive')}
                  </NativeSelectOption>
                </NativeSelect>
              </FilterBar>
              <RelayBansTable
                data={bansQuery.data}
                loading={bansQuery.isLoading}
                page={banPage}
                formatTime={formatTime}
                onPageChange={setBanPage}
                onInspect={inspectBan}
                onExtend={(item) =>
                  setActiveDialog({
                    action: 'extend',
                    user: { id: item.ban.user_id, username: item.username },
                  })
                }
                onRevoke={(item) =>
                  setActiveDialog({
                    action: 'revoke',
                    user: { id: item.ban.user_id, username: item.username },
                  })
                }
              />
            </TabsContent>
          </Tabs>
          <a
            href='https://db-ip.com'
            target='_blank'
            rel='noreferrer'
            className='text-muted-foreground hover:text-foreground inline-flex text-xs transition-colors'
          >
            IP Geolocation by DB-IP
          </a>
        </div>
      </SectionPageLayout.Content>

      {activeDialog && (
        <BanActionDialog
          open
          action={activeDialog.action}
          user={activeDialog.user}
          onOpenChange={(open) => !open && setActiveDialog(null)}
          onCompleted={completeMutation}
        />
      )}
      {detailsDialog && (
        <BanDetailsDialog
          open
          user={detailsDialog.user}
          ban={detailsDialog.ban}
          evidence={detailsDialog.evidence}
          formatTime={formatTime}
          onOpenChange={(open) => !open && setDetailsDialog(null)}
        />
      )}
    </SectionPageLayout>
  )
}

function FilterBar({ children }: { children: React.ReactNode }) {
  return (
    <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between [&_[data-slot=native-select-wrapper]]:w-full sm:[&_[data-slot=native-select-wrapper]]:w-48 [&>input]:w-full sm:[&>input]:max-w-sm'>
      {children}
    </div>
  )
}

function ReadinessBanner({ readiness }: { readiness?: RelayBanReadiness }) {
  const { t } = useTranslation()
  if (!readiness) return null
  const ready = readiness.enforced_ready
  return (
    <div
      className={
        ready
          ? 'bg-muted/25 flex flex-wrap items-center gap-2 rounded-lg px-3 py-2.5 text-xs'
          : 'flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2.5 text-xs'
      }
    >
      <span className='font-medium'>{t('Automatic enforcement')}</span>
      <Badge
        variant={
          readiness.effective_mode === 'enforced' ? 'destructive' : 'outline'
        }
      >
        {enforcementModeLabel(t, readiness.effective_mode)}
      </Badge>
      <Badge variant={readiness.proxy_ready ? 'secondary' : 'outline'}>
        {t('Trusted proxy')}:{' '}
        {readiness.proxy_ready ? t('Ready') : t('Not ready')}
      </Badge>
      <Badge variant={readiness.resolver.ready ? 'secondary' : 'outline'}>
        {t('GeoIP resolver')}:{' '}
        {readiness.resolver.ready ? t('Ready') : t('Not ready')}
      </Badge>
      {readiness.configured_mode !== readiness.effective_mode && (
        <span className='text-amber-700 dark:text-amber-300'>
          {t('Configured mode is inactive until all readiness checks pass.')}
        </span>
      )}
    </div>
  )
}

function RiskSummary({
  data,
  loading,
  numberFormat,
}: {
  data?: {
    total_users: number
    total_requests: number
    triggering_users: number
    actively_banned: number
  }
  loading: boolean
  numberFormat: Intl.NumberFormat
}) {
  const { t } = useTranslation()
  const metrics = [
    { label: t('Users in window'), value: data?.total_users, icon: Users },
    { label: t('Relay requests'), value: data?.total_requests, icon: Activity },
    {
      label: t('Rule matches on page'),
      value: data?.triggering_users,
      icon: Network,
    },
    {
      label: t('Active bans on page'),
      value: data?.actively_banned,
      icon: ShieldAlert,
    },
  ]
  return (
    <div className='snowapi-rainflow-panel grid gap-px overflow-hidden sm:grid-cols-2 xl:grid-cols-4'>
      {metrics.map((metric) => (
        <div
          key={metric.label}
          className='bg-background flex items-center justify-between gap-3 px-4 py-3'
        >
          <div>
            <div className='text-muted-foreground text-xs'>{metric.label}</div>
            <div className='mt-1 text-xl font-semibold tabular-nums'>
              {loading ? '—' : numberFormat.format(metric.value ?? 0)}
            </div>
          </div>
          <metric.icon className='text-muted-foreground size-4' />
        </div>
      ))}
    </div>
  )
}

function enforcementModeLabel(
  t: (key: string) => string,
  mode: RelayBanReadiness['effective_mode']
) {
  if (mode === 'enforced') return t('Enforced')
  if (mode === 'shadow') return t('Shadow')
  return t('Disabled')
}
