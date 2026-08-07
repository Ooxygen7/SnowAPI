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
import { Cancel01Icon, Search01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useDeferredValue, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { usePricingData } from '@/features/pricing/hooks/use-pricing-data'
import {
  formatPrice,
  formatRequestPrice,
  stripTrailingZeros,
} from '@/features/pricing/lib/price'
import type {
  PricingEndpointInfo,
  PricingModel,
} from '@/features/pricing/types'
import { getLobeIconName } from '@/lib/lobe-icon'

import { ModelDetailsDialog } from './model-details-dialog'
import {
  buildCatalogEndpoints,
  mergePricingModels,
  normalizeModelName,
} from './model-list-data'
import { ModelListRow } from './model-list-row'
import type { CatalogModel, CatalogModelHealthHour } from './types'

const PERFECT_HOURLY_HEALTH: CatalogModelHealthHour[] = Array.from(
  { length: 24 },
  (_, hour) => ({
    hour,
    totalCount: 1,
    successCount: 1,
    successRate: 100,
  })
)

function formatKnownPrice(model: PricingModel, priceType: 'input' | 'output') {
  const hasRequiredRatio =
    Number.isFinite(model.model_ratio) &&
    (priceType === 'input' || Number.isFinite(model.completion_ratio))
  if (!hasRequiredRatio) return null

  const formatted = stripTrailingZeros(formatPrice(model, priceType, 'M'))
  return /nan|infinity/i.test(formatted) ? null : formatted
}

function isUnauthorizedError(error: unknown) {
  if (!error || typeof error !== 'object' || !('response' in error)) {
    return false
  }

  const response = error.response
  return Boolean(
    response &&
    typeof response === 'object' &&
    'status' in response &&
    response.status === 401
  )
}

function toCatalogModel(
  model: PricingModel,
  endpointMap: Record<string, PricingEndpointInfo>,
  fallbackProvider: string
): CatalogModel {
  const endpoints = buildCatalogEndpoints(model, endpointMap)
  const isRequestPriced = model.quota_type === 1
  const requestPrice =
    isRequestPriced && Number.isFinite(model.model_price)
      ? stripTrailingZeros(formatRequestPrice(model))
      : null

  return {
    id: normalizeModelName(model.model_name),
    name: model.model_name,
    provider:
      getLobeIconName(model.icon || model.vendor_icon) || fallbackProvider,
    providerIcon: model.icon || model.vendor_icon,
    description: model.description,
    inputPrice: isRequestPriced
      ? requestPrice
      : formatKnownPrice(model, 'input'),
    outputPrice: isRequestPriced ? null : formatKnownPrice(model, 'output'),
    priceUnitKey: isRequestPriced ? 'request' : 'Per 1M tokens',
    requestPrice,
    successRate: 100,
    hourlyHealth: PERFECT_HOURLY_HEALTH,
    endpoints,
  }
}

function LoadingRows(props: { label: string }) {
  return (
    <div aria-label={props.label} aria-busy='true'>
      {[0, 1, 2, 3, 4].map((row) => (
        <div
          key={row}
          className='grid min-h-14 grid-cols-[minmax(0,1fr)_5rem] items-center gap-4 border-b px-4 last:border-b-0 lg:grid-cols-[minmax(230px,1.8fr)_minmax(100px,0.65fr)_minmax(90px,0.55fr)_minmax(90px,0.55fr)_minmax(150px,0.9fr)_1.5rem]'
        >
          <span className='bg-muted h-3 w-40 animate-pulse rounded' />
          <span className='bg-muted h-3 w-16 animate-pulse rounded' />
          <span className='bg-muted hidden h-3 w-14 animate-pulse rounded lg:block' />
          <span className='bg-muted hidden h-3 w-14 animate-pulse rounded lg:block' />
          <span className='bg-muted hidden h-3 w-28 animate-pulse rounded lg:block' />
        </div>
      ))}
    </div>
  )
}

export function ModelList() {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null)
  const [isDetailsOpen, setIsDetailsOpen] = useState(false)
  const deferredSearch = useDeferredValue(search)
  const {
    models,
    endpointMap,
    error,
    isLoading,
    refetch: refetchCatalog,
  } = usePricingData()
  const catalogModels = useMemo(
    () =>
      mergePricingModels(models).map((model) =>
        toCatalogModel(model, endpointMap, t('Unknown'))
      ),
    [endpointMap, models, t]
  )

  const filteredModels = useMemo(() => {
    const query = deferredSearch.trim().toLocaleLowerCase('en-US')
    if (!query) return catalogModels

    return catalogModels.filter((model) =>
      [
        model.name,
        model.provider,
        model.description,
        model.inputPrice,
        model.outputPrice,
        ...model.endpoints,
      ]
        .filter(Boolean)
        .some((value) =>
          String(value).toLocaleLowerCase('en-US').includes(query)
        )
    )
  }, [catalogModels, deferredSearch])

  const selectedModel = useMemo(
    () => catalogModels.find((model) => model.id === selectedModelId) ?? null,
    [catalogModels, selectedModelId]
  )
  let modelListContent

  if (isLoading) {
    modelListContent = <LoadingRows label={t('Loading...')} />
  } else if (error) {
    modelListContent = (
      <div className='px-4 py-14 text-center' role='alert'>
        <p className='text-sm font-medium'>
          {isUnauthorizedError(error)
            ? t('Please sign in')
            : t('Failed to fetch models')}
        </p>
        <Button
          type='button'
          variant='outline'
          size='sm'
          className='mt-3'
          onClick={() => void refetchCatalog()}
        >
          {t('Retry')}
        </Button>
      </div>
    )
  } else if (filteredModels.length > 0) {
    modelListContent = (
      <ul aria-live='polite' data-visual-region='model-list-rows'>
        {filteredModels.map((model) => (
          <ModelListRow
            key={model.id}
            model={model}
            onSelect={(modelId) => {
              setSelectedModelId(modelId)
              setIsDetailsOpen(true)
            }}
          />
        ))}
      </ul>
    )
  } else {
    modelListContent = (
      <div className='px-4 py-14 text-center'>
        <p className='text-sm font-medium'>{t('No models found.')}</p>
        <p className='text-muted-foreground mt-1 text-xs'>
          {t('Try a different model name or provider.')}
        </p>
      </div>
    )
  }

  return (
    <>
      <SectionPageLayout data-visual-region='model-list'>
        <SectionPageLayout.Content>
          <div className='flex w-full flex-col gap-4 pt-5 sm:pt-8'>
            <div
              data-slot='model-list-toolbar'
              data-visual-region='model-list-search'
              className='relative w-full sm:w-80'
            >
              <HugeiconsIcon
                icon={Search01Icon}
                size={16}
                strokeWidth={2}
                className='text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2'
                aria-hidden='true'
              />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('Search models...')}
                aria-label={t('Search models...')}
                className='bg-background pr-8 pl-8 shadow-none'
              />
              {search ? (
                <Button
                  type='button'
                  variant='ghost'
                  size='icon-xs'
                  className='absolute top-1/2 right-1 -translate-y-1/2'
                  onClick={() => setSearch('')}
                  aria-label={t('Clear search')}
                >
                  <HugeiconsIcon
                    icon={Cancel01Icon}
                    strokeWidth={2}
                    aria-hidden='true'
                  />
                </Button>
              ) : null}
            </div>

            <div
              data-slot='model-list-card'
              className='snowapi-rainflow-panel overflow-hidden'
            >
              <div
                data-visual-region='model-list-table-header'
                className='text-muted-foreground hidden h-9 grid-cols-[minmax(230px,1.8fr)_minmax(100px,0.65fr)_minmax(90px,0.55fr)_minmax(90px,0.55fr)_minmax(150px,0.9fr)_1.5rem] items-center gap-x-4 border-b px-4 text-xs font-medium lg:grid'
              >
                <span>{t('Model')}</span>
                <span>{t('Provider')}</span>
                <span>{t('Input price')}</span>
                <span>{t('Output price')}</span>
                <span>{t('Health')}</span>
                <span className='sr-only'>{t('Actions')}</span>
              </div>

              {modelListContent}
            </div>
          </div>
        </SectionPageLayout.Content>
      </SectionPageLayout>

      <ModelDetailsDialog
        model={selectedModel}
        open={isDetailsOpen}
        onOpenChange={setIsDetailsOpen}
      />
    </>
  )
}
