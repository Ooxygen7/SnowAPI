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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { getAdminPlans } from '@/features/subscriptions/api'
import { formatTimestamp } from '@/lib/format'

import { getAdminUserSubscription, updateAdminUserSubscription } from '../api'
import type { AdminSubscriptionChange, User } from '../types'
import { SubscriptionBalanceForm } from './subscription-balance-form'
import { SubscriptionFacts } from './user-subscription-cell'
import { useUsers } from './users-provider'

export function UsersSubscriptionDialog(props: {
  user: User
  onClose: () => void
}) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const { triggerRefresh } = useUsers()
  const [selectedPlan, setSelectedPlan] = useState('')
  const [confirmation, setConfirmation] =
    useState<AdminSubscriptionChange | null>(null)
  const stateQuery = useQuery({
    queryKey: ['admin-user-subscription', props.user.id],
    queryFn: async () => {
      const result = await getAdminUserSubscription(props.user.id)
      if (!result.success) {
        throw new Error(result.message || t('Loading failed'))
      }
      return result.data ?? null
    },
  })
  const plansQuery = useQuery({
    queryKey: ['admin-subscription-plans'],
    queryFn: async () => {
      const result = await getAdminPlans()
      if (!result.success) {
        throw new Error(result.message || t('Loading failed'))
      }
      return result.data ?? []
    },
  })
  const sub = stateQuery.data
  const plans = (plansQuery.data ?? [])
    .filter((record) => record.plan.enabled && record.plan.upgrade_group)
    .sort((a, b) => a.plan.price_amount - b.plan.price_amount)
  const mutation = useMutation({
    mutationFn: async (change: AdminSubscriptionChange) => {
      const result = await updateAdminUserSubscription(props.user.id, change)
      if (!result.success) {
        throw new Error(result.message || t('Operation failed'))
      }
    },
    onSuccess: async () => {
      toast.success(t('Subscription updated'))
      setConfirmation(null)
      setSelectedPlan('')
      triggerRefresh()
      await client.invalidateQueries({
        queryKey: ['admin-user-subscription', props.user.id],
      })
    },
    onError: () => {
      setConfirmation(null)
      void stateQuery.refetch()
    },
  })
  const changing = mutation.isPending || stateQuery.isFetching
  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) props.onClose()
        }}
        title={t('Manage subscription')}
        description={props.user.username}
        contentClassName='sm:max-w-xl'
      >
        {stateQuery.isPending && <Skeleton className='h-44 w-full' />}
        {stateQuery.isError && (
          <Button variant='outline' onClick={() => void stateQuery.refetch()}>
            {t('Retry')}
          </Button>
        )}
        {stateQuery.isSuccess && (
          <div className='space-y-5'>
            {sub ? (
              <>
                <SubscriptionFacts subscription={sub} />
                <p className='text-muted-foreground text-xs'>
                  {t('Expires at')}: {formatTimestamp(sub.end_time)}
                </p>
                <SubscriptionBalanceForm
                  key={`${sub.subscription_id}:${sub.version}`}
                  subscription={sub}
                  pending={changing}
                  onSave={(change) => mutation.mutate(change)}
                />
              </>
            ) : (
              <p className='text-sm'>{t('No active subscription')} · Free</p>
            )}
            <Separator />
            <FieldGroup className='gap-3'>
              <Field>
                <FieldLabel>{t('Change subscription plan')}</FieldLabel>
                <Select
                  value={selectedPlan}
                  onValueChange={(value) => setSelectedPlan(value ?? '')}
                  items={Object.fromEntries(
                    plans.map(({ plan }) => [String(plan.id), plan.title])
                  )}
                >
                  <SelectTrigger
                    aria-label={t('Change subscription plan')}
                    disabled={changing || plansQuery.isPending}
                  >
                    <SelectValue
                      placeholder={t('Please select a subscription plan')}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {plans.map(({ plan }) => (
                        <SelectItem
                          key={plan.id}
                          value={String(plan.id)}
                          disabled={plan.id === sub?.plan_id}
                        >
                          {plan.title}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FieldDescription>
                  {t(
                    'No wallet charge. Existing expiry and used quota are retained; Free users receive a new plan term.'
                  )}
                </FieldDescription>
              </Field>
              {plansQuery.isError && (
                <Button
                  variant='outline'
                  onClick={() => void plansQuery.refetch()}
                >
                  {t('Retry')}
                </Button>
              )}
              <div className='flex flex-wrap gap-2'>
                <Button
                  disabled={changing || !selectedPlan}
                  onClick={() =>
                    setConfirmation({
                      action: 'plan',
                      plan_id: Number(selectedPlan),
                      subscription_id: sub?.subscription_id ?? 0,
                      expected_version: sub?.version ?? 0,
                    })
                  }
                >
                  {t('Change plan')}
                </Button>
                <Button
                  variant='outline'
                  disabled={changing || (!sub && props.user.group === 'Free')}
                  onClick={() =>
                    setConfirmation({
                      action: 'free',
                      subscription_id: sub?.subscription_id ?? 0,
                      expected_version: sub?.version ?? 0,
                    })
                  }
                >
                  {t('Return to Free')}
                </Button>
              </div>
            </FieldGroup>
          </div>
        )}
      </Dialog>
      <ConfirmDialog
        open={!!confirmation}
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) setConfirmation(null)
        }}
        title={t(
          confirmation?.action === 'free'
            ? 'Return to Free'
            : 'Change subscription plan'
        )}
        desc={t(
          confirmation?.action === 'free'
            ? 'Cancel the active subscription and return this user to Free? This does not refund previous payments.'
            : 'Replace the current plan and synchronize the user group? No wallet balance will be charged.'
        )}
        confirmText={t('Confirm')}
        destructive={confirmation?.action === 'free'}
        isLoading={mutation.isPending}
        handleConfirm={() => {
          if (confirmation) mutation.mutate(confirmation)
        }}
      />
    </>
  )
}
