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
import { Link } from '@tanstack/react-router'
import { ArrowUpRight, RefreshCw, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { useAccessToken } from '../../hooks'

// ============================================================================
// Access Token Dialog Component
// ============================================================================

interface AccessTokenDialogProps {
  userId: number
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AccessTokenDialog({
  userId,
  open,
  onOpenChange,
}: AccessTokenDialogProps) {
  const { t } = useTranslation()
  const { token, generating, generate } = useAccessToken()
  let generateLabel = token ? t('Regenerate') : t('Generate')
  if (generating) generateLabel = t('Generating...')

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('Automatic Access')}
      description={t(
        'Use a management token to automate your account. Model calls still require an API key.'
      )}
      contentClassName='sm:max-w-md'
      contentHeight='auto'
      bodyClassName='space-y-4'
      footer={
        <>
          <Button
            type='button'
            variant='outline'
            onClick={() => onOpenChange(false)}
          >
            {t('Close')}
          </Button>
          <Button
            type='button'
            onClick={generate}
            disabled={generating}
            className='gap-2'
          >
            {generating ? (
              <Loader2 className='h-4 w-4 animate-spin' />
            ) : (
              <RefreshCw className='h-4 w-4' />
            )}
            {generateLabel}
          </Button>
        </>
      }
    >
      <div className='my-6 space-y-4'>
        <div className='space-y-2'>
          <Label htmlFor='token'>{t('Token')}</Label>
          <div className='flex gap-2'>
            <Input
              id='token'
              type='text'
              value={token}
              readOnly
              className='font-mono text-xs'
              placeholder={t('Click "Generate" to create a token')}
            />
            <CopyButton
              value={token}
              variant='outline'
              className='size-9'
              iconClassName='size-4'
              tooltip={t('Copy token')}
              aria-label={t('Copy token')}
            />
          </div>
          <p className='text-muted-foreground text-xs'>
            {t(
              'Generating a token replaces the previous one. Keep it private; it has no automatic expiry.'
            )}
          </p>
        </div>
        <div className='bg-muted/50 flex flex-col gap-3 rounded-lg p-3 text-sm'>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <Label>{t('User ID')}</Label>
            <code>{userId}</code>
          </div>
          <p className='text-muted-foreground font-mono text-xs break-all'>
            {window.location.origin}/api
          </p>
          <Button
            variant='outline'
            nativeButton={false}
            render={
              <Link to='/auto-access' onClick={() => onOpenChange(false)} />
            }
          >
            {t('Management API documentation')}
            <ArrowUpRight aria-hidden='true' />
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
