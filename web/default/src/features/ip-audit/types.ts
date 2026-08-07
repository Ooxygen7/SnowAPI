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
export type IPAuditAnomalyFilter = 'all' | 'any' | 'count' | 'rpm' | 'normal'
export type IPAuditSort = 'risk' | 'requests' | 'rpm' | 'users' | 'recent'

export type IPAuditUser = {
  user_id: number
  username: string
  request_count: number
}

export type IPAuditItem = {
  ip: string
  request_count: number
  user_count: number
  peak_rpm: number
  first_seen_at: number
  last_seen_at: number
  request_count_anomaly: boolean
  shared_user_anomaly: boolean
  count_anomaly: boolean
  rpm_anomaly: boolean
  users: IPAuditUser[]
  users_truncated: boolean
}

export type IPAuditData = {
  generated_at: number
  start_at: number
  end_at: number
  retention_days: number
  thresholds: {
    request_count: number
    user_count: number
    rpm: number
  }
  summary: {
    total_ips: number
    total_users: number
    total_requests: number
    count_anomaly_ips: number
    rpm_anomaly_ips: number
    any_anomaly_ips: number
  }
  items: IPAuditItem[]
  page: number
  page_size: number
  total: number
}

export type IPAuditResponse = {
  success: boolean
  message?: string
  data: IPAuditData
}

export type IPAuditParams = {
  windowMinutes: number
  requestThreshold: number
  userThreshold: number
  rpmThreshold: number
  page: number
  pageSize: number
  query: string
  anomaly: IPAuditAnomalyFilter
  sort: IPAuditSort
}

export type RelayAuditMinute = {
  user_id: number
  username: string
  ip: string
  minute: number
  request_count: number
  first_seen_at: number
  last_seen_at: number
  country_iso: string
  asn_number: number
  asn_organization: string
  resolver_version: string
  ip_kind: string
  evidence_eligible: boolean
}

export type RelayBan = {
  user_id: number
  source: 'automatic' | 'manual'
  reason: string
  starts_at: number
  expires_at: number
  revoked_at: number
  revoked_by: number
  evaluation_after: number
  evidence: string
  version: number
  created_at: number
  updated_at: number
}

export type RelayBanEvent = {
  id: number
  user_id: number
  event_type:
    | 'apply'
    | 'reapply'
    | 'extend'
    | 'revoke'
    | 'expire'
    | 'shadow_match'
  source: 'automatic' | 'manual'
  reason: string
  starts_at: number
  expires_at: number
  evaluation_after: number
  evidence: string
  actor_user_id: number
  state_version: number
  created_at: number
}

export type RelayBanReadiness = {
  configured_mode: 'disabled' | 'shadow' | 'enforced'
  effective_mode: 'disabled' | 'shadow' | 'enforced'
  proxy_ready: boolean
  resolver: {
    ready: boolean
    country_ready: boolean
    asn_ready: boolean
    version: string
    error_code?: string
  }
  enforced_ready: boolean
  blocking: string[]
}

export type RelayRiskEvidence = {
  distinct_ips: number
  eligible_ips: number
  country_count: number
  asn_count: number
  rapid_ip_switch: boolean
  minimum_gap_seconds: number
  triggers_ban: boolean
  observations: RelayAuditMinute[]
}

export type RelayRiskItem = {
  user_id: number
  username: string
  request_count: number
  first_seen_at: number
  last_seen_at: number
  evidence: RelayRiskEvidence
  ban?: RelayBan
}

export type RelayRiskData = {
  generated_at: number
  start_at: number
  end_at: number
  retention_days: number
  summary: {
    total_users: number
    total_requests: number
    triggering_users: number
    actively_banned: number
  }
  items: RelayRiskItem[]
  page: number
  page_size: number
  total: number
}

export type RelayRiskResponse = {
  success: boolean
  message?: string
  data: {
    risk: RelayRiskData
    readiness: RelayBanReadiness
  }
}

export type RelayBanListItem = {
  ban: RelayBan
  username: string
  display_name: string
  status: 'active' | 'expired' | 'revoked'
}

export type RelayBanListData = {
  items: RelayBanListItem[]
  page: number
  page_size: number
  total: number
}

export type RelayBanSelfStatus = {
  active: boolean
  code: 'user_relay_banned'
  starts_at?: number
  expires_at?: number
}

export type RelayBanMutation = {
  reason?: string
  permanent?: boolean
  duration_seconds?: number
}

export type RelayBanUserSearchItem = {
  id: number
  username: string
  display_name?: string
}
