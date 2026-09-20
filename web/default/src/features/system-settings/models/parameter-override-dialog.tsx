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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { lazy, Suspense, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Dialog } from '@/components/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { getChannel, updateChannel } from '@/features/channels/api'
import type { Channel } from '@/features/channels/types'
import { extractApiErrorMessage } from '@/lib/secure-verification'

import { FormNavigationGuard } from '../components/form-navigation-guard'
import {
  getMinimalMode,
  minimalModeQueryKey,
} from '../operations/minimal-mode-api'

const ParamOverrideEditorDialog = lazy(() =>
  import('@/features/channels/components/dialogs/param-override-editor-dialog').then(
    (module) => ({ default: module.ParamOverrideEditorDialog })
  )
)

type ParameterOverrideDialogProps = { channelId: number; onClose: () => void }

export function ParameterOverrideDialog(props: ParameterOverrideDialogProps) {
  const { t } = useTranslation()
  const query = useQuery({
    queryKey: ['channels', 'parameter-override-detail', props.channelId],
    queryFn: () => getChannel(props.channelId),
    staleTime: 0,
    refetchOnWindowFocus: false,
  })
  if (query.data?.data && !query.isFetching) {
    return (
      <ParameterOverrideForm
        channel={query.data.data}
        onClose={props.onClose}
      />
    )
  }
  return (
    <Dialog
      open
      title={t('Parameter Override')}
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
    >
      {query.isError || query.data?.success === false ? (
        <Alert variant='destructive'>
          <AlertDescription>
            {t('Failed to load')}
            <Button variant='link' onClick={() => void query.refetch()}>
              {t('Retry')}
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <Skeleton className='h-48 w-full' />
      )}
    </Dialog>
  )
}

function ParameterOverrideForm(props: {
  channel: Channel
  onClose: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const initialValue = props.channel.param_override ?? ''
  const [value, setValue] = useState(initialValue)
  const [visualOpen, setVisualOpen] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)
  const dirty = value !== initialValue
  const minimal = useQuery({
    queryKey: minimalModeQueryKey,
    queryFn: getMinimalMode,
  })
  const managed = minimal.data?.sources.some(
    (source) => source.channel_id === props.channel.id
  )
  const mutation = useMutation({
    mutationFn: async () => {
      const trimmed = value.trim()
      if (trimmed) {
        let parsed: unknown
        try {
          parsed = JSON.parse(trimmed)
        } catch {
          throw new Error(t('Parameter override must be valid JSON format'))
        }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error(t('Parameter override must be a valid JSON object'))
        }
      }
      // Send only this field. Never round-trip credentials, routing or pricing.
      const response = await updateChannel(props.channel.id, {
        param_override: trimmed,
      })
      if (!response.success) {
        throw new Error(response.message || t('Failed to update channel'))
      }
    },
    onSuccess: () => {
      toast.success(t('Channel updated successfully'))
      props.onClose()
      void queryClient.invalidateQueries({ queryKey: ['channels'] })
      void queryClient.invalidateQueries({ queryKey: minimalModeQueryKey })
    },
    onError: (error) =>
      toast.error(extractApiErrorMessage(error, t('Failed to update channel'))),
  })
  const close = () => {
    if (mutation.isPending) return
    if (dirty) setDiscardOpen(true)
    else props.onClose()
  }

  return (
    <>
      <FormNavigationGuard when={dirty && !mutation.isSuccess} />
      <Dialog
        open
        title={t('Parameter Override')}
        description={`${props.channel.name} · ID ${props.channel.id}`}
        footerClassName='mx-0 mb-0 p-0 sm:mx-0 sm:mb-0 sm:p-0'
        onOpenChange={(open) => {
          if (!open) close()
        }}
        footer={
          <>
            <Button
              variant='outline'
              onClick={close}
              disabled={mutation.isPending}
            >
              {t('Cancel')}
            </Button>
            <Button
              onClick={() => mutation.mutate()}
              disabled={!dirty || mutation.isPending}
            >
              {mutation.isPending ? t('Saving...') : t('Save changes')}
            </Button>
          </>
        }
      >
        <div className='grid gap-4'>
          <p className='text-muted-foreground text-sm'>
            {t(
              'Override request parameters. Cannot override stream parameter.'
            )}
          </p>
          {managed && (
            <Alert>
              <AlertDescription>
                {t(
                  'After changing a managed channel here, adopt its current state in Minimal Mode before editing the model source again.'
                )}
                <Link
                  className='underline underline-offset-4'
                  to='/system-settings/operations/$section'
                  params={{ section: 'minimal' }}
                >
                  {t('Minimal Mode')}
                </Link>
              </AlertDescription>
            </Alert>
          )}
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <Label htmlFor='channel-parameter-override'>JSON</Label>
            <div className='flex gap-2'>
              <Button
                variant='outline'
                disabled={mutation.isPending}
                onClick={() => setVisualOpen(true)}
              >
                {t('Visual edit')}
              </Button>
              <Button
                variant='ghost'
                disabled={mutation.isPending}
                onClick={() => setValue('')}
              >
                {t('Clear')}
              </Button>
            </div>
          </div>
          <Textarea
            id='channel-parameter-override'
            value={value}
            onChange={(event) => setValue(event.target.value)}
            rows={12}
            spellCheck={false}
            className='min-h-48 font-mono text-sm'
            placeholder='{}'
            disabled={mutation.isPending}
          />
        </div>
      </Dialog>
      {visualOpen && (
        <Suspense fallback={null}>
          <ParamOverrideEditorDialog
            open
            value={value}
            onOpenChange={setVisualOpen}
            onSave={setValue}
          />
        </Suspense>
      )}
      <ConfirmDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        title={t('Unsaved changes')}
        desc={t('You have unsaved changes. Are you sure you want to leave?')}
        confirmText={t('Leave')}
        cancelBtnText={t('Stay')}
        handleConfirm={props.onClose}
      />
    </>
  )
}
