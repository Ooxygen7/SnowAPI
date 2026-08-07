import type { TFunction } from 'i18next'
import { z } from 'zod'

import { parseQuotaFromDollars, quotaUnitsToDollars } from '@/lib/format'

import {
  REDEMPTION_VALIDATION,
  getRedemptionFormErrorMessages,
} from '../constants'
import type { RedemptionFormData, Redemption } from '../types'

export function getRedemptionFormSchema(t: TFunction) {
  const msg = getRedemptionFormErrorMessages(t)
  return z
    .object({
      name: z
        .string()
        .min(REDEMPTION_VALIDATION.NAME_MIN_LENGTH, msg.NAME_LENGTH_INVALID)
        .max(REDEMPTION_VALIDATION.NAME_MAX_LENGTH, msg.NAME_LENGTH_INVALID),
      type: z.enum(['quota', 'group']),
      quota_dollars: z.number().min(0),
      group_name: z.string(),
      group_duration_days: z
        .number()
        .int()
        .min(0)
        .max(3650, t('Duration cannot exceed 3650 days')),
      expired_time: z.date().optional(),
      count: z
        .number()
        .min(REDEMPTION_VALIDATION.COUNT_MIN, msg.COUNT_INVALID)
        .max(REDEMPTION_VALIDATION.COUNT_MAX, msg.COUNT_INVALID)
        .optional(),
    })
    .superRefine((data, context) => {
      if (data.type === 'quota' && data.quota_dollars <= 0) {
        context.addIssue({
          code: 'custom',
          path: ['quota_dollars'],
          message: t('Quota must be a positive number'),
        })
      }
      if (data.type === 'group' && !data.group_name.trim()) {
        context.addIssue({
          code: 'custom',
          path: ['group_name'],
          message: t('Group is required'),
        })
      }
    })
}

export type RedemptionFormValues = {
  name: string
  type: 'quota' | 'group'
  quota_dollars: number
  group_name: string
  group_duration_days: number
  expired_time?: Date
  count?: number
}

export const REDEMPTION_FORM_DEFAULT_VALUES: RedemptionFormValues = {
  name: '',
  type: 'quota',
  quota_dollars: 10,
  group_name: '',
  group_duration_days: 0,
  expired_time: undefined,
  count: 1,
}

export function transformFormDataToPayload(
  data: RedemptionFormValues
): RedemptionFormData {
  return {
    name: data.name,
    type: data.type,
    quota:
      data.type === 'quota' ? parseQuotaFromDollars(data.quota_dollars) : 0,
    group_name: data.type === 'group' ? data.group_name.trim() : '',
    group_duration_minutes:
      data.type === 'group' ? data.group_duration_days * 24 * 60 : 0,
    expired_time: data.expired_time
      ? Math.floor(data.expired_time.getTime() / 1000)
      : 0,
    count: data.count || 1,
  }
}

export function transformRedemptionToFormDefaults(
  redemption: Redemption
): RedemptionFormValues {
  return {
    name: redemption.name,
    type: redemption.type,
    quota_dollars: quotaUnitsToDollars(redemption.quota),
    group_name: redemption.group_name,
    group_duration_days:
      redemption.group_duration_minutes > 0
        ? Math.ceil(redemption.group_duration_minutes / (24 * 60))
        : 0,
    expired_time:
      redemption.expired_time > 0
        ? new Date(redemption.expired_time * 1000)
        : undefined,
    count: 1,
  }
}
