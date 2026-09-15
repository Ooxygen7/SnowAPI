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
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ShieldAlert } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useForm, type Resolver } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import * as z from 'zod'

import { RiskAcknowledgementDialog } from '@/components/risk-acknowledgement-dialog'
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

import { confirmPaymentCompliance } from '../api'
import {
  SettingsForm,
  SettingsFormGrid,
  SettingsFormGridItem,
} from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'
import { safeNumberFieldProps } from '../utils/numeric-field'
import {
  formatJsonForEditor,
  getJsonError,
  normalizeJsonForComparison,
  removeTrailingSlash,
} from './utils'

function isHttpOriginUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return true
  try {
    const url = new URL(trimmed)
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      (url.pathname === '' || url.pathname === '/') &&
      !url.search &&
      !url.hash
    )
  } catch {
    return false
  }
}

function jsonField(expect: (value: unknown) => boolean) {
  return z.string().superRefine((value, context) => {
    const error = getJsonError(value, expect)
    if (error) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: error })
    }
  })
}

const paymentSchema = z.object({
  PaymentEnabled: z.boolean(),
  PayAddress: z
    .string()
    .refine(
      (value) => !value.trim() || /^https?:\/\//.test(value.trim()),
      'Provide a valid payment gateway URL starting with http:// or https://'
    ),
  EpayId: z.string(),
  EpayKey: z.string(),
  Price: z.coerce.number().min(0),
  MinTopUp: z.coerce.number().min(0),
  CustomCallbackAddress: z
    .string()
    .refine(
      isHttpOriginUrl,
      'Enter only a top-level callback domain, for example https://api.example.com, without any path.'
    ),
  PayMethods: jsonField((value) => Array.isArray(value)),
  AmountOptions: jsonField((value) => Array.isArray(value)),
  AmountDiscount: jsonField(
    (value) =>
      Boolean(value) && typeof value === 'object' && !Array.isArray(value)
  ),
})

type PaymentFormValues = z.infer<typeof paymentSchema>

type PaymentComplianceDefaults = {
  confirmed: boolean
  termsVersion: string
  confirmedAt: number
  confirmedBy: number
}

type PaymentSettingsSectionProps = {
  defaultValues: PaymentFormValues
  complianceDefaults: PaymentComplianceDefaults
}

const CURRENT_COMPLIANCE_TERMS_VERSION = 'v1'

