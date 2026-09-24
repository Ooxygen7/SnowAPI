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
import { ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import { ModelFundingBadge } from './model-funding-badge'
import { ModelHealthBar } from './model-health-bar'
import { ModelProvider } from './model-provider'
import type { CatalogModel } from './types'

function PriceCell(props: {
  label: string
  price: string | null
  priceUnit: string
}) {
  const { t } = useTranslation()

  return (
    <div className='min-w-0'>
      <span className='text-muted-foreground mb-1 block text-[10px] lg:sr-only'>
        {props.label}
      </span>
      <div className='font-mono text-sm font-semibold tabular-nums'>
        {props.price ?? t('No data')}
      </div>
      {props.price ? (
        <div className='text-muted-foreground mt-0.5 text-[10px]'>
          {props.priceUnit}
        </div>
      ) : null}
    </div>
  )
}

export function ModelListRow(props: {
  model: CatalogModel
  onSelect: (modelId: string) => void
}) {
  const { t } = useTranslation()
  const priceUnit = t(props.model.priceUnitKey)
  let fundingLabel = ''
  if (props.model.fundingSource === 'subscription_only') {
    fundingLabel = t('Subscription only')
  }
  if (props.model.fundingSource === 'wallet_only') {
    fundingLabel = t('Balance only')
  }

  return (
    <li className='content-auto border-b last:border-b-0'>
      <button
        type='button'
        data-press-animation='none'
        className='group relative grid w-full grid-cols-[minmax(0,1fr)_1.5rem] gap-x-3 gap-y-3 overflow-hidden px-4 py-3 text-left outline-none lg:min-h-14 lg:grid-cols-[minmax(230px,1.8fr)_minmax(100px,0.65fr)_minmax(90px,0.55fr)_minmax(90px,0.55fr)_minmax(150px,0.9fr)_1.5rem] lg:items-center lg:gap-x-4'
        onClick={() => props.onSelect(props.model.id)}
        aria-label={[
          props.model.name,
          fundingLabel,
          t('Click to view full details'),
        ]
          .filter(Boolean)
          .join('. ')}
      >
        <span
          aria-hidden='true'
          className='from-accent/5 via-accent/45 to-primary/10 pointer-events-none absolute inset-0 bg-gradient-to-r opacity-0 transition-opacity duration-240 ease-out group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none'
        />

        <div className='relative min-w-0 pr-7 lg:pr-0'>
          <div className='flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1'>
            <code className='max-w-full min-w-0 truncate text-sm font-semibold tracking-[-0.01em]'>
              {props.model.name}
            </code>
            <span
              className={cn(
                'inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[10px] font-medium leading-none',
                props.model.hasAccess
                  ? 'bg-foreground text-background'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              {props.model.hasAccess ? t('Available') : t('No access')}
            </span>
            <ModelFundingBadge source={props.model.fundingSource} />
          </div>
          {props.model.description ? (
            <p className='text-muted-foreground mt-0.5 line-clamp-1 text-xs'>
              {props.model.description}
            </p>
          ) : null}
        </div>

        <div className='relative col-span-2 grid grid-cols-2 gap-3 lg:contents'>
          <div className='col-span-2 min-w-0 lg:col-span-1'>
            <span className='text-muted-foreground mb-1 block text-[10px] lg:sr-only'>
              {t('Provider')}
            </span>
            <ModelProvider model={props.model} />
          </div>

          <PriceCell
            label={t('Input price')}
            price={props.model.inputPrice}
            priceUnit={priceUnit}
          />
          <PriceCell
            label={t('Output price')}
            price={props.model.outputPrice}
            priceUnit={priceUnit}
          />

          <div className='col-span-2 min-w-0 lg:col-span-1'>
            <span className='text-muted-foreground mb-0.5 block w-full text-[10px] lg:sr-only'>
              {t('Health')}
            </span>
            <ModelHealthBar
              modelName={props.model.name}
              successRate={props.model.successRate}
              hourlyHealth={props.model.hourlyHealth}
            />
          </div>
        </div>

        <HugeiconsIcon
          icon={ArrowRight01Icon}
          size={16}
          strokeWidth={2}
          className='text-muted-foreground group-hover:text-foreground group-focus-visible:text-foreground absolute top-3 right-3 transition-colors duration-300 lg:static'
          aria-hidden='true'
        />
      </button>
    </li>
  )
}
