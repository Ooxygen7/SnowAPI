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
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { StatusBadge } from '@/components/status-badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  SecureVerificationDialog,
  useSecureVerification,
} from '@/features/auth/secure-verification'

import { SettingsSection } from '../components/settings-section'
import {
  adoptMinimalModeSource,
  deleteMinimalModeSource,
  detachMinimalModeSource,
  getMinimalMode,
  minimalModeQueryKey,
  updateMinimalMode,
} from './minimal-mode-api'
import { MinimalModeSourceEditor } from './minimal-mode-source-editor'
import type {
  MinimalModeSettingsInput,
  MinimalModeSource,
} from './minimal-mode-types'

const emptySettings: MinimalModeSettingsInput = {
  enabled: false,
  private_upstreams_enabled: false,
  private_host_allowlist: [],
  private_cidr_allowlist: [],
}

function linesToValues(value: string): string[] {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
}

export function MinimalModeSection() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: minimalModeQueryKey,
    queryFn: getMinimalMode,
  })
  const [settings, setSettings] = useState(emptySettings)
  const [privateHosts, setPrivateHosts] = useState('')
  const [privateCIDRs, setPrivateCIDRs] = useState('')
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingSource, setEditingSource] = useState<MinimalModeSource | null>(
    null
  )
  const [templateSource, setTemplateSource] =
    useState<MinimalModeSource | null>(null)
  const [deleteSource, setDeleteSource] = useState<MinimalModeSource | null>(
    null
  )
  const [savingSettings, setSavingSettings] = useState(false)
  const [pendingSourceID, setPendingSourceID] = useState<number | null>(null)

  useEffect(() => {
    if (!query.data) return
    setSettings({
      enabled: query.data.enabled,
      private_upstreams_enabled: query.data.private_upstreams_enabled,
      private_host_allowlist: query.data.private_host_allowlist,
      private_cidr_allowlist: query.data.private_cidr_allowlist,
    })
    setPrivateHosts(query.data.private_host_allowlist.join('\n'))
    setPrivateCIDRs(query.data.private_cidr_allowlist.join('\n'))
  }, [query.data])

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

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: minimalModeQueryKey })
  }

  const handleSaveSettings = async () => {
    setSavingSettings(true)
    try {
      await withVerification(async () => {
        await updateMinimalMode({
          ...settings,
          private_host_allowlist: linesToValues(privateHosts),
          private_cidr_allowlist: linesToValues(privateCIDRs),
        })
        await refresh()
        toast.success(t('Minimal mode settings saved'))
      })
    } finally {
      setSavingSettings(false)
    }
  }

  const handleAdopt = async (source: MinimalModeSource) => {
    setPendingSourceID(source.id)
    try {
      await withVerification(async () => {
        await adoptMinimalModeSource(source)
        await refresh()
        toast.success(t('Current full-mode changes adopted'))
      })
    } finally {
      setPendingSourceID(null)
    }
  }

  const handleDetach = async (source: MinimalModeSource) => {
    setPendingSourceID(source.id)
    try {
      await withVerification(async () => {
        await detachMinimalModeSource(source)
        await refresh()
        toast.success(t('Management link detached; generated resources remain'))
      })
    } finally {
      setPendingSourceID(null)
    }
  }

  const handleDelete = async () => {
    if (!deleteSource) return
    const source = deleteSource
    setPendingSourceID(source.id)
    try {
      await withVerification(async () => {
        await deleteMinimalModeSource(source)
        setDeleteSource(null)
        await refresh()
        toast.success(t('Model source and exclusive resources deleted'))
      })
    } finally {
      setPendingSourceID(null)
    }
  }

  if (query.isError) {
    return (
      <SettingsSection title={t('Minimal Mode')}>
        <Alert variant='destructive'>
          <AlertTitle>{t('Unable to load minimal mode')}</AlertTitle>
          <AlertDescription>
            {t('Check your channel permissions and try again.')}
          </AlertDescription>
        </Alert>
      </SettingsSection>
    )
  }

  if (query.isLoading || !query.data) {
    return (
      <SettingsSection title={t('Minimal Mode')}>
        <div className='grid gap-3'>
          <Skeleton className='h-20 w-full rounded-[10px]' />
          <Skeleton className='h-36 w-full rounded-[10px]' />
        </div>
      </SettingsSection>
    )
  }

  return (
    <SettingsSection title={t('Minimal Mode')}>
      <div className='grid gap-4'>
        {query.data.cache_degraded ? (
          <Alert variant='destructive'>
            <AlertTitle>{t('Runtime cache needs attention')}</AlertTitle>
            <AlertDescription>
              {t(
                'The database commit succeeded, but runtime caches could not be fully refreshed. Restart or inspect the service before relying on new routes.'
              )}
            </AlertDescription>
          </Alert>
        ) : null}

        <div className='bg-muted/15 flex items-center justify-between gap-4 rounded-[10px] border p-4'>
          <div className='min-w-0 space-y-1'>
            <Label
              htmlFor='minimal-mode-enabled'
              className='text-sm font-medium'
            >
              {t('Use minimal self-hosted workflow')}
            </Label>
            <p className='text-muted-foreground text-xs leading-5'>
              {t(
                'When enabled, channel and price-pool setup are replaced by the managed model sources below. Turning it off restores the full controls without deleting data.'
              )}
            </p>
          </div>
          <Switch
            id='minimal-mode-enabled'
            checked={settings.enabled}
            onCheckedChange={(enabled) =>
              setSettings((current) => ({ ...current, enabled }))
            }
          />
        </div>

        <details className='group rounded-[10px] border'>
          <summary className='cursor-pointer list-none px-4 py-3 text-sm font-medium'>
            {t('Private upstream access')}
            <span className='text-muted-foreground ml-2 text-xs font-normal'>
              {t('Advanced')}
            </span>
          </summary>
          <div className='grid gap-4 border-t p-4'>
            <div className='flex items-center justify-between gap-4'>
              <div>
                <Label htmlFor='minimal-private-upstreams'>
                  {t('Allow explicitly listed private upstreams')}
                </Label>
                <p className='text-muted-foreground mt-1 text-xs'>
                  {t(
                    'Both a hostname rule and a CIDR rule must match. Metadata, loopback, link-local, and special-use targets remain blocked.'
                  )}
                </p>
              </div>
              <Switch
                id='minimal-private-upstreams'
                checked={settings.private_upstreams_enabled}
                onCheckedChange={(private_upstreams_enabled) =>
                  setSettings((current) => ({
                    ...current,
                    private_upstreams_enabled,
                  }))
                }
              />
            </div>
            {settings.private_upstreams_enabled ? (
              <div className='grid gap-4 sm:grid-cols-2'>
                <div className='grid gap-2'>
                  <Label htmlFor='minimal-private-hosts'>
                    {t('Allowed hosts, one per line')}
                  </Label>
                  <Textarea
                    id='minimal-private-hosts'
                    value={privateHosts}
                    onChange={(event) => setPrivateHosts(event.target.value)}
                    placeholder={'inference.internal\n*.ai.internal'}
                    rows={4}
                  />
                </div>
                <div className='grid gap-2'>
                  <Label htmlFor='minimal-private-cidrs'>
                    {t('Allowed CIDRs, one per line')}
                  </Label>
                  <Textarea
                    id='minimal-private-cidrs'
                    value={privateCIDRs}
                    onChange={(event) => setPrivateCIDRs(event.target.value)}
                    placeholder={'10.20.0.0/16\nfd12:3456::/48'}
                    rows={4}
                  />
                </div>
              </div>
            ) : null}
          </div>
        </details>

        <div className='flex justify-end'>
          <Button disabled={savingSettings} onClick={handleSaveSettings}>
            {savingSettings ? t('Saving...') : t('Save minimal mode settings')}
          </Button>
        </div>

        <div className='mt-2 flex flex-wrap items-center justify-between gap-3'>
          <div>
            <h3 className='text-sm font-semibold'>
              {t('Managed model sources')}
            </h3>
            <p className='text-muted-foreground text-xs'>
              {t(
                'Each source owns only the channel, aliases, model metadata, abilities, and prices it created.'
              )}
            </p>
          </div>
          <Button
            onClick={() => {
              setEditingSource(null)
              setTemplateSource(null)
              setEditorOpen(true)
            }}
          >
            {t('Add model source')}
          </Button>
        </div>

        {query.data.sources.length === 0 ? (
          <div className='border-border/70 grid min-h-32 place-items-center rounded-[10px] border border-dashed px-6 text-center'>
            <div>
              <p className='text-sm font-medium'>{t('No model sources yet')}</p>
              <p className='text-muted-foreground mt-1 text-xs'>
                {t(
                  'Add your first real upstream model to publish it in the model list.'
                )}
              </p>
            </div>
          </div>
        ) : (
          <div className='divide-y overflow-hidden rounded-[10px] border'>
            {query.data.sources.map((source) => {
              const pending = pendingSourceID === source.id
              let status = t('Managed resources missing')
              if (source.sync_state === 'in_sync') {
                status = t('In sync')
              } else if (source.sync_state === 'drifted') {
                status = t('Changed outside minimal mode')
              }
              return (
                <div
                  key={source.id}
                  className='hover:bg-muted/20 flex flex-col gap-3 p-3 transition-colors sm:flex-row sm:items-center sm:justify-between'
                >
                  <div className='min-w-0'>
                    <div className='flex flex-wrap items-center gap-2'>
                      <p className='truncate text-sm font-medium'>
                        {source.name}
                      </p>
                      <StatusBadge
                        variant={
                          source.sync_state === 'in_sync'
                            ? 'success'
                            : 'warning'
                        }
                      >
                        {status}
                      </StatusBadge>
                    </div>
                    <p className='text-muted-foreground mt-1 truncate font-mono text-xs'>
                      {source.base_url}
                    </p>
                    <p className='text-muted-foreground mt-1 text-xs'>
                      {t('{{count}} models · groups: {{groups}}', {
                        count: source.models.length,
                        groups: source.groups.join(', '),
                      })}
                    </p>
                  </div>
                  <div className='flex flex-wrap gap-2'>
                    {source.sync_state === 'in_sync' && (
                      <Button
                        size='sm'
                        variant='outline'
                        disabled={pending}
                        onClick={() => {
                          setEditingSource(null)
                          setTemplateSource(source)
                          setEditorOpen(true)
                        }}
                      >
                        {t('Add channels from configuration')}
                      </Button>
                    )}
                    {source.sync_state === 'in_sync' ? (
                      <Button
                        size='sm'
                        variant='outline'
                        disabled={pending}
                        onClick={() => {
                          setEditingSource(source)
                          setTemplateSource(null)
                          setEditorOpen(true)
                        }}
                      >
                        {t('Edit')}
                      </Button>
                    ) : (
                      <Button
                        size='sm'
                        variant='outline'
                        disabled={pending}
                        onClick={() => handleAdopt(source)}
                      >
                        {t('Adopt current state')}
                      </Button>
                    )}
                    <Button
                      size='sm'
                      variant='ghost'
                      disabled={pending}
                      onClick={() => handleDetach(source)}
                    >
                      {t('Detach')}
                    </Button>
                    <Button
                      size='sm'
                      variant='ghost'
                      disabled={pending || source.sync_state !== 'in_sync'}
                      onClick={() => setDeleteSource(source)}
                    >
                      {t('Delete')}
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <MinimalModeSourceEditor
        open={editorOpen}
        source={editingSource}
        template={templateSource}
        state={query.data}
        onOpenChange={setEditorOpen}
        onSaved={refresh}
      />

      <AlertDialog
        open={Boolean(deleteSource)}
        onOpenChange={(open) => {
          if (!open) setDeleteSource(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('Delete this model source?')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'Its in-sync channel, model aliases, abilities, and exclusive prices will be removed. Logs and shared resources are preserved.'
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              {t('Delete model source')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
    </SettingsSection>
  )
}