export function PaymentSettingsSection({
  defaultValues,
  complianceDefaults,
}: PaymentSettingsSectionProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const updateOption = useUpdateOption()
  const [showComplianceDialog, setShowComplianceDialog] = useState(false)

  const normalizedDefaults = useMemo<PaymentFormValues>(
    () => ({
      ...defaultValues,
      PayMethods: formatJsonForEditor(defaultValues.PayMethods || '[]'),
      AmountOptions: formatJsonForEditor(defaultValues.AmountOptions || '[]'),
      AmountDiscount: formatJsonForEditor(defaultValues.AmountDiscount || '{}'),
    }),
    [defaultValues]
  )

  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentSchema) as Resolver<PaymentFormValues>,
    mode: 'onChange',
    values: normalizedDefaults,
  })

  const complianceStatements = useMemo(
    () => [
      t(
        'You have legally obtained authorization for the connected model APIs, accounts, keys, and quotas.'
      ),
      t(
        'You commit to using upstream service capabilities only within the scope of lawful authorization.'
      ),
      t(
        'You understand and independently bear legal responsibility arising from deployment, operation, and charging behavior.'
      ),
    ],
    [t]
  )
  const requiredText = t(
    'I have read and understood the compliance reminder and accept responsibility.'
  )
  const complianceConfirmed =
    complianceDefaults.confirmed &&
    complianceDefaults.termsVersion === CURRENT_COMPLIANCE_TERMS_VERSION

  const confirmCompliance = useMutation({
    mutationFn: confirmPaymentCompliance,
    onSuccess: (data) => {
      if (!data.success) {
        toast.error(data.message || t('Failed to confirm compliance'))
        return
      }
      toast.success(t('Compliance confirmed successfully'))
      setShowComplianceDialog(false)
      void queryClient.invalidateQueries({ queryKey: ['system-options'] })
    },
    onError: (error: Error) =>
      toast.error(error.message || t('Failed to confirm compliance')),
  })

  const onSubmit = async (values: PaymentFormValues) => {
    const sanitized: PaymentFormValues = {
      PaymentEnabled: values.PaymentEnabled,
      PayAddress: removeTrailingSlash(values.PayAddress.trim()),
      EpayId: values.EpayId.trim(),
      EpayKey: values.EpayKey.trim(),
      Price: values.Price,
      MinTopUp: values.MinTopUp,
      CustomCallbackAddress: removeTrailingSlash(
        values.CustomCallbackAddress.trim()
      ),
      PayMethods: values.PayMethods.trim(),
      AmountOptions: values.AmountOptions.trim(),
      AmountDiscount: values.AmountDiscount.trim(),
    }
    const initial: PaymentFormValues = {
      ...normalizedDefaults,
      PayAddress: removeTrailingSlash(normalizedDefaults.PayAddress.trim()),
      EpayId: normalizedDefaults.EpayId.trim(),
      EpayKey: normalizedDefaults.EpayKey.trim(),
      CustomCallbackAddress: removeTrailingSlash(
        normalizedDefaults.CustomCallbackAddress.trim()
      ),
    }
    const updates: Array<{ key: string; value: string | number }> = []
    const add = (key: string, value: string | number) =>
      updates.push({ key, value })

    if (sanitized.PayAddress !== initial.PayAddress) {
      add('PayAddress', sanitized.PayAddress)
    }
    if (sanitized.PaymentEnabled !== initial.PaymentEnabled) {
      add('payment_setting.enabled', String(sanitized.PaymentEnabled))
    }
    if (sanitized.EpayId !== initial.EpayId) add('EpayId', sanitized.EpayId)
    if (sanitized.EpayKey && sanitized.EpayKey !== initial.EpayKey) {
      add('EpayKey', sanitized.EpayKey)
    }
    if (sanitized.Price !== initial.Price) add('Price', sanitized.Price)
    if (sanitized.MinTopUp !== initial.MinTopUp) {
      add('MinTopUp', sanitized.MinTopUp)
    }
    if (sanitized.CustomCallbackAddress !== initial.CustomCallbackAddress) {
      add('CustomCallbackAddress', sanitized.CustomCallbackAddress)
    }

    const jsonUpdates = [
      ['PayMethods', 'PayMethods'],
      ['AmountOptions', 'payment_setting.amount_options'],
      ['AmountDiscount', 'payment_setting.amount_discount'],
    ] as const
    for (const [field, key] of jsonUpdates) {
      if (
        normalizeJsonForComparison(sanitized[field]) !==
        normalizeJsonForComparison(initial[field])
      ) {
        add(key, sanitized[field])
      }
    }

    if (updates.length === 0) {
      toast.info(t('No changes to save'))
      return
    }
    for (const update of updates) {
      await updateOption.mutateAsync(update)
    }
  }

  const jsonField = (
    name: 'PayMethods' | 'AmountOptions' | 'AmountDiscount',
    label: string,
    description: ReactNode,
    rows = 5
  ) => (
    <SettingsFormGridItem span='full'>
      <FormField
        control={form.control}
        name={name}
        render={({ field }) => (
          <FormItem>
            <FormLabel>{label}</FormLabel>
            <FormControl>
              <Textarea rows={rows} className='font-mono text-xs' {...field} />
            </FormControl>
            <FormDescription>{description}</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </SettingsFormGridItem>
  )

  return (
    <SettingsSection title={t('Payment Gateway')}>
      {!complianceConfirmed ? (
        <Alert variant='destructive' className='mb-6'>
          <ShieldAlert className='h-4 w-4' />
          <AlertTitle>{t('Compliance confirmation required')}</AlertTitle>
          <AlertDescription>
            {t(
              'Payments, redemption codes, and subscription plans are locked until the root administrator confirms the compliance terms.'
            )}
          </AlertDescription>
          <AlertAction>
            <Button
              type='button'
              size='sm'
              variant='destructive'
              onClick={() => setShowComplianceDialog(true)}
            >
              {t('Confirm compliance')}
            </Button>
          </AlertAction>
        </Alert>
      ) : (
        <Alert className='mb-6'>
          <AlertTitle>{t('Compliance confirmed')}</AlertTitle>
          <AlertDescription>
            {t('Confirmed at {{time}} by user #{{userId}}', {
              time: complianceDefaults.confirmedAt
                ? new Date(
                    complianceDefaults.confirmedAt * 1000
                  ).toLocaleString()
                : '-',
              userId: complianceDefaults.confirmedBy || '-',
            })}
          </AlertDescription>
        </Alert>
      )}

      <RiskAcknowledgementDialog
        open={showComplianceDialog}
        onOpenChange={setShowComplianceDialog}
        title={t('Confirm compliance terms')}
        description={t(
          'This confirmation unlocks payment, redemption code, and subscription plan features.'
        )}
        items={complianceStatements}
        requiredText={requiredText}
        inputPrompt={t('Please type the following text to confirm:')}
        inputPlaceholder={t('Type the confirmation text here')}
        mismatchHint={t('The entered text does not match the required text.')}
        confirmText={t('Confirm and enable')}
        isLoading={confirmCompliance.isPending}
        onConfirm={() => confirmCompliance.mutate()}
      />

      <Form {...form}>
        <SettingsForm
          onSubmit={form.handleSubmit(onSubmit)}
          className={
            !complianceConfirmed ? 'pointer-events-none opacity-40' : ''
          }
          data-no-autosubmit='true'
        >
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            isSaving={updateOption.isPending || form.formState.isSubmitting}
            saveLabel='Save all settings'
          />
          <SettingsFormGrid>
            <SettingsFormGridItem span='full'>
              <FormField
                control={form.control}
                name='PaymentEnabled'
                render={({ field }) => (
                  <FormItem className='flex items-center justify-between gap-4'>
                    <div className='flex flex-col gap-1'>
                      <FormLabel>{t('Accept payments')}</FormLabel>
                      <FormDescription>
                        {t(
                          'Pause new payments without interrupting existing orders or balance purchases.'
                        )}
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </SettingsFormGridItem>
            <FormField
              control={form.control}
              name='PayAddress'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Epay gateway address')}</FormLabel>
                  <FormControl>
                    <Input placeholder='https://pay.example.com' {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='CustomCallbackAddress'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Custom callback address')}</FormLabel>
                  <FormControl>
                    <Input placeholder='https://api.example.com' {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='EpayId'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Merchant ID')}</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='EpayKey'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Merchant key')}</FormLabel>
                  <FormControl>
                    <Input type='password' {...field} />
                  </FormControl>
                  <FormDescription>
                    {t('Leave blank to keep the current key')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='Price'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Price (local currency / USD)')}</FormLabel>
                  <FormControl>
                    <Input
                      type='number'
                      min={0}
                      step='0.01'
                      {...safeNumberFieldProps(field)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='MinTopUp'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Minimum top-up (USD)')}</FormLabel>
                  <FormControl>
                    <Input
                      type='number'
                      min={0}
                      step='0.01'
                      {...safeNumberFieldProps(field)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {jsonField(
              'PayMethods',
              t('Payment methods'),
              t('JSON array of Epay payment methods and icons.')
            )}
            {jsonField(
              'AmountOptions',
              t('Top-up amount options'),
              t('JSON array of preset top-up amounts.')
            )}
            {jsonField(
              'AmountDiscount',
              t('Top-up amount discounts'),
              t('JSON object mapping top-up amounts to discount multipliers.')
            )}
          </SettingsFormGrid>
        </SettingsForm>
      </Form>
    </SettingsSection>
  )
}
