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
import { useEffect, useMemo, useState } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import {
  SecureVerificationDialog,
  useSecureVerification,
} from '@/features/auth/secure-verification'
import { extractApiErrorMessage } from '@/lib/secure-verification'

import {
  discoverMinimalModeModels,
  saveMinimalModeSource,
} from './minimal-mode-api'
import {
  appendEmptyMinimalModeModel,
  buildMinimalModeSourceDefaults,
  createMinimalModeSourceSchema,
  toMinimalModeSourceInput,
  type MinimalModeSourceFormValues,
} from './minimal-mode-form'
import { MinimalModeModelRow } from './minimal-mode-model-row'
import type { MinimalModeSource, MinimalModeState } from './minimal-mode-types'

type MinimalModeSourceEditorProps = {
  open: boolean
  source: MinimalModeSource | null
  state: MinimalModeState
  onOpenChange: (open: boolean) => void
  onSaved: () => Promise<void>
}

export function MinimalModeSourceEditor(props: MinimalModeSourceEditorProps) {
  const { t } = useTranslation()
  const schema = useMemo(() => createMinimalModeSourceSchema(t), [t])
  const fallbackGroup = props.state.groups.includes('Free')
    ? 'Free'
    : (props.state.groups[0] ?? '')
  const defaults = useMemo(
    () => buildMinimalModeSourceDefaults(props.source, fallbackGroup),
    [props.source, fallbackGroup]
  )
  const [discoveredModels, setDiscoveredModels] = useState<string[]>([])
  const [discovering, setDiscovering] = useState(false)
  const [saving, setSaving] = useState(false)

  const form = useForm<MinimalModeSourceFormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
  })
  const models = useFieldArray({ control: form.control, name: 'models' })
  const appendModel = () => {
    models.append(
      appendEmptyMinimalModeModel(props.state.icon_keys[0] ?? 'OpenAI')
    )
  }

  useEffect(() => {
    if (props.open) {
      form.reset(defaults)
      setDiscoveredModels([])
    }
  }, [defaults, form, props.open])

  const {
    open: verificationOpen,
    methods: verificationMethods,
    state: verificationState,
    executeVerification,
    withVerification,
    cancel: cancelVerification,
    setCode: setVerificationCode,
    switchMethod: switchVerificationMethod,
  } = useSecureVerification()

  const handleDiscover = async () => {
    const baseURL = form.getValues('base_url').trim()
    const channelType = Number(form.getValues('channel_type'))
    if (!baseURL || !channelType) {
      toast.error(t('Enter the base URL and interface type first'))
      return
    }
    setDiscovering(true)
    try {
      await withVerification(async () => {
        const result = await discoverMinimalModeModels({
          source_id: props.source?.id,
          base_url: baseURL,
          channel_type: channelType,
          api_key: form.getValues('api_key').trim(),
        })
        setDiscoveredModels(result)
        toast.success(
          t('Loaded {{count}} upstream models', { count: result.length })
        )
        return result
      })
    } catch (error) {
      toast.error(extractApiErrorMessage(error, t('Failed to fetch models')))
    } finally {
      setDiscovering(false)
    }
  }

  const handleSave = async (values: MinimalModeSourceFormValues) => {
    if (!props.source && !values.api_key.trim()) {
      form.setError('api_key', { message: t('Enter an API key') })
      return
    }
    setSaving(true)
    try {
      await withVerification(async () => {
        await saveMinimalModeSource(
          toMinimalModeSourceInput(values, props.source)
        )
        await props.onSaved()
        toast.success(
          props.source ? t('Model source updated') : t('Model source created')
        )
        props.onOpenChange(false)
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Dialog open={props.open} onOpenChange={props.onOpenChange}>
        <DialogContent className='max-h-[min(90vh,860px)] overflow-y-auto sm:max-w-3xl'>
          <DialogHeader>
            <DialogTitle>
              {props.source ? t('Edit model source') : t('Add model source')}
            </DialogTitle>
            <DialogDescription>
              {t(
                'One form creates the channel, model alias, routing ability, icon, and pricing together.'
              )}
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form
              className='grid gap-5'
              onSubmit={form.handleSubmit(handleSave)}
            >
              <div className='grid gap-4 sm:grid-cols-2'>
                <FormField
                  control={form.control}
                  name='name'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Source name')}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          autoComplete='off'
                          placeholder={t('Personal OpenAI upstream')}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name='channel_type'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Interface type')}</FormLabel>
                      <Select
                        items={props.state.channel_types.map((item) => ({
                          value: String(item.id),
                          label: item.name,
                        }))}
                        value={String(field.value)}
                        onValueChange={(value) => field.onChange(Number(value))}
                      >
                        <FormControl>
                          <SelectTrigger className='w-full'>
                            <SelectValue
                              placeholder={t('Select interface type')}
                            />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent alignItemWithTrigger={false}>
                          <SelectGroup>
                            {props.state.channel_types.map((item) => (
                              <SelectItem key={item.id} value={String(item.id)}>
                                {item.name}
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
                  name='base_url'
                  render={({ field }) => (
                    <FormItem className='sm:col-span-2'>
                      <FormLabel>{t('Base URL')}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          autoComplete='url'
                          spellCheck={false}
                          placeholder='https://api.example.com'
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name='api_key'
                  render={({ field }) => (
                    <FormItem className='sm:col-span-2'>
                      <FormLabel>{t('API key')}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type='password'
                          autoComplete='new-password'
                          spellCheck={false}
                          placeholder={
                            props.source
                              ? t('Leave blank to keep the saved key')
                              : 'sk-...'
                          }
                        />
                      </FormControl>
                      {props.source?.has_api_key ? (
                        <FormDescription>
                          {t('A key is already stored and is never returned.')}
                        </FormDescription>
                      ) : null}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name='groups'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Allowed user groups')}</FormLabel>
                    <div className='grid gap-2 sm:grid-cols-3'>
                      {props.state.groups.map((group) => {
                        const checked = field.value.includes(group)
                        return (
                          <label
                            key={group}
                            className='hover:bg-muted/40 flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 transition-colors'
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(next) => {
                                field.onChange(
                                  next
                                    ? [...field.value, group]
                                    : field.value.filter(
                                        (value) => value !== group
                                      )
                                )
                              }}
                            />
                            <span className='truncate text-sm'>{group}</span>
                          </label>
                        )
                      })}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className='flex flex-wrap items-center justify-between gap-2'>
                <div>
                  <h4 className='text-sm font-medium'>{t('Models')}</h4>
                  <p className='text-muted-foreground text-xs'>
                    {t(
                      'Fetch upstream models for selection, or enter the real model name manually.'
                    )}
                  </p>
                </div>
                <div className='flex gap-2'>
                  <Button
                    type='button'
                    variant='outline'
                    disabled={discovering}
                    onClick={handleDiscover}
                  >
                    {discovering ? t('Loading...') : t('Fetch models')}
                  </Button>
                  <Button
                    type='button'
                    variant='outline'
                    onClick={appendModel}
                  >
                    {t('Add model')}
                  </Button>
                </div>
              </div>

              <div className='grid gap-3'>
                {models.fields.map((item, index) => (
                  <MinimalModeModelRow
                    key={item.id}
                    control={form.control}
                    index={index}
                    iconKeys={props.state.icon_keys}
                    discoveredModels={discoveredModels}
                    canRemove={models.fields.length > 1}
                    onRemove={() => models.remove(index)}
                  />
                ))}
              </div>

              <Button
                type='button'
                variant='outline'
                className='w-full'
                onClick={appendModel}
              >
                {t('Add model')}
              </Button>

              <DialogFooter>
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => props.onOpenChange(false)}
                >
                  {t('Cancel')}
                </Button>
                <Button type='submit' disabled={saving}>
                  {saving ? t('Saving...') : t('Save model source')}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <SecureVerificationDialog
        open={verificationOpen}
        onOpenChange={(open) => {
          if (!open) cancelVerification()
        }}
        methods={verificationMethods}
        state={verificationState}
        onVerify={async (method, code) => {
          await executeVerification(method, code)
        }}
        onCancel={cancelVerification}
        onCodeChange={setVerificationCode}
        onMethodChange={switchVerificationMethod}
      />
    </>
  )
}
