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
import { Shield, Key, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconBadge } from '@/components/ui/icon-badge'
import { TitledCard } from '@/components/ui/titled-card'
import { useDialogs } from '@/hooks/use-dialog'

import type { UserProfile } from '../types'
import { AccessTokenDialog } from './dialogs/access-token-dialog'
import { DeleteAccountDialog } from './dialogs/delete-account-dialog'

// ============================================================================
// Profile Security Card Component
// ============================================================================

interface ProfileSecurityCardProps {
  profile: UserProfile
}

type DialogKey = 'token' | 'delete'

export function ProfileSecurityCard(props: ProfileSecurityCardProps) {
  const { t } = useTranslation()
  const dialogs = useDialogs<DialogKey>()

  const securityActions = [
    {
      icon: Key,
      title: t('Automatic Access'),
      description: t('Manage your account with scripts and the management API'),
      action: () => dialogs.open('token'),
      variant: 'default' as const,
    },
    {
      icon: Trash2,
      title: t('Delete Account'),
      description: t('Permanently delete your account and all data'),
      action: () => dialogs.open('delete'),
      variant: 'destructive' as const,
    },
  ]

  return (
    <>
      <TitledCard
        title={t('Security')}
        description={t('Manage your security settings and account access')}
        icon={<Shield className='h-4 w-4' />}
        iconTone='success'
        disableHoverEffect
      >
        <div className='grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3'>
          {securityActions.map((item) => (
            <button
              key={item.title}
              type='button'
              onClick={item.action}
              className={`bg-muted/45 hover:bg-muted/70 flex min-h-20 items-center gap-3 rounded-lg p-4 text-left transition-colors ${
                item.variant === 'destructive' ? 'hover:bg-destructive/10' : ''
              }`}
            >
              <IconBadge tone='neutral' size='sm'>
                <item.icon />
              </IconBadge>
              <div className='min-w-0'>
                <p className='text-sm font-medium'>{item.title}</p>
                <p className='text-muted-foreground mt-1 text-xs'>
                  {item.description}
                </p>
              </div>
            </button>
          ))}
        </div>
      </TitledCard>

      {/* Dialogs */}
      <AccessTokenDialog
        userId={props.profile.id}
        open={dialogs.isOpen('token')}
        onOpenChange={(open) =>
          open ? dialogs.open('token') : dialogs.close('token')
        }
      />

      <DeleteAccountDialog
        open={dialogs.isOpen('delete')}
        onOpenChange={(open) =>
          open ? dialogs.open('delete') : dialogs.close('delete')
        }
        username={props.profile.username}
      />
    </>
  )
}
