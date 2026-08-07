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
import { ExternalLink, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TitledCard } from '@/components/ui/titled-card'
import { cn } from '@/lib/utils'

import type { TopupInfo } from '../types'

interface RedemptionCodeCardProps {
  topupInfo: TopupInfo | null
  code: string
  onCodeChange: (code: string) => void
  onRedeem: () => void
  redeeming: boolean
  className?: string
}

export function RedemptionCodeCard({
  topupInfo,
  code,
  onCodeChange,
  onRedeem,
  redeeming,
  className,
}: RedemptionCodeCardProps) {
  const { t } = useTranslation()

  if (topupInfo?.enable_redemption === false) {
    return null
  }

  return (
    <TitledCard
      title={t('Redemption Code')}
      description={t('Enter your redemption code')}
      disableHoverEffect
      className={cn('bg-muted/45 border-0', className)}
      headerClassName='border-0 px-5 pt-5 sm:px-6 sm:pt-6'
      contentClassName='px-5 pb-5 sm:px-6 sm:pb-6'
    >
      <Label htmlFor='redemption-code' className='sr-only'>
        {t('Redemption Code')}
      </Label>
      <div className='grid grid-cols-[minmax(0,1fr)_auto] gap-2'>
        <Input
          id='redemption-code'
          value={code}
          onChange={(event) => onCodeChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && code.trim() && !redeeming) {
              onRedeem()
            }
          }}
          placeholder={t('Enter your redemption code')}
          autoComplete='off'
          className='h-10 min-w-0'
        />
        <Button
          type='button'
          onClick={onRedeem}
          disabled={redeeming || !code.trim()}
          className='bg-foreground text-background hover:bg-foreground/90 hover:text-background h-10 rounded-full px-6'
        >
          {redeeming && <Loader2 className='h-4 w-4 animate-spin' />}
          {t('Redeem')}
        </Button>
      </div>

      {topupInfo?.topup_link && (
        <p className='text-muted-foreground mt-3 text-xs'>
          {t('Need a redemption code?')}{' '}
          <a
            href={topupInfo.topup_link}
            target='_blank'
            rel='noopener noreferrer'
            className='inline-flex items-center gap-1 underline-offset-4 hover:underline'
          >
            {t('Get one here')}
            <ExternalLink className='h-3 w-3' />
          </a>
        </p>
      )}
    </TitledCard>
  )
}
