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
export type MinimalBillingMode = 'token' | 'request'
export type MinimalEndpointType = 'openai' | 'openai-response' | 'anthropic'

export type MinimalModeModel = {
  display_model: string
  upstream_model: string
  icon_key: string
  endpoint_type: MinimalEndpointType
  billing_mode: MinimalBillingMode
  model_ratio?: number
  completion_ratio?: number
  cache_ratio?: number
  request_price_usd?: number
}

export type MinimalModeSource = {
  id: number
  channel_id: number
  revision: number
  name: string
  provider_name: string
  base_url: string
  channel_type: number
  groups: string[]
  models: MinimalModeModel[]
  has_api_key: boolean
  sync_state: 'in_sync' | 'drifted' | 'missing'
}

export type MinimalModeChannelType = {
  id: number
  name: string
}

export type MinimalModeState = {
  enabled: boolean
  private_upstreams_enabled: boolean
  private_host_allowlist: string[]
  private_cidr_allowlist: string[]
  cache_degraded: boolean
  channel_types: MinimalModeChannelType[]
  icon_keys: string[]
  groups: string[]
  sources: MinimalModeSource[]
}

export type MinimalModeSettingsInput = Pick<
  MinimalModeState,
  | 'enabled'
  | 'private_upstreams_enabled'
  | 'private_host_allowlist'
  | 'private_cidr_allowlist'
>

export type MinimalModeSourceInput = {
  id?: number
  expected_revision?: number
  name: string
  base_url: string
  channel_type: number
  api_key: string
  groups: string[]
  models: MinimalModeModel[]
}

export type MinimalModeDiscoveryInput = {
  source_id?: number
  base_url: string
  channel_type: number
  api_key: string
}

export type MinimalModeResponse<T> = {
  success: boolean
  message: string
  data: T
}

export type MinimalModeBatchInput = Omit<
  MinimalModeSourceInput,
  'id' | 'expected_revision' | 'api_key'
> & { api_keys: string[] }
