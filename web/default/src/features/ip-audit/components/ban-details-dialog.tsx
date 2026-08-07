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
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import { getRelayBanEvents } from '../api'
import type { RelayAuditMinute, RelayBan, RelayRiskEvidence } from '../types'

type BanDetailsDialogProps = {
  open: boolean
  user: { id: number; username: string }
  ban?: RelayBan
  evidence?: RelayRiskEvidence
  formatTime: (timestamp: number) => string
  onOpenChange: (open: boolean) => void
}

type StoredEvidence = {
  country_count?: number
  asn_count?: number
  eligible_ips?: number
  minimum_gap_seconds?: number
  observations?: RelayAuditMinute[]
}

export function BanDetailsDialog({
  open,
  user,
  ban,
  evidence,
  formatTime,
  onOpenChange,
}: BanDetailsDialogProps) {
  const { t } = useTranslation()
  const eventsQuery = useQuery({
    queryKey: ['relay-ban-events', user.id],
    queryFn: () => getRelayBanEvents(user.id),
    enabled: open,
  })
  const storedEvidence = useMemo(() => parseEvidence(ban?.evidence), [ban])
  const observations =
    evidence?.observations ?? storedEvidence?.observations ?? []
  const countryCount =
    evidence?.country_count ?? storedEvidence?.country_count ?? 0
  const asnCount = evidence?.asn_count ?? storedEvidence?.asn_count ?? 0
  const eligibleIPs =
    evidence?.eligible_ips ?? storedEvidence?.eligible_ips ?? 0
  const minimumGap =
    evidence?.minimum_gap_seconds ?? storedEvidence?.minimum_gap_seconds ?? -1

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[85vh] overflow-y-auto sm:max-w-4xl'>
        <DialogHeader>
          <DialogTitle>{t('Relay ban evidence and history')}</DialogTitle>
          <DialogDescription>
            {user.username} · #{user.id}
          </DialogDescription>
        </DialogHeader>

        <section className='space-y-3'>
          <h3 className='text-sm font-medium'>{t('Evidence')}</h3>
          <div className='grid grid-cols-2 gap-2 sm:grid-cols-4'>
            <EvidenceMetric label={t('Eligible IPs')} value={eligibleIPs} />
            <EvidenceMetric label={t('Countries')} value={countryCount} />
            <EvidenceMetric label={t('ASNs')} value={asnCount} />
            <EvidenceMetric
              label={t('Minimum switch gap')}
              value={
                minimumGap < 0
                  ? '—'
                  : t('{{count}} seconds', { count: minimumGap })
              }
            />
          </div>

          {observations.length === 0 ? (
            <div className='text-muted-foreground rounded-lg border px-3 py-8 text-center text-sm'>
              {t('No stored evidence')}
            </div>
          ) : (
            <div className='rounded-lg border'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('IP address')}</TableHead>
                    <TableHead>{t('Country')}</TableHead>
                    <TableHead>{t('ASN')}</TableHead>
                    <TableHead className='text-right'>
                      {t('Requests')}
                    </TableHead>
                    <TableHead>{t('Observed')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {observations.map((item) => (
                    <TableRow key={`${item.ip}-${item.minute}`}>
                      <TableCell>
                        <code className='font-mono text-xs'>{item.ip}</code>
                      </TableCell>
                      <TableCell>{item.country_iso || '—'}</TableCell>
                      <TableCell>
                        <div>AS{item.asn_number || '—'}</div>
                        <div className='text-muted-foreground max-w-52 truncate text-xs'>
                          {item.asn_organization || '—'}
                        </div>
                      </TableCell>
                      <TableCell className='text-right'>
                        {item.request_count}
                      </TableCell>
                      <TableCell>
                        <div className='text-xs'>
                          {formatTime(item.last_seen_at)}
                        </div>
                        <div className='text-muted-foreground text-xs'>
                          {formatTime(item.first_seen_at)}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>

        <section className='space-y-3 border-t pt-4'>
          <h3 className='text-sm font-medium'>{t('History')}</h3>
          {eventsQuery.isLoading && (
            <div className='space-y-2'>
              {[0, 1, 2].map((item) => (
                <Skeleton key={item} className='h-12 w-full' />
              ))}
            </div>
          )}
          {!eventsQuery.isLoading && (eventsQuery.data ?? []).length === 0 && (
            <div className='text-muted-foreground rounded-lg border px-3 py-8 text-center text-sm'>
              {t('No ban history')}
            </div>
          )}
          {!eventsQuery.isLoading && (eventsQuery.data ?? []).length > 0 && (
            <div className='rounded-lg border'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('Event')}</TableHead>
                    <TableHead>{t('Source')}</TableHead>
                    <TableHead>{t('Reason')}</TableHead>
                    <TableHead>{t('Actor')}</TableHead>
                    <TableHead>{t('Time')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(eventsQuery.data ?? []).map((event) => (
                    <TableRow key={event.id}>
                      <TableCell>
                        <EventBadge eventType={event.event_type} />
                      </TableCell>
                      <TableCell>
                        {event.source === 'manual'
                          ? t('Manual')
                          : t('Automatic')}
                      </TableCell>
                      <TableCell className='max-w-72 whitespace-normal'>
                        {event.reason || '—'}
                      </TableCell>
                      <TableCell>
                        {event.actor_user_id > 0
                          ? `#${event.actor_user_id}`
                          : t('System')}
                      </TableCell>
                      <TableCell>{formatTime(event.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      </DialogContent>
    </Dialog>
  )
}

function EventBadge({
  eventType,
}: {
  eventType:
    | 'apply'
    | 'reapply'
    | 'extend'
    | 'revoke'
    | 'expire'
    | 'shadow_match'
}) {
  const { t } = useTranslation()
  let label = t('Applied')
  if (eventType === 'reapply') label = t('Reapplied')
  if (eventType === 'extend') label = t('Extended')
  if (eventType === 'revoke') label = t('Revoked')
  if (eventType === 'expire') label = t('Expired')
  if (eventType === 'shadow_match') label = t('Shadow match')
  return <Badge variant='outline'>{label}</Badge>
}

function EvidenceMetric({
  label,
  value,
}: {
  label: string
  value: string | number
}) {
  return (
    <div className='bg-muted/40 rounded-lg border px-3 py-2'>
      <div className='text-muted-foreground text-xs'>{label}</div>
      <div className='mt-1 font-medium tabular-nums'>{value}</div>
    </div>
  )
}

function parseEvidence(value?: string): StoredEvidence | null {
  if (!value) return null
  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object') return null
    return parsed as StoredEvidence
  } catch {
    return null
  }
}
