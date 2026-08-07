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
import { Search, SlidersHorizontal } from 'lucide-react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'

import type { IPAuditAnomalyFilter, IPAuditParams, IPAuditSort } from '../types'

export type ThresholdDraft = {
  request: string
  users: string
  rpm: string
}

type IPAuditFiltersProps = {
  params: IPAuditParams
  query: string
  draft: ThresholdDraft
  onQueryChange: (value: string) => void
  onWindowChange: (value: number) => void
  onAnomalyChange: (value: IPAuditAnomalyFilter) => void
  onSortChange: (value: IPAuditSort) => void
  onDraftChange: (value: ThresholdDraft) => void
  onApplyThresholds: () => void
}

export function IPAuditFilters({
  params,
  query,
  draft,
  onQueryChange,
  onWindowChange,
  onAnomalyChange,
  onSortChange,
  onDraftChange,
  onApplyThresholds,
}: IPAuditFiltersProps) {
  const { t } = useTranslation()

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onApplyThresholds()
  }

  return (
    <Card size='sm'>
      <CardContent className='space-y-3'>
        <div className='flex flex-col gap-2 lg:flex-row lg:items-center'>
          <label className='relative min-w-0 flex-1'>
            <span className='sr-only'>{t('Search IP address')}</span>
            <Search className='text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2' />
            <Input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder={t('Search IP address')}
              className='pl-8'
            />
          </label>
          <div className='grid grid-cols-2 gap-2 sm:grid-cols-3 lg:flex'>
            <NativeSelect
              value={params.windowMinutes}
              onChange={(event) => onWindowChange(Number(event.target.value))}
              aria-label={t('Audit window')}
              className='w-full lg:w-auto'
            >
              <NativeSelectOption value={60}>
                {t('Last hour')}
              </NativeSelectOption>
              <NativeSelectOption value={360}>
                {t('Last 6 hours')}
              </NativeSelectOption>
              <NativeSelectOption value={1440}>
                {t('Last 24 hours')}
              </NativeSelectOption>
              <NativeSelectOption value={10080}>
                {t('Last 7 days')}
              </NativeSelectOption>
              <NativeSelectOption value={43200}>
                {t('Last 30 days')}
              </NativeSelectOption>
            </NativeSelect>
            <NativeSelect
              value={params.anomaly}
              onChange={(event) =>
                onAnomalyChange(event.target.value as IPAuditAnomalyFilter)
              }
              aria-label={t('Anomaly filter')}
              className='w-full lg:w-auto'
            >
              <NativeSelectOption value='all'>
                {t('All IPs')}
              </NativeSelectOption>
              <NativeSelectOption value='any'>
                {t('Any anomaly')}
              </NativeSelectOption>
              <NativeSelectOption value='count'>
                {t('Count anomalies')}
              </NativeSelectOption>
              <NativeSelectOption value='rpm'>
                {t('RPM anomalies')}
              </NativeSelectOption>
              <NativeSelectOption value='normal'>
                {t('Normal only')}
              </NativeSelectOption>
            </NativeSelect>
            <NativeSelect
              value={params.sort}
              onChange={(event) =>
                onSortChange(event.target.value as IPAuditSort)
              }
              aria-label={t('Sort IP audit')}
              className='col-span-2 w-full sm:col-span-1 lg:w-auto'
            >
              <NativeSelectOption value='risk'>
                {t('Risk first')}
              </NativeSelectOption>
              <NativeSelectOption value='requests'>
                {t('Most requests')}
              </NativeSelectOption>
              <NativeSelectOption value='rpm'>
                {t('Highest RPM')}
              </NativeSelectOption>
              <NativeSelectOption value='users'>
                {t('Most users')}
              </NativeSelectOption>
              <NativeSelectOption value='recent'>
                {t('Most recent')}
              </NativeSelectOption>
            </NativeSelect>
          </div>
        </div>

        <form
          className='border-border/70 flex flex-col gap-2 border-t pt-3 lg:flex-row lg:items-end'
          onSubmit={handleSubmit}
        >
          <div className='text-muted-foreground flex items-center gap-2 pb-1 text-xs font-medium lg:w-32'>
            <SlidersHorizontal className='size-3.5' />
            {t('Alert thresholds')}
          </div>
          <div className='grid flex-1 grid-cols-1 gap-2 sm:grid-cols-3'>
            <ThresholdInput
              label={t('Requests in window')}
              value={draft.request}
              onChange={(request) => onDraftChange({ ...draft, request })}
            />
            <ThresholdInput
              label={t('Users per IP')}
              value={draft.users}
              onChange={(users) => onDraftChange({ ...draft, users })}
            />
            <ThresholdInput
              label={t('Peak RPM')}
              value={draft.rpm}
              onChange={(rpm) => onDraftChange({ ...draft, rpm })}
            />
          </div>
          <Button type='submit' variant='outline' size='sm'>
            {t('Apply thresholds')}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function ThresholdInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className='space-y-1'>
      <span className='text-muted-foreground text-[11px] font-medium'>
        {label}
      </span>
      <Input
        type='number'
        min={1}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        inputMode='numeric'
      />
    </label>
  )
}
