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
import { Activity, Network, ShieldAlert, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

import type { IPAuditData } from '../types'

type IPAuditSummaryProps = {
  data?: IPAuditData
  loading: boolean
  numberFormat: Intl.NumberFormat
}

export function IPAuditSummary({
  data,
  loading,
  numberFormat,
}: IPAuditSummaryProps) {
  const { t } = useTranslation()
  const metrics = [
    {
      label: t('Observed IPs'),
      value: data?.summary.total_ips,
      note: t('{{count}} users in window', {
        count: numberFormat.format(data?.summary.total_users ?? 0),
      }),
      icon: Network,
      tone: 'text-sky-600 dark:text-sky-400',
    },
    {
      label: t('Count anomalies'),
      value: data?.summary.count_anomaly_ips,
      note: t('Volume or shared-user threshold'),
      icon: Users,
      tone: 'text-amber-600 dark:text-amber-400',
    },
    {
      label: t('RPM anomalies'),
      value: data?.summary.rpm_anomaly_ips,
      note: t('Peak minute above threshold'),
      icon: Activity,
      tone: 'text-red-600 dark:text-red-400',
    },
    {
      label: t('Audited requests'),
      value: data?.summary.total_requests,
      note: t('{{count}} IPs need review', {
        count: numberFormat.format(data?.summary.any_anomaly_ips ?? 0),
      }),
      icon: ShieldAlert,
      tone: 'text-violet-600 dark:text-violet-400',
    },
  ]

  return (
    <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
      {metrics.map((metric) => (
        <Card key={metric.label} size='sm'>
          <CardContent className='flex items-start justify-between gap-3'>
            <div className='min-w-0'>
              <div className='text-muted-foreground text-xs font-medium'>
                {metric.label}
              </div>
              {loading ? (
                <Skeleton className='mt-2 h-7 w-20' />
              ) : (
                <div className='mt-1 text-2xl font-semibold tracking-tight tabular-nums'>
                  {numberFormat.format(metric.value ?? 0)}
                </div>
              )}
              <div className='text-muted-foreground mt-1 truncate text-xs'>
                {metric.note}
              </div>
            </div>
            <div className='bg-muted rounded-lg p-2'>
              <metric.icon className={`size-4 ${metric.tone}`} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
