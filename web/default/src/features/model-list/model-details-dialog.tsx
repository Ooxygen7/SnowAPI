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
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import { ModelHealthBar } from './model-health-bar'
import { ModelProvider } from './model-provider'
import type { CatalogModel } from './types'

function PriceCard(props: {
  label: string
  price: string | null
  unit: string
}) {
  const { t } = useTranslation()

  return (
    <div className='bg-muted/20 rounded-[10px] border p-3'>
      <div className='text-muted-foreground text-xs'>{props.label}</div>
      <div className='mt-1.5 font-mono text-lg font-semibold tabular-nums'>
        {props.price ?? t('No data')}
      </div>
      {props.price ? (
        <div className='text-muted-foreground mt-1 text-xs'>{props.unit}</div>
      ) : null}
    </div>
  )
}

function EndpointList(props: { endpoints: string[]; emptyLabel: string }) {
  if (props.endpoints.length === 0) {
    return <span className='text-muted-foreground'>{props.emptyLabel}</span>
  }

  return (
    <div className='flex min-w-0 flex-col gap-1.5'>
      {props.endpoints.map((endpoint) => {
        const separatorIndex = endpoint.indexOf(' ')
        const method =
          separatorIndex > 0 ? endpoint.slice(0, separatorIndex) : 'POST'
        const path =
          separatorIndex > 0 ? endpoint.slice(separatorIndex + 1) : endpoint

        return (
          <div key={endpoint} className='flex min-w-0 items-baseline gap-3'>
            <span className='text-muted-foreground w-8 shrink-0 font-mono text-[10px] font-semibold tracking-wide'>
              {method}
            </span>
            <code className='text-foreground min-w-0 text-xs break-all'>
              {path}
            </code>
          </div>
        )
      })}
    </div>
  )
}

function DialogSection(props: { title: string; children: ReactNode }) {
  return (
    <section className='flex min-h-0 flex-col gap-3'>
      <h3 className='text-sm font-semibold'>{props.title}</h3>
      {props.children}
    </section>
  )
}

export function ModelDetailsDialog(props: {
  model: CatalogModel | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const { model } = props

  if (!model) return null

  const priceUnit = t(model.priceUnitKey)

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        data-visual-region='model-details-dialog'
        className='h-[min(580px,calc(100dvh-2rem))] w-[672px] max-w-[calc(100%-2rem)] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:max-w-2xl'
      >
        <CopyButton
          value={model.name}
          tooltip={t('Copy model name')}
          successTooltip={t('Copied!')}
          aria-label={t('Copy model name')}
          className='absolute top-2 right-11'
        />

        <DialogHeader className='border-b px-5 py-4 pr-24 sm:px-6 sm:pr-24'>
          <ModelProvider model={model} />
          <DialogTitle className='font-mono text-lg font-semibold sm:text-xl'>
            {model.name}
          </DialogTitle>
          {model.description ? (
            <DialogDescription className='line-clamp-2 leading-relaxed'>
              {model.description}
            </DialogDescription>
          ) : (
            <DialogDescription className='sr-only'>
              {t('Model details')}: {model.name}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className='flex min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain px-5 py-3 sm:px-6 [&>section]:shrink-0'>
          <DialogSection title={t('Price')}>
            {model.priceUnitKey === 'request' ? (
              <PriceCard
                label={t('Fixed request price')}
                price={model.requestPrice}
                unit={t('request')}
              />
            ) : (
              <div className='grid grid-cols-2 gap-3'>
                <PriceCard
                  label={t('Input price')}
                  price={model.inputPrice}
                  unit={priceUnit}
                />
                <PriceCard
                  label={t('Output price')}
                  price={model.outputPrice}
                  unit={priceUnit}
                />
              </div>
            )}
          </DialogSection>

          <DialogSection title={t('Health')}>
            <div className='bg-muted/20 rounded-[10px] border p-3'>
              <ModelHealthBar
                modelName={model.name}
                successRate={model.successRate}
                hourlyHealth={model.hourlyHealth}
                showLabel
              />
            </div>
          </DialogSection>

          <DialogSection title={t('Model details')}>
            <dl className='bg-muted/20 min-h-0 flex-1 rounded-[10px] px-4 py-3'>
              <div className='grid grid-cols-2 gap-4 pb-3 sm:gap-8'>
                <div className='min-w-0'>
                  <dt className='text-muted-foreground text-xs'>
                    {t('Model')}
                  </dt>
                  <dd className='mt-1.5 min-w-0 text-sm'>
                    <code className='font-medium break-all'>{model.name}</code>
                  </dd>
                </div>
                <div className='min-w-0'>
                  <dt className='text-muted-foreground text-xs'>
                    {t('Provider')}
                  </dt>
                  <dd className='mt-1.5 min-w-0 text-sm'>
                    <ModelProvider model={model} />
                  </dd>
                </div>
              </div>
              <div className='border-border/60 border-t pt-3'>
                <dt className='text-muted-foreground text-xs'>
                  {t('API Endpoints')}
                </dt>
                <dd className='mt-2 min-w-0 text-sm'>
                  <EndpointList
                    endpoints={model.endpoints}
                    emptyLabel={t('No data')}
                  />
                </dd>
              </div>
            </dl>
          </DialogSection>
        </div>
      </DialogContent>
    </Dialog>
  )
}
