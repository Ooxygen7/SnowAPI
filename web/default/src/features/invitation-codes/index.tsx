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
import { useQueryClient } from '@tanstack/react-query'
import { Plus, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { Button } from '@/components/ui/button'

import { CreateInvitationDialog } from './components/create-invitation-dialog'
import { InvitationList } from './components/invitation-list'

export function InvitationCodes() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)

  return (
    <>
      <SectionPageLayout>
        <SectionPageLayout.Title>
          {t('Invitation codes')}
        </SectionPageLayout.Title>
        <SectionPageLayout.Actions>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className='h-4 w-4' />
            {t('Create invitation codes')}
          </Button>
        </SectionPageLayout.Actions>
        <SectionPageLayout.Content>
          <div className='space-y-5'>
            <div className='border-border/80 bg-muted/20 flex items-start gap-3 rounded-xl border p-4'>
              <ShieldCheck className='mt-0.5 h-5 w-5 shrink-0' />
              <div>
                <p className='text-sm font-medium'>
                  {t('One code, one account')}
                </p>
                <p className='text-muted-foreground mt-1 text-sm leading-6'>
                  {t(
                    'Used invitation codes are retained for audit and cannot be enabled or deleted.'
                  )}
                </p>
              </div>
            </div>
            <InvitationList />
          </div>
        </SectionPageLayout.Content>
      </SectionPageLayout>

      <CreateInvitationDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() =>
          queryClient.invalidateQueries({ queryKey: ['invitation-codes'] })
        }
      />
    </>
  )
}
