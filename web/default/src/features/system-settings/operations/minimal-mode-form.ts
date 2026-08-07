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
import type { TFunction } from 'i18next'
import * as z from 'zod'

import { formatPricingNumber } from '../models/pricing-format'
import type {
  MinimalModeModel,
  MinimalModeSource,
  MinimalModeSourceInput,
} from './minimal-mode-types'

export function createMinimalModeSourceSchema(t: TFunction) {
  return z
    .object({
      name: z.string().trim().min(1, t('Enter a source name')).max(128),
      base_url: z
        .string()
        .trim()
        .url(t('Enter a valid HTTP or HTTPS base URL'))
        .refine(
          (value) =>
            value.startsWith('http://') || value.startsWith('https://'),
          t('Enter a valid HTTP or HTTPS base URL')
        ),
      channel_type: z.coerce.number().int().positive(),
      api_key: z.string().max(65536),
      groups: z.array(z.string()).min(1, t('Select at least one user group')),
      models: z
        .array(
          z.object({
            display_model: z
              .string()
              .trim()
              .min(1, t('Enter the model name shown to users'))
              .max(128),
            upstream_model: z
              .string()
              .trim()
              .min(1, t('Enter or select the upstream model name'))
              .max(255),
            icon_key: z.string().min(1, t('Select a model icon')),
            endpoint_type: z.enum([
              'openai',
              'openai-response',
              'anthropic',
            ]),
            billing_mode: z.enum(['token', 'request']),
            input_price: z.string(),
            output_price: z.string(),
            cache_input_price: z.string(),
            request_price_usd: z.string(),
          })
        )
        .min(1, t('Add at least one model'))
        .max(200),
    })
    .superRefine((values, context) => {
      values.models.forEach((item, index) => {
        if (item.billing_mode === 'token') {
          if (
            !Number.isFinite(Number(item.input_price)) ||
            Number(item.input_price) <= 0
          ) {
            context.addIssue({
              code: 'custom',
              message: t('Enter Input price to calculate ratio'),
              path: ['models', index, 'input_price'],
            })
          }
          if (
            !Number.isFinite(Number(item.output_price)) ||
            Number(item.output_price) <= 0
          ) {
            context.addIssue({
              code: 'custom',
              message: t('Enter Completion price to calculate ratio'),
              path: ['models', index, 'output_price'],
            })
          }
          if (
            !Number.isFinite(Number(item.cache_input_price)) ||
            Number(item.cache_input_price) <= 0
          ) {
            context.addIssue({
              code: 'custom',
              message: t('Required'),
              path: ['models', index, 'cache_input_price'],
            })
          }
        } else if (
          !Number.isFinite(Number(item.request_price_usd)) ||
          Number(item.request_price_usd) <= 0
        ) {
          context.addIssue({
            code: 'custom',
            message: t('Enter a positive USD price per request'),
            path: ['models', index, 'request_price_usd'],
          })
        }
      })
    })
}

export type MinimalModeSourceFormValues = z.input<
  ReturnType<typeof createMinimalModeSourceSchema>
>

const emptyModel = (): MinimalModeSourceFormValues['models'][number] => ({
  display_model: '',
  upstream_model: '',
  icon_key: 'OpenAI',
  endpoint_type: 'openai',
  billing_mode: 'token',
  input_price: '2',
  output_price: '2',
  cache_input_price: '2',
  request_price_usd: '',
})

export function buildMinimalModeSourceDefaults(
  source: MinimalModeSource | null,
  fallbackGroup: string
): MinimalModeSourceFormValues {
  if (!source) {
    return {
      name: '',
      base_url: '',
      channel_type: 1,
      api_key: '',
      groups: fallbackGroup ? [fallbackGroup] : [],
      models: [emptyModel()],
    }
  }
  return {
    name: source.name,
    base_url: source.base_url,
    channel_type: source.channel_type,
    api_key: '',
    groups: source.groups,
    models: source.models.map((item) => {
      const inputPrice = (item.model_ratio ?? 1) * 2
      return {
        display_model: item.display_model,
        upstream_model: item.upstream_model,
        icon_key: item.icon_key,
        endpoint_type: item.endpoint_type || 'openai',
        billing_mode: item.billing_mode,
        input_price: formatPricingNumber(inputPrice),
        output_price: formatPricingNumber(
          inputPrice * (item.completion_ratio ?? 1)
        ),
        cache_input_price: formatPricingNumber(
          inputPrice * (item.cache_ratio ?? 1)
        ),
        request_price_usd: item.request_price_usd?.toString() ?? '',
      }
    }),
  }
}

export function appendEmptyMinimalModeModel(
  iconKey: string
): MinimalModeSourceFormValues['models'][number] {
  return { ...emptyModel(), icon_key: iconKey || 'OpenAI' }
}

export function toMinimalModeSourceInput(
  values: MinimalModeSourceFormValues,
  source: MinimalModeSource | null
): MinimalModeSourceInput {
  const models: MinimalModeModel[] = values.models.map((item) => {
    if (item.billing_mode === 'request') {
      return {
        display_model: item.display_model.trim(),
        upstream_model: item.upstream_model.trim(),
        icon_key: item.icon_key,
        endpoint_type: item.endpoint_type,
        billing_mode: 'request',
        request_price_usd: Number(item.request_price_usd),
      }
    }
    const inputPrice = Number(item.input_price)
    return {
      display_model: item.display_model.trim(),
      upstream_model: item.upstream_model.trim(),
      icon_key: item.icon_key,
      endpoint_type: item.endpoint_type,
      billing_mode: 'token',
      model_ratio: inputPrice / 2,
      completion_ratio: Number(item.output_price) / inputPrice,
      cache_ratio: Number(item.cache_input_price) / inputPrice,
    }
  })
  return {
    id: source?.id,
    expected_revision: source?.revision,
    name: values.name.trim(),
    base_url: values.base_url.trim(),
    channel_type: Number(values.channel_type),
    api_key: values.api_key.trim(),
    groups: values.groups,
    models,
  }
}
