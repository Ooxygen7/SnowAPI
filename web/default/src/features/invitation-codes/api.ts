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

import type { ApiResponse, InvitationListResponse } from './types'

export async function getInvitationCodes(params: {
  page: number
  pageSize: number
  keyword?: string
  status?: number
}): Promise<InvitationListResponse> {
  const response = await api.get('/api/invitation/', {
    params: {
      p: params.page,
      page_size: params.pageSize,
      keyword: params.keyword || undefined,
      status: params.status || undefined,
    },
  })
  return response.data
}

export async function createInvitationCodes(data: {
  name: string
  count: number
}): Promise<ApiResponse<string[]>> {
  const response = await api.post('/api/invitation/', data)
  return response.data
}

export async function updateInvitationCodeStatus(
  id: number,
  status: number
): Promise<ApiResponse> {
  const response = await api.patch(`/api/invitation/${id}/status`, { status })
  return response.data
}

export async function deleteInvitationCode(id: number): Promise<ApiResponse> {
  const response = await api.delete(`/api/invitation/${id}`)
  return response.data
}
