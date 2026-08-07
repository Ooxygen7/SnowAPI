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
import { api } from '@/lib/api'

import type {
  IPAuditParams,
  IPAuditResponse,
  RelayBan,
  RelayBanEvent,
  RelayBanListData,
  RelayBanMutation,
  RelayBanReadiness,
  RelayBanSelfStatus,
  RelayBanUserSearchItem,
  RelayRiskResponse,
} from './types'

export async function getIPAudit(
  params: IPAuditParams
): Promise<IPAuditResponse> {
  const response = await api.get<IPAuditResponse>('/api/log/ip-audit', {
    params: {
      window_minutes: params.windowMinutes,
      request_threshold: params.requestThreshold,
      user_threshold: params.userThreshold,
      rpm_threshold: params.rpmThreshold,
      page: params.page,
      page_size: params.pageSize,
      query: params.query,
      anomaly: params.anomaly,
      sort: params.sort,
    },
  })
  return response.data
}

type ApiEnvelope<T> = {
  success: boolean
  message?: string
  data: T
}

export async function getRelayRisk(params: {
  page: number
  pageSize: number
  query: string
  sort: 'recent' | 'requests' | 'oldest'
}): Promise<RelayRiskResponse> {
  const response = await api.get<RelayRiskResponse>('/api/log/ip-audit', {
    params: {
      window_minutes: 10,
      page: params.page,
      page_size: params.pageSize,
      query: params.query,
      sort: params.sort,
    },
  })
  return response.data
}

export async function getRelayBans(params: {
  page: number
  pageSize: number
  query: string
  status: 'all' | 'active' | 'inactive'
}): Promise<RelayBanListData> {
  const response = await api.get<ApiEnvelope<RelayBanListData>>(
    '/api/user-relay-bans',
    {
      params: {
        page: params.page,
        page_size: params.pageSize,
        query: params.query,
        status: params.status === 'all' ? '' : params.status,
      },
    }
  )
  return unwrap(response.data)
}

export async function getRelayBanReadiness(): Promise<RelayBanReadiness> {
  const response = await api.get<ApiEnvelope<RelayBanReadiness>>(
    '/api/user-relay-bans/readiness'
  )
  return unwrap(response.data)
}

export async function getRelayBanEvents(
  userId: number
): Promise<RelayBanEvent[]> {
  const response = await api.get<ApiEnvelope<RelayBanEvent[]>>(
    `/api/user-relay-bans/${userId}/events`
  )
  return unwrap(response.data)
}

export async function applyRelayBan(
  userId: number,
  payload: RelayBanMutation
): Promise<RelayBan> {
  const response = await api.post<ApiEnvelope<RelayBan>>(
    `/api/user-relay-bans/${userId}`,
    payload
  )
  return unwrap(response.data)
}

export async function extendRelayBan(
  userId: number,
  payload: RelayBanMutation
): Promise<RelayBan> {
  const response = await api.post<ApiEnvelope<RelayBan>>(
    `/api/user-relay-bans/${userId}/extend`,
    payload
  )
  return unwrap(response.data)
}

export async function revokeRelayBan(
  userId: number,
  reason: string
): Promise<RelayBan> {
  const response = await api.post<ApiEnvelope<RelayBan>>(
    `/api/user-relay-bans/${userId}/revoke`,
    { reason }
  )
  return unwrap(response.data)
}

export async function getSelfRelayBan(): Promise<RelayBanSelfStatus> {
  const response = await api.get<ApiEnvelope<RelayBanSelfStatus>>(
    '/api/user/relay-ban',
    { skipErrorHandler: true, disableDuplicate: true }
  )
  return unwrap(response.data)
}

export async function searchRelayBanUsers(
  keyword: string
): Promise<RelayBanUserSearchItem[]> {
  const response = await api.get<
    ApiEnvelope<{
      items: RelayBanUserSearchItem[]
    }>
  >('/api/user/search', {
    params: { keyword, p: 1, page_size: 20 },
  })
  return unwrap(response.data).items ?? []
}

function unwrap<T>(response: ApiEnvelope<T>): T {
  if (!response.success) {
    throw new Error(response.message || 'Request failed')
  }
  return response.data
}
