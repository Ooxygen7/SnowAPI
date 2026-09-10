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
import { useQuery } from '@tanstack/react-query'
import { type FormEvent, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { CopyButton } from '@/components/copy-button'
import { DateTimePicker } from '@/components/datetime-picker'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { getGroups } from '@/features/users/api'
import { getCurrencyDisplay, getCurrencyLabel } from '@/lib/currency'
import { formatQuota, parseQuotaFromDollars } from '@/lib/format'
import { cn } from '@/lib/utils'

import { createRedemption, getRedemption, updateRedemption } from '../api'
import { SUCCESS_MESSAGES } from '../constants'
import {
  getRedemptionFormSchema,
  REDEMPTION_FORM_DEFAULT_VALUES,
  transformFormDataToPayload,
  transformRedemptionToFormDefaults,
  type RedemptionFormValues,
} from '../lib'
import type { Redemption } from '../types'
import { useRedemptions } from './redemptions-provider'

type RedemptionsMutateDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentRow?: Redemption
}

export function RedemptionsMutateDrawer({
  open,
  onOpenChange,
  currentRow,
}: RedemptionsMutateDrawerProps) {
  const { t } = useTranslation()
  const isUpdate = Boolean(currentRow)
  const { triggerRefresh } = useRedemptions()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [createdCodes, setCreatedCodes] = useState<string[]>([])

  const { data: groupsData } = useQuery({
    queryKey: ['groups'],
    queryFn: getGroups,
    enabled: open,
    staleTime: 5 * 60 * 1000,
  })
  const groups = groupsData?.data ?? []

  const form = useForm<RedemptionFormValues>({
    resolver: zodResolver(getRedemptionFormSchema(t)),
    defaultValues: REDEMPTION_FORM_DEFAULT_VALUES,
  })
  useEffect(() => {
    if (open && currentRow) {
      void getRedemption(currentRow.id).then((result) => {
        if (result.success && result.data) {
          form.reset(transformRedemptionToFormDefaults(result.data))
        }
      })
    } else if (open) {
      form.reset(REDEMPTION_FORM_DEFAULT_VALUES)
      setCreatedCodes([])
    }
  }, [currentRow, form, open])

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen)
    if (!nextOpen) {
      setCreatedCodes([])
    }
  }

  const onSubmit = async (data: RedemptionFormValues) => {
    setIsSubmitting(true)
    try {
      const payload = transformFormDataToPayload(data)
      const result = currentRow
        ? await updateRedemption({ ...payload, id: currentRow.id })
        : await createRedemption(payload)
      if (!result.success) {
        toast.error(result.message || t('Failed to save redemption code'))
        return
      }
      const generatedCodes = Array.isArray(result.data) ? result.data : []
      if (!currentRow && !generatedCodes.length) {
        toast.error(t('Failed to save redemption code'))
        return
      }
      toast.success(
        currentRow
          ? t(SUCCESS_MESSAGES.REDEMPTION_UPDATED)
          : t(SUCCESS_MESSAGES.REDEMPTION_CREATED)
      )
      triggerRefresh()
      if (currentRow) {
        handleOpenChange(false)
        return
      }
      setCreatedCodes(generatedCodes)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (!isUpdate && !form.getValues('name')?.trim()) {
      const name =
        form.getValues('type') === 'group'
          ? form.getValues('group_name').slice(0, 20)
          : formatQuota(parseQuotaFromDollars(form.getValues('quota_dollars')))
      form.setValue('name', name, { shouldValidate: true })
    }
    void form.handleSubmit(onSubmit)(event)
  }

  const { meta: currencyMeta } = getCurrencyDisplay()
  const currencyLabel = getCurrencyLabel()
  const tokensOnly = currencyMeta.kind === 'tokens'
  const benefitType = form.watch('type')
  const allCodes = createdCodes.join('\n')
  let dialogTitle = t('Create Redemption Code')
  if (isUpdate) {
    dialogTitle = t('Update Redemption Code')
  }
  if (createdCodes.length) {
    dialogTitle = t('Save redemption codes now')
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className='max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-xl'>
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          {createdCodes.length ? (
            <DialogDescription>
              {t(
                'Complete redemption codes are shown only this once. Save them before closing.'
              )}
            </DialogDescription>
          ) : null}
        </DialogHeader>

        {createdCodes.length ? (
          <div className='space-y-3'>
            <div className='bg-muted/40 rounded-xl border p-3'>
              <Textarea
                value={allCodes}
                readOnly
                className='min-h-64 resize-none border-0 bg-transparent font-mono text-xs shadow-none focus-visible:ring-0'
              />
            </div>
            <CopyButton
              value={allCodes}
              variant='outline'
              size='default'
              className='w-full gap-2'
            >
              {t('Copy all redemption codes')}
            </CopyButton>
          </div>
        ) : null}

        <Form {...form}>
          <form
            id='redemption-form'
            onSubmit={handleSubmit}
            className={cn('space-y-4', createdCodes.length && 'hidden')}
          >
            <FormField
              control={form.control}
              name='name'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Name')}</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder={t('Enter a name')} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='type'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Benefit type')}</FormLabel>
                  <FormControl>
                    <div
                      className='bg-muted grid grid-cols-2 gap-1 rounded-lg p-1'
                      role='radiogroup'
                      aria-label={t('Benefit type')}
                    >
                      <Button
                        type='button'
                        variant={field.value === 'quota' ? 'default' : 'ghost'}
                        className='h-9'
                        role='radio'
                        aria-checked={field.value === 'quota'}
                        onClick={() => field.onChange('quota')}
                      >
                        {t('Quota')}
                      </Button>
                      <Button
                        type='button'
                        variant={field.value === 'group' ? 'default' : 'ghost'}
                        className='h-9'
                        role='radio'
                        aria-checked={field.value === 'group'}
                        onClick={() => field.onChange('group')}
                      >
                        {t('Group entitlement')}
                      </Button>
                    </div>
                  </FormControl>
                  <FormDescription>
                    {t(
                      'Choose whether the code grants quota or a group entitlement.'
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {benefitType === 'quota' ? (
              <FormField
                control={form.control}
                name='quota_dollars'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t('Quota ({{currency}})', { currency: currencyLabel })}
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type='number'
                        min='0'
                        step={tokensOnly ? 1 : 0.01}
                        onChange={(event) =>
                          field.onChange(Number(event.target.value) || 0)
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : (
              <div className='grid gap-3 sm:grid-cols-2'>
                <FormField
                  control={form.control}
                  name='group_name'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Target group')}</FormLabel>
                      <Select
                        items={groups.map((group) => ({
                          value: group,
                          label: group,
                        }))}
                        value={field.value}
                        onValueChange={(value) =>
                          field.onChange(value === null ? '' : value)
                        }
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t('Select a group')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent alignItemWithTrigger={false}>
                          <SelectGroup>
                            {groups.map((group) => (
                              <SelectItem key={group} value={group}>
                                {group}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name='group_duration_days'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Duration (days)')}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type='number'
                          min='1'
                          max='3650'
                          step='1'
                          onChange={(event) =>
                            field.onChange(Number(event.target.value) || 0)
                          }
                        />
                      </FormControl>
                      <FormDescription>
                        {t('Duration must be at least 1 day')}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            <FormField
              control={form.control}
              name='expired_time'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Code expiration time')}</FormLabel>
                  <FormControl>
                    <DateTimePicker
                      value={field.value}
                      onChange={field.onChange}
                      placeholder={t('Never expires')}
                    />
                  </FormControl>
                  <FormDescription>
                    {t('Leave empty for never expires')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            {!isUpdate ? (
              <FormField
                control={form.control}
                name='count'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Quantity')}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type='number'
                        min='1'
                        max='100'
                        onChange={(event) =>
                          field.onChange(Number(event.target.value) || 1)
                        }
                      />
                    </FormControl>
                    <FormDescription>
                      {t('Create multiple redemption codes at once (1-100)')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}
          </form>
        </Form>

        <DialogFooter className='border-0'>
          {createdCodes.length ? (
            <Button onClick={() => handleOpenChange(false)}>
              {t('I have saved them')}
            </Button>
          ) : (
            <>
              <Button variant='outline' onClick={() => handleOpenChange(false)}>
                {t('Cancel')}
              </Button>
              <Button
                form='redemption-form'
                type='submit'
                disabled={isSubmitting}
              >
                {isSubmitting ? t('Saving...') : t('Save changes')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
