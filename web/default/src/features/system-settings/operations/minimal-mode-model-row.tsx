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
import { useWatch, type Control } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { getLobeIcon } from '@/lib/lobe-icon'

import { PriceInput } from '../models/model-pricing-inputs'
import type { MinimalModeSourceFormValues } from './minimal-mode-form'

type MinimalModeModelRowProps = {
  control: Control<MinimalModeSourceFormValues>
  index: number
  iconKeys: string[]
  discoveredModels: string[]
  canRemove: boolean
  onRemove: () => void
}

export function MinimalModeModelRow(props: MinimalModeModelRowProps) {
  const { t } = useTranslation()
  const billingMode = useWatch({
    control: props.control,
    name: `models.${props.index}.billing_mode`,
  })
  const iconOptions = props.iconKeys.map((key) => ({
    value: key,
    label: key,
  }))
  const upstreamOptions = props.discoveredModels.map((name) => ({
    value: name,
    label: name,
  }))

  return (
    <div className='bg-muted/15 grid gap-4 rounded-[10px] border p-3 sm:grid-cols-2'>
      <FormField
        control={props.control}
        name={`models.${props.index}.display_model`}
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('Model name shown to users')}</FormLabel>
            <FormControl>
              <Input
                {...field}
                autoComplete='off'
                placeholder={t('For example: snow-coder')}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={props.control}
        name={`models.${props.index}.upstream_model`}
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('Upstream model name')}</FormLabel>
            <FormControl>
              <Combobox
                options={upstreamOptions}
                value={field.value}
                onValueChange={(value) => field.onChange(value ?? '')}
                placeholder={t('Enter or select a model')}
                searchPlaceholder={t('Search upstream models...')}
                emptyText={t('No upstream model found. Enter one manually.')}
                allowCustomValue
                openOnFocus
                className='w-full'
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={props.control}
        name={`models.${props.index}.icon_key`}
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('Model icon')}</FormLabel>
            <FormControl>
              <div className='relative'>
                <span className='pointer-events-none absolute top-1/2 left-2.5 z-10 flex -translate-y-1/2'>
                  {getLobeIcon(field.value, 17)}
                </span>
                <Combobox
                  options={iconOptions}
                  value={field.value}
                  onValueChange={(value) => field.onChange(value ?? '')}
                  placeholder={t('Select a model icon')}
                  searchPlaceholder={t('Search icons...')}
                  emptyText={t('No matching icon')}
                  openOnFocus
                  className='w-full pl-9'
                />
              </div>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={props.control}
        name={`models.${props.index}.endpoint_type`}
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('Endpoint')}</FormLabel>
            <Select
              items={[
                {
                  value: 'openai',
                  label: `${t('OpenAI Chat Completions')} · /v1/chat/completions`,
                },
                {
                  value: 'openai-response',
                  label: `${t('OpenAI Responses')} · /v1/responses`,
                },
                {
                  value: 'anthropic',
                  label: `${t('Anthropic Messages')} · /v1/messages`,
                },
              ]}
              value={field.value}
              onValueChange={field.onChange}
            >
              <FormControl>
                <SelectTrigger className='w-full'>
                  <SelectValue placeholder={t('Endpoint')} />
                </SelectTrigger>
              </FormControl>
              <SelectContent alignItemWithTrigger={false}>
                <SelectGroup>
                  <SelectItem value='openai'>
                    {t('OpenAI Chat Completions')} · /v1/chat/completions
                  </SelectItem>
                  <SelectItem value='openai-response'>
                    {t('OpenAI Responses')} · /v1/responses
                  </SelectItem>
                  <SelectItem value='anthropic'>
                    {t('Anthropic Messages')} · /v1/messages
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={props.control}
        name={`models.${props.index}.billing_mode`}
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('Pricing method')}</FormLabel>
            <Select
              items={[
                { value: 'token', label: t('By token') },
                { value: 'request', label: t('By request') },
              ]}
              value={field.value}
              onValueChange={field.onChange}
            >
              <FormControl>
                <SelectTrigger className='w-full'>
                  <SelectValue placeholder={t('Select pricing method')} />
                </SelectTrigger>
              </FormControl>
              <SelectContent alignItemWithTrigger={false}>
                <SelectGroup>
                  <SelectItem value='token'>{t('By token')}</SelectItem>
                  <SelectItem value='request'>{t('By request')}</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />

      {billingMode === 'token' ? (
        <div className='grid gap-4 sm:col-span-2 sm:grid-cols-3'>
          <FormField
            control={props.control}
            name={`models.${props.index}.input_price`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Input price')}</FormLabel>
                <FormControl>
                  <PriceInput
                    value={field.value}
                    placeholder='2'
                    onChange={field.onChange}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={props.control}
            name={`models.${props.index}.output_price`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Output price')}</FormLabel>
                <FormControl>
                  <PriceInput
                    value={field.value}
                    placeholder='2'
                    onChange={field.onChange}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={props.control}
            name={`models.${props.index}.cache_input_price`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Cache read price')}</FormLabel>
                <FormControl>
                  <PriceInput
                    value={field.value}
                    placeholder='2'
                    onChange={field.onChange}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      ) : (
        <FormField
          control={props.control}
          name={`models.${props.index}.request_price_usd`}
          render={({ field }) => (
            <FormItem className='sm:col-span-2'>
              <FormLabel>{t('USD per request')}</FormLabel>
              <FormControl>
                <Input {...field} inputMode='decimal' placeholder='0.01' />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {props.canRemove ? (
        <div className='sm:col-span-2 sm:justify-self-end'>
          <Button type='button' variant='ghost' onClick={props.onRemove}>
            {t('Remove model')}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
