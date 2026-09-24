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
export type CatalogModelHealthHour = {
  hour: number
  totalCount: number
  successCount: number
  successRate: number | null
}

export type ModelHealthBucket = {
  hour: number
  total_count: number
  success_count: number
  probe_count: number
  success_rate: number
}

export type ModelHealthModel = {
  model_name: string
  display_name?: string
  channel_id?: number
  icon?: string
  buckets: ModelHealthBucket[]
}

export type ModelHealthData = {
  generated_at: number
  start_hour: number
  end_hour: number
  window_hours: number
  models: ModelHealthModel[]
}

export type ModelHealthResponse = {
  success: boolean
  message?: string
  data: ModelHealthData
}

export type CatalogModel = {
  id: string
  name: string
  hasAccess: boolean
  fundingSource?: 'subscription_only' | 'wallet_only'
  provider: string
  providerIcon?: string
  description?: string
  inputPrice: string | null
  outputPrice: string | null
  priceUnitKey: 'Per 1M tokens' | 'request'
  requestPrice: string | null
  successRate: number | null
  hourlyHealth: CatalogModelHealthHour[]
  endpoints: string[]
}
