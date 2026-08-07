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
  MinimalModeDiscoveryInput,
  MinimalModeResponse,
  MinimalModeSettingsInput,
  MinimalModeSource,
  MinimalModeSourceInput,
  MinimalModeState,
} from './minimal-mode-types'

export const minimalModeQueryKey = ['minimal-mode'] as const

function unwrapMinimalModeResponse<T>(response: MinimalModeResponse<T>): T {
  if (!response.success) {
    throw new Error(response.message || 'Minimal mode request failed')
  }
  return response.data
}

function normalizeMinimalModeState(state: MinimalModeState): MinimalModeState {
  return {
    ...state,
    private_host_allowlist: Array.isArray(state.private_host_allowlist)
      ? state.private_host_allowlist
      : [],
    private_cidr_allowlist: Array.isArray(state.private_cidr_allowlist)
      ? state.private_cidr_allowlist
      : [],
    channel_types: Array.isArray(state.channel_types)
      ? state.channel_types
      : [],
    icon_keys: Array.isArray(state.icon_keys) ? state.icon_keys : [],
    groups: Array.isArray(state.groups) ? state.groups : [],
    sources: Array.isArray(state.sources)
      ? state.sources.map((source) => ({
          ...source,
          groups: Array.isArray(source.groups) ? source.groups : [],
          models: Array.isArray(source.models) ? source.models : [],
        }))
      : [],
  }
}

export async function getMinimalMode(): Promise<MinimalModeState> {
  const response =
    await api.get<MinimalModeResponse<MinimalModeState>>('/api/minimal-mode')
  return normalizeMinimalModeState(unwrapMinimalModeResponse(response.data))
}

export async function updateMinimalMode(
  input: MinimalModeSettingsInput
): Promise<MinimalModeState> {
  const response = await api.put<MinimalModeResponse<MinimalModeState>>(
    '/api/minimal-mode',
    input
  )
  return normalizeMinimalModeState(unwrapMinimalModeResponse(response.data))
}

export async function discoverMinimalModeModels(
  input: MinimalModeDiscoveryInput
): Promise<string[]> {
  const response = await api.post<MinimalModeResponse<string[]>>(
    '/api/minimal-mode/upstream-models',
    input,
    { skipErrorHandler: true }
  )
  return unwrapMinimalModeResponse(response.data)
}

export async function saveMinimalModeSource(
  input: MinimalModeSourceInput
): Promise<MinimalModeSource> {
  const endpoint = input.id
    ? `/api/minimal-mode/sources/${input.id}`
    : '/api/minimal-mode/sources'
  const response = input.id
    ? await api.put<MinimalModeResponse<MinimalModeSource>>(endpoint, input)
    : await api.post<MinimalModeResponse<MinimalModeSource>>(endpoint, input)
  return unwrapMinimalModeResponse(response.data)
}

export async function adoptMinimalModeSource(
  source: MinimalModeSource
): Promise<MinimalModeSource> {
  const response = await api.post<MinimalModeResponse<MinimalModeSource>>(
    `/api/minimal-mode/sources/${source.id}/adopt`,
    { expected_revision: source.revision }
  )
  return unwrapMinimalModeResponse(response.data)
}

export async function detachMinimalModeSource(
  source: MinimalModeSource
): Promise<void> {
  await api.post(`/api/minimal-mode/sources/${source.id}/detach`, {
    expected_revision: source.revision,
  })
}

export async function deleteMinimalModeSource(
  source: MinimalModeSource
): Promise<void> {
  await api.delete(`/api/minimal-mode/sources/${source.id}`, {
    data: { expected_revision: source.revision },
  })
}
