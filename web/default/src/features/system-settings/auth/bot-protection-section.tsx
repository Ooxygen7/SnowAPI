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
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import * as z from 'zod'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { FieldGroup, FieldLegend, FieldSet } from '@/components/ui/field'
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
import { api } from '@/lib/api'

import {
  SettingsForm,
  SettingsSwitchContent,
  SettingsSwitchItem,
} from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'

const botProtectionSchema = z.object({
  TurnstileCheckEnabled: z.boolean(),
  TurnstileSiteKey: z.string().optional(),
  TurnstileSecretKey: z.string().optional(),
  SnowShieldEnabled: z.boolean(),
  SnowShieldHostname: z.string().trim(),
  SnowShieldTrustMinutes: z
    .string()
    .refine(
      (value) => /^[1-9]\d*$/.test(value) && Number(value) <= 1440,
      'SnowShield trust duration must be between 1 and 1440 minutes'
    ),
})

type BotProtectionFormValues = z.infer<typeof botProtectionSchema>

type BotProtectionSectionProps = {
  defaultValues: BotProtectionFormValues
  shieldReady: boolean
}

export function BotProtectionSection({
  defaultValues,
  shieldReady,
}: BotProtectionSectionProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const updateProtection = useMutation({
    mutationFn: async (data: BotProtectionFormValues) => {
      const response = await api.put(
        '/api/option/bot_protection',
        {
          ...data,
          SnowShieldTrustMinutes: Number(data.SnowShieldTrustMinutes),
        },
        { skipBusinessError: true, skipErrorHandler: true }
      )
      if (!response.data.success) {
        throw new Error(response.data.message || t('Failed to update setting'))
      }
    },
    onSuccess: () => {
      toast.success(t('Setting updated successfully'))
      void queryClient.invalidateQueries({ queryKey: ['system-options'] })
      void queryClient.invalidateQueries({ queryKey: ['status'] })
      void queryClient.invalidateQueries({ queryKey: ['snow-shield-check'] })
    },
    onError: (error: Error) =>
      toast.error(t(error.message || 'Failed to update setting')),
  })

  const form = useForm<BotProtectionFormValues>({
    resolver: zodResolver(botProtectionSchema),
    defaultValues,
  })

  useEffect(() => {
    form.reset(defaultValues)
  }, [defaultValues, form])

  const onSubmit = async (data: BotProtectionFormValues) => {
    await updateProtection.mutateAsync(data)
  }

  return (
    <SettingsSection title={t('Bot Protection')}>
      <Form {...form}>
        <SettingsForm onSubmit={form.handleSubmit(onSubmit)} autoComplete='off'>
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            isSaving={updateProtection.isPending}
          />
          <FieldSet>
            <FieldLegend>SnowShield</FieldLegend>
            <FieldGroup>
              <Alert>
                <AlertDescription>
                  {t(
                    'When CloudFlare entry protection is enabled for this site, please disable SnowShield'
                  )}
                </AlertDescription>
              </Alert>
              <FormField
                control={form.control}
                name='SnowShieldEnabled'
                render={({ field }) => (
                  <SettingsSwitchItem>
                    <SettingsSwitchContent>
                      <FormLabel>{t('Enable SnowShield')}</FormLabel>
                      <FormDescription>
                        {t(
                          'Verify visitors before they enter the site, including signed-in users when trust expires.'
                        )}
                      </FormDescription>
                    </SettingsSwitchContent>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </SettingsSwitchItem>
                )}
              />
              <Badge variant={shieldReady ? 'secondary' : 'outline'}>
                {shieldReady
                  ? t('SnowShield configuration ready')
                  : t('SnowShield configuration incomplete')}
              </Badge>
              <FormField
                control={form.control}
                name='SnowShieldHostname'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Protected hostname')}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder={window.location.hostname}
                        autoComplete='off'
                      />
                    </FormControl>
                    <FormDescription>
                      {t(
                        'Use the current site hostname without https:// or a path. It must also be allowed by your Turnstile widget.'
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='SnowShieldTrustMinutes'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Trust duration (minutes)')}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        inputMode='numeric'
                        pattern='[0-9]*'
                        onChange={(event) => {
                          if (/^\d*$/.test(event.target.value)) {
                            field.onChange(event.target.value)
                          }
                        }}
                      />
                    </FormControl>
                    <FormDescription>
                      {t(
                        '1–1440 minutes. Changes take effect on save; the duration applies to new verifications.'
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </FieldGroup>
          </FieldSet>
          <FieldSet>
            <FieldLegend>Cloudflare Turnstile</FieldLegend>
            <FieldGroup>
              <FormField
                control={form.control}
                name='TurnstileCheckEnabled'
                render={({ field }) => (
                  <SettingsSwitchItem>
                    <SettingsSwitchContent>
                      <FormLabel>
                        {t('Enable login and registration verification')}
                      </FormLabel>
                      <FormDescription>
                        {t(
                          'Protect login and registration with Cloudflare Turnstile'
                        )}
                      </FormDescription>
                    </SettingsSwitchContent>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </SettingsSwitchItem>
                )}
              />

              <FormField
                control={form.control}
                name='TurnstileSiteKey'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Site Key')}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t('Your Turnstile site key')}
                        autoComplete='off'
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='TurnstileSecretKey'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Secret Key')}</FormLabel>
                    <FormControl>
                      <Input
                        type='password'
                        placeholder={t('Your Turnstile secret key')}
                        autoComplete='new-password'
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <p className='text-muted-foreground text-sm'>
                {t(
                  'SnowShield and login verification share these keys. Leave them blank to keep the saved keys. Use a Managed widget for interactive verification.'
                )}
              </p>
            </FieldGroup>
          </FieldSet>
        </SettingsForm>
      </Form>
    </SettingsSection>
  )
}
