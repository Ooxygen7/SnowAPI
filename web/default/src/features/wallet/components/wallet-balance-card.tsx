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
import { useTranslation } from 'react-i18next'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { formatQuota } from '@/lib/format'

interface WalletBalanceCardProps {
  balance: number
}

export function WalletBalanceCard(props: WalletBalanceCardProps) {
  const { t } = useTranslation()

  return (
    <Card
      data-card-hover='false'
      className='bg-muted/45 gap-0 overflow-hidden py-0 ring-0'
    >
      <CardHeader className='flex flex-row items-start justify-between gap-4 px-5 pt-5 sm:px-6 sm:pt-6'>
        <div className='flex min-w-0 flex-col gap-1'>
          <CardTitle className='text-sm font-medium'>
            {t('Current Balance')}
          </CardTitle>
          <CardDescription className='text-xs leading-5'>
            {t('Available for all priced model usage')}
          </CardDescription>
        </div>
        <span
          aria-hidden='true'
          className='bg-foreground text-background flex size-9 shrink-0 items-center justify-center rounded-full font-mono text-sm font-medium'
        >
          $
        </span>
      </CardHeader>
      <CardContent className='px-5 pt-8 pb-5 sm:px-6 sm:pt-10 sm:pb-6'>
        <p className='text-foreground font-mono text-2xl leading-none font-medium tracking-tight break-all tabular-nums'>
          {formatQuota(props.balance)}
        </p>
        <div
          aria-hidden='true'
          className='bg-foreground mt-5 h-0.5 w-12 rounded-full'
        />
      </CardContent>
    </Card>
  )
}
