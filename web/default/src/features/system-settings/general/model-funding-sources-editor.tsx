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

import { useQuery } from '@tanstack/react-query'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import { MultiSelect } from '@/components/multi-select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field'
import { getEnabledModels } from '@/features/channels/api'

import {
  modelFundingSourcesSchema,
  replaceModelFundingSelection,
  type ModelFundingSources,
} from './model-funding-sources'

export function ModelFundingSourcesEditor(props: {
  value: string
  onChange: (value: string) => void
  disabled: boolean
}) {
  const { t } = useTranslation()
  const id = useId()
  const models = useQuery({
    queryKey: ['model-funding-configured-models'],
    queryFn: async () => {
      const result = await getEnabledModels()
      if (!result.success) {
        throw new Error(result.message || 'Failed to load configured models.')
      }
      return result.data ?? []
    },
  })
  let rules: ModelFundingSources = {}
  try {
    rules = modelFundingSourcesSchema.parse(JSON.parse(props.value))
  } catch {
    // The parent schema rejects invalid saved data instead of silently saving it.
  }
  const subscription = Object.keys(rules).filter(
    (name) => rules[name] === 'subscription_only'
  )
  const wallet = Object.keys(rules).filter(
    (name) => rules[name] === 'wallet_only'
  )
  const names = [
    ...new Set([...(models.data ?? []), ...Object.keys(rules)]),
  ].sort()
  const options = names.map((name) => ({ value: name, label: name }))

  return (
    <FieldSet disabled={props.disabled}>
      <FieldLegend>{t('Model funding restrictions')}</FieldLegend>
      <FieldDescription>
        {t(
          'Choose which funding source each model may use. These rules override user billing preferences and wallet fallback. Unselected models keep the current billing behavior.'
        )}
      </FieldDescription>
      {models.isError ? (
        <Alert variant='destructive'>
          <AlertDescription>
            {t('Failed to load configured models.')}
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() => void models.refetch()}
            >
              {t('Retry')}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      <FieldGroup className='grid min-w-0 gap-6 md:grid-cols-2'>
        <Field className='min-w-0'>
          <FieldLabel htmlFor={`${id}-subscription`}>
            {t('Subscription-only models')}
          </FieldLabel>
          <MultiSelect
            id={`${id}-subscription`}
            options={options.filter(
              (option) => rules[option.value] !== 'wallet_only'
            )}
            selected={subscription}
            onChange={(selected) =>
              props.onChange(
                replaceModelFundingSelection(
                  rules,
                  'subscription_only',
                  selected
                )
              )
            }
            placeholder={t('Select configured models')}
            disabled={props.disabled || models.isPending || models.isError}
            maxVisibleChips={6}
          />
          <FieldDescription>
            {t(
              'Requires an active subscription with sufficient quota. Account balance is never used, even when wallet fallback is enabled.'
            )}
          </FieldDescription>
        </Field>
        <Field className='min-w-0'>
          <FieldLabel htmlFor={`${id}-wallet`}>
            {t('Balance-only models')}
          </FieldLabel>
          <MultiSelect
            id={`${id}-wallet`}
            options={options.filter(
              (option) => rules[option.value] !== 'subscription_only'
            )}
            selected={wallet}
            onChange={(selected) =>
              props.onChange(
                replaceModelFundingSelection(rules, 'wallet_only', selected)
              )
            }
            placeholder={t('Select configured models')}
            disabled={props.disabled || models.isPending || models.isError}
            maxVisibleChips={6}
          />
          <FieldDescription>
            {t(
              'Uses account balance only. Subscription quota is never used, even when a subscription is active.'
            )}
          </FieldDescription>
        </Field>
      </FieldGroup>
      <FieldDescription>
        {t(
          'A model can belong to only one list. Remove it from its current list before moving it to the other. Rules match the exact model ID requested by the user, before upstream mapping.'
        )}
      </FieldDescription>
    </FieldSet>
  )
}
