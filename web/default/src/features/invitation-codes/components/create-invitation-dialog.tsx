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
import { Loader2, TicketCheck } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { CopyButton } from '@/components/copy-button'
import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

import { createInvitationCodes } from '../api'

interface CreateInvitationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}

export function CreateInvitationDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateInvitationDialogProps) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [count, setCount] = useState(1)
  const [createdCodes, setCreatedCodes] = useState<string[]>([])
  const [isCreating, setIsCreating] = useState(false)

  const reset = () => {
    setName('')
    setCount(1)
    setCreatedCodes([])
    setIsCreating(false)
  }

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen)
    if (!nextOpen) reset()
  }

  const handleCreate = async () => {
    const cleanName = name.trim()
    if (!cleanName || cleanName.length > 40) {
      toast.error(t('Name must be between 1 and 40 characters'))
      return
    }
    if (!Number.isInteger(count) || count < 1 || count > 100) {
      toast.error(t('You can create 1 to 100 invitation codes at a time'))
      return
    }

    setIsCreating(true)
    try {
      const response = await createInvitationCodes({
        name: cleanName,
        count,
      })
      if (!response.success || !response.data?.length) {
        toast.error(response.message || t('Failed to create invitation codes'))
        return
      }
      setCreatedCodes(response.data)
      onCreated()
      toast.success(
        t('Created {{count}} one-time invitation codes', {
          count: response.data.length,
        })
      )
    } finally {
      setIsCreating(false)
    }
  }

  const allCodes = createdCodes.join('\n')

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}
      title={
        createdCodes.length
          ? t('Save invitation codes now')
          : t('Create invitation codes')
      }
      description={
        createdCodes.length
          ? t(
              'For security, complete invitation codes are shown only this once.'
            )
          : t(
              'Each code creates one invited account and becomes unusable immediately after registration.'
            )
      }
      contentClassName='sm:max-w-xl'
      bodyClassName='space-y-5'
      footer={
        createdCodes.length ? (
          <Button onClick={() => handleOpenChange(false)}>
            {t('I have saved them')}
          </Button>
        ) : (
          <>
            <Button
              variant='outline'
              onClick={() => handleOpenChange(false)}
              disabled={isCreating}
            >
              {t('Cancel')}
            </Button>
            <Button onClick={handleCreate} disabled={isCreating}>
              {isCreating ? (
                <Loader2 className='h-4 w-4 animate-spin' />
              ) : (
                <TicketCheck className='h-4 w-4' />
              )}
              {t('Create')}
            </Button>
          </>
        )
      }
    >
      {createdCodes.length ? (
        <div className='space-y-3'>
          <div className='bg-muted/40 rounded-xl border p-3'>
            <Textarea
              value={allCodes}
              readOnly
              className='min-h-48 resize-none border-0 bg-transparent font-mono text-xs shadow-none focus-visible:ring-0'
            />
          </div>
          <CopyButton
            value={allCodes}
            variant='outline'
            size='default'
            className='w-full gap-2'
          >
            {t('Copy all invitation codes')}
          </CopyButton>
        </div>
      ) : (
        <>
          <div className='grid gap-2'>
            <Label htmlFor='invitation-name'>{t('Batch name')}</Label>
            <Input
              id='invitation-name'
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('For example: July beta access')}
              maxLength={40}
            />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='invitation-count'>{t('Quantity')}</Label>
            <Input
              id='invitation-count'
              type='number'
              min={1}
              max={100}
              value={count}
              onChange={(event) => setCount(Number(event.target.value))}
            />
            <p className='text-muted-foreground text-xs'>
              {t('Up to 100 one-time codes can be created per batch.')}
            </p>
          </div>
        </>
      )}
    </Dialog>
  )
}
