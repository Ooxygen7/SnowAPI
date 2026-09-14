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
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { getCurrencyLabel } from '@/lib/currency'
import { parseQuotaFromDollars, quotaUnitsToDollars } from '@/lib/format'

import type { AdminSubscriptionChange, AdminSubscriptionState } from '../types'

export function SubscriptionBalanceForm(props: {
  subscription: AdminSubscriptionState
  pending: boolean
  onSave: (change: AdminSubscriptionChange) => void
}) {
  const { t } = useTranslation()
  const sub = props.subscription
  const schema = z.object({
    period: z
      .string()
      .refine(
        (value) =>
          sub.period_total <= 0 ||
          (value.trim() !== '' &&
            Number.isFinite(Number(value)) &&
            Number(value) >= 0 &&
            parseQuotaFromDollars(Number(value)) <= sub.period_total),
        t('Enter a balance within the plan limit')
      ),
    fiveHour: z
      .string()
      .refine(
        (value) =>
          sub.five_hour_total <= 0 ||
          (value.trim() !== '' &&
            Number.isFinite(Number(value)) &&
            Number(value) >= 0 &&
            parseQuotaFromDollars(Number(value)) <= sub.five_hour_total),
        t('Enter a balance within the plan limit')
      ),
  })
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      period: String(quotaUnitsToDollars(sub.period_remaining)),
      fiveHour: String(quotaUnitsToDollars(sub.five_hour_remaining)),
    },
  })
  const unit = getCurrencyLabel()
  return (
    <form
      onSubmit={form.handleSubmit((values) =>
        props.onSave({
          action: 'balance',
          subscription_id: sub.subscription_id,
          expected_version: sub.version,
          period_remaining:
            sub.period_total > 0
              ? parseQuotaFromDollars(Number(values.period))
              : undefined,
          five_hour_remaining:
            sub.five_hour_total > 0
              ? parseQuotaFromDollars(Number(values.fiveHour))
              : undefined,
        })
      )}
    >
      <FieldGroup className='gap-4'>
        {sub.period_total > 0 && (
          <Field data-invalid={!!form.formState.errors.period}>
            <FieldLabel htmlFor='subscription-period-balance'>
              {t('Period balance')} ({unit})
            </FieldLabel>
            <Input
              id='subscription-period-balance'
              type='number'
              step='any'
              min={0}
              max={quotaUnitsToDollars(sub.period_total)}
              disabled={props.pending}
              aria-invalid={!!form.formState.errors.period}
              {...form.register('period')}
            />
            {form.formState.errors.period && (
              <FieldDescription>
                {form.formState.errors.period.message}
              </FieldDescription>
            )}
          </Field>
        )}
        {sub.five_hour_total > 0 && (
          <Field data-invalid={!!form.formState.errors.fiveHour}>
            <FieldLabel htmlFor='subscription-five-hour-balance'>
              {t('5-hour balance')} ({unit})
            </FieldLabel>
            <Input
              id='subscription-five-hour-balance'
              type='number'
              step='any'
              min={0}
              max={quotaUnitsToDollars(sub.five_hour_total)}
              disabled={props.pending}
              aria-invalid={!!form.formState.errors.fiveHour}
              {...form.register('fiveHour')}
            />
            {form.formState.errors.fiveHour && (
              <FieldDescription>
                {form.formState.errors.fiveHour.message}
              </FieldDescription>
            )}
          </Field>
        )}
        <FieldDescription>
          {t(
            'Changes apply to remaining quota, not plan limits. Expiry and active reset times stay unchanged. A reduced idle 5-hour balance starts its window now.'
          )}
        </FieldDescription>
        <Button
          type='submit'
          disabled={
            props.pending || (sub.period_total <= 0 && sub.five_hour_total <= 0)
          }
        >
          {t('Save balances')}
        </Button>
      </FieldGroup>
    </form>
  )
}
