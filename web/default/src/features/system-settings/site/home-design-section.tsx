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
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { SnowApiLogoMark } from '@/components/snowapi-logo-mark'
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'

import { SettingsForm } from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'

const schema = z.object({ design: z.enum(['poolside', 'snowflake']) })

export function HomeDesignSection(props: { design: string }) {
  const { t } = useTranslation()
  const update = useUpdateOption()
  const design = props.design === 'snowflake' ? 'snowflake' : 'poolside'
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { design },
  })
  useEffect(() => {
    form.reset({ design })
  }, [design, form])
  const submit = form.handleSubmit(async (values) => {
    await update.mutateAsync({ key: 'theme.home_design', value: values.design })
    form.reset(values)
  })

  return (
    <SettingsSection title={t('Homepage design')}>
      <p className='text-muted-foreground text-sm'>
        {t(
          'Choose the homepage for signed-out visitors. Signed-in users still go directly to the console.'
        )}
      </p>
      <Form {...form}>
        <SettingsForm onSubmit={submit}>
          <FormField
            control={form.control}
            name='design'
            render={({ field }) => (
              <FormItem className='w-full'>
                <FormLabel>{t('Homepage design')}</FormLabel>
                <RadioGroup
                  value={field.value}
                  onValueChange={field.onChange}
                  aria-label={t('Homepage design')}
                  className='grid w-full max-w-4xl gap-4 md:grid-cols-2'
                  disabled={update.isPending}
                >
                  <label className='border-border has-data-checked:border-foreground flex cursor-pointer flex-col overflow-hidden rounded-xl border-2'>
                    <div
                      aria-hidden='true'
                      className='flex h-44 gap-3 bg-[#fbfaf6] p-5 text-black'
                    >
                      <div className='flex w-12 flex-col gap-2 pt-1'>
                        <span className='h-1 w-full bg-black/40' />
                        {[1, 2, 3, 4].map((i) => (
                          <span key={i} className='h-1 w-8 bg-black/20' />
                        ))}
                      </div>
                      <div className='flex flex-1 flex-col gap-3'>
                        <div className='space-y-2'>
                          <span className='block h-2 w-full bg-black/70' />
                          <span className='block h-2 w-2/3 bg-black/70' />
                        </div>
                        <span className='h-3 w-16 bg-[#4137ff]' />
                        <div className='flex-1 bg-[#e9e8df] px-4 pt-3'>
                          <div className='h-full rounded-t-lg border border-black/10 bg-[#fbfaf6] p-2'>
                            <span className='block h-1 w-3 rounded bg-[#4137ff]' />
                            <span className='mt-2 block h-1 w-3/4 bg-black/20' />
                          </div>
                        </div>
                      </div>
                    </div>
                    <span className='flex items-center gap-3 p-4'>
                      <RadioGroupItem value='poolside' />
                      <span>
                        <span className='block text-sm font-medium'>
                          {t('Poolside homepage')}
                        </span>
                        <span className='text-muted-foreground text-xs'>
                          {t(
                            'Sidebar navigation, an interactive preview, and illustrated sections.'
                          )}
                        </span>
                      </span>
                    </span>
                  </label>
                  <label className='border-border has-data-checked:border-foreground flex cursor-pointer flex-col overflow-hidden rounded-xl border-2'>
                    <div
                      aria-hidden='true'
                      className='flex h-44 items-center justify-between gap-4 bg-white p-6 text-black'
                    >
                      <div>
                        <span className='block text-lg font-medium'>
                          SNOW API
                        </span>
                        <span className='mt-2 block h-1 w-24 bg-black/20' />
                        <span className='mt-2 block h-1 w-16 bg-black/20' />
                      </div>
                      <SnowApiLogoMark className='size-16' />
                    </div>
                    <span className='flex items-center gap-3 p-4'>
                      <RadioGroupItem value='snowflake' />
                      <span>
                        <span className='block text-sm font-medium'>
                          {t('Snowflake homepage')}
                        </span>
                        <span className='text-muted-foreground text-xs'>
                          {t('The original single-screen canvas homepage.')}
                        </span>
                      </span>
                    </span>
                  </label>
                </RadioGroup>
                <FormMessage />
              </FormItem>
            )}
          />
          <SettingsPageFormActions
            onSave={() => void submit()}
            onReset={() => form.reset({ design })}
            isSaving={update.isPending}
            isSaveDisabled={!form.formState.isDirty}
            isResetDisabled={!form.formState.isDirty}
          />
        </SettingsForm>
      </Form>
    </SettingsSection>
  )
}
