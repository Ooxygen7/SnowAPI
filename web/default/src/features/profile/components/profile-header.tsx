import { KeyRound } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { formatLocalCurrencyAmount } from '@/lib/currency'
import { formatQuota } from '@/lib/format'

import { getDisplayName } from '../lib'
import type { UserProfile } from '../types'
import { ChangePasswordDialog } from './dialogs/change-password-dialog'

interface ProfileHeaderProps {
  profile: UserProfile
}

function formatLimit(value: number | undefined) {
  if (!value || value <= 0) return '∞'
  return value.toLocaleString()
}

export function ProfileHeader({ profile }: ProfileHeaderProps) {
  const { t } = useTranslation()
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false)
  const policy = profile.group_policy
  const periodMinutes = Math.max(1, policy?.period_minutes ?? 1)
  const rpm = policy?.max_requests
    ? Math.max(1, Math.floor(policy.max_requests / periodMinutes))
    : 0
  const limits = [
    { label: 'RPM', value: formatLimit(rpm) },
    { label: 'TPM', value: formatLimit(policy?.tpm_limit) },
    {
      label: t('Concurrency'),
      value: formatLimit(policy?.concurrency_limit),
    },
  ]

  return (
    <>
      <div
        data-visual-region='profile-summary'
        className='grid items-stretch gap-4 lg:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)]'
      >
        <Card
          data-card-hover='false'
          className='bg-muted/45 h-full border-0 py-0'
        >
          <CardContent className='flex h-full flex-col p-5 sm:p-6'>
            <div className='flex min-h-13 flex-wrap items-start justify-between gap-4'>
              <div className='min-w-0 space-y-1'>
                <div className='flex min-w-0 items-center gap-2'>
                  <h2 className='truncate text-lg font-medium tracking-tight sm:text-xl'>
                    {getDisplayName(profile)}
                  </h2>
                  <StatusBadge
                    label={t(profile.status === 1 ? 'Active' : 'Disabled')}
                    variant={profile.status === 1 ? 'success' : 'neutral'}
                    copyable={false}
                  />
                </div>
                <p className='text-muted-foreground truncate text-sm'>
                  @{profile.username}
                </p>
              </div>
              <Button
                type='button'
                variant='ghost'
                size='sm'
                className='bg-background/70 gap-2'
                onClick={() => setPasswordDialogOpen(true)}
              >
                <KeyRound className='size-4' />
                {t('Change Password')}
              </Button>
            </div>

            <div className='mt-6 grid grid-cols-2 gap-2'>
              <div className='bg-background/55 flex min-h-20 flex-col justify-center rounded-lg px-4 py-3.5'>
                <p className='text-muted-foreground text-xs'>
                  {t('Current Balance')}
                </p>
                <p className='mt-2 text-xl font-medium tabular-nums'>
                  {formatQuota(profile.quota)}
                </p>
              </div>
              <div className='bg-background/55 flex min-h-20 flex-col justify-center rounded-lg px-4 py-3.5'>
                <p className='text-muted-foreground text-xs'>
                  {t('Cumulative recharge')}
                </p>
                <p className='mt-2 text-xl font-medium tabular-nums'>
                  {formatLocalCurrencyAmount(profile.total_topup ?? 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card
          data-card-hover='false'
          className='bg-muted/45 h-full border-0 py-0'
        >
          <CardContent className='flex h-full flex-col p-5 sm:p-6'>
            <div className='min-h-13'>
              <p className='text-muted-foreground text-xs'>{t('User group')}</p>
              <p className='mt-1 text-lg font-medium'>{profile.group}</p>
            </div>

            <div className='mt-6 grid grid-cols-3 gap-2'>
              {limits.map((limit) => (
                <div
                  key={limit.label}
                  className='bg-background/55 flex min-h-20 flex-col justify-center rounded-lg px-3 py-3 text-center'
                >
                  <p className='text-muted-foreground text-xs'>{limit.label}</p>
                  <p className='mt-1 font-mono text-sm'>{limit.value}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <ChangePasswordDialog
        open={passwordDialogOpen}
        onOpenChange={setPasswordDialogOpen}
        username={profile.username}
      />
    </>
  )
}
