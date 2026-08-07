import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import * as z from 'zod'

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

import {
  SettingsForm,
  SettingsSwitchContent,
  SettingsSwitchItem,
} from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'

const rateLimitSchema = z.object({
  ModelRequestRateLimitEnabled: z.boolean(),
  ModelRequestRateLimitDurationMinutes: z.number().min(1),
  ModelRequestRateLimitCount: z.number().min(0).max(100000000),
  ModelRequestRateLimitSuccessCount: z.number().min(0).max(100000000),
})

type RateLimitFormValues = z.infer<typeof rateLimitSchema>

export function RateLimitSection({
  defaultValues,
}: {
  defaultValues: RateLimitFormValues
}) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const form = useForm<RateLimitFormValues>({
    resolver: zodResolver(rateLimitSchema),
    mode: 'onChange',
    defaultValues,
  })

  useEffect(() => form.reset(defaultValues), [defaultValues, form])

  const onSubmit = async (values: RateLimitFormValues) => {
    const updates = Object.entries(values).filter(
      ([key, value]) => value !== defaultValues[key as keyof RateLimitFormValues]
    )
    for (const [key, value] of updates) {
      await updateOption.mutateAsync({ key, value })
    }
  }

  return (
    <SettingsSection title={t('Rate Limiting')}>
      <Form {...form}>
        <SettingsForm onSubmit={form.handleSubmit(onSubmit)}>
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            isSaving={updateOption.isPending}
            saveLabel='Save rate limits'
          />
          <FormField
            control={form.control}
            name='ModelRequestRateLimitEnabled'
            render={({ field }) => (
              <SettingsSwitchItem>
                <SettingsSwitchContent>
                  <FormLabel>{t('Enable rate limiting')}</FormLabel>
                  <FormDescription>
                    {t(
                      'This controls model request rate limiting. Web/API route throttling is configured by environment variables and may still return 429.'
                    )}
                  </FormDescription>
                </SettingsSwitchContent>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
              </SettingsSwitchItem>
            )}
          />

          <div className='grid gap-4 md:grid-cols-3'>
            {([
              ['ModelRequestRateLimitDurationMinutes', 'Limit period', 'minutes', 1],
              ['ModelRequestRateLimitCount', 'Max requests per period', 'times', 0],
              ['ModelRequestRateLimitSuccessCount', 'Max successful requests', 'times', 0],
            ] as const).map(([name, label, suffix, minimum]) => (
              <FormField
                key={name}
                control={form.control}
                name={name}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t(label)}</FormLabel>
                    <FormControl>
                      <div className='flex items-center gap-2'>
                        <Input
                          type='number'
                          min={minimum}
                          max={100000000}
                          step={1}
                          {...field}
                          onChange={(event) =>
                            field.onChange(
                              Math.max(minimum, Number.parseInt(event.target.value, 10) || minimum)
                            )
                          }
                        />
                        <span className='text-sm text-muted-foreground'>{t(suffix)}</span>
                      </div>
                    </FormControl>
                    <FormDescription>
                      {minimum === 0
                        ? t('0 means unlimited')
                        : t('Time window for rate limiting')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
          </div>
        </SettingsForm>
      </Form>
    </SettingsSection>
  )
}
