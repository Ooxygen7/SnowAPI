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
// ============================================================================
// Wallet Type Definitions
// ============================================================================

/**
 * Generic API response
 */
export interface ApiResponse<T = unknown> {
  success?: boolean
  message?: string
  data?: T
}

/**
 * Standard API response types
 */
export type TopupInfoResponse = ApiResponse<TopupInfo>
export interface RedemptionResult {
  type: 'quota' | 'group'
  quota: number
  group_name?: string
  group_expires_at?: number
}

export type RedemptionResponse = ApiResponse<RedemptionResult | number>
export type AmountResponse = ApiResponse<string>
export interface EpayFormData extends Record<string, unknown> {
  out_trade_no?: string
  trade_no?: string
}

export type PaymentResponse = ApiResponse<EpayFormData> & {
  url?: string
}
/**
 * Payment method configuration
 */
export interface PaymentMethod {
  /** Display name of payment method */
  name: string
  /** Payment method type identifier */
  type: string
  /** Legacy optional color for UI display */
  color?: string
  /** Minimum topup amount for this payment method */
  min_topup?: number
  /** Optional react-icons component name or safe icon URL */
  icon?: string
}

/**
 * Topup configuration information
 */
export interface TopupInfo {
  /** Whether online topup is enabled */
  enable_online_topup: boolean
  /** Available payment methods */
  pay_methods: PaymentMethod[]
  /** Minimum topup amount for online topup */
  min_topup: number
  /** Preset amount options */
  amount_options: number[]
  /** Discount rates by amount */
  discount: Record<number, number>
  /** Optional topup link for purchasing codes */
  topup_link?: string
  /** Whether redemption code usage is enabled */
  enable_redemption?: boolean
  /** Whether compliance confirmation has been completed */
  payment_compliance_confirmed?: boolean
  /** Current compliance terms version */
  payment_compliance_terms_version?: string
}

/**
 * Preset amount option with optional discount
 */
export interface PresetAmount {
  /** Preset amount value */
  value: number
  /** Optional discount rate (0-1) */
  discount?: number
}

/**
 * Redemption code request
 */
export interface RedemptionRequest {
  /** Redemption code key */
  key: string
}

/**
 * Payment request parameters
 */
export interface PaymentRequest {
  /** Topup amount */
  amount: number
  /** Payment method identifier */
  payment_method: string
}

/**
 * Amount calculation request
 */
export interface AmountRequest {
  /** Topup amount to calculate */
  amount: number
}

/**
 * User wallet data
 */
export interface UserWalletData {
  /** User ID */
  id: number
  /** Username */
  username: string
  /** Current quota balance */
  quota: number
  /** Total used quota */
  used_quota: number
  /** Total request count */
  request_count: number
  /** User group */
  group: string
}

/**
 * Topup record status
 */
export type TopupStatus = 'success' | 'pending' | 'failed' | 'expired'

/**
 * Topup billing record
 */
export interface TopupRecord {
  /** Record ID */
  id: number
  /** User ID */
  user_id: number
  /** Topup amount (quota) */
  amount: number
  /** Payment amount (actual money paid) */
  money: number
  /** Trade/order number */
  trade_no: string
  /** Payment method type */
  payment_method: string
  /** Creation timestamp */
  create_time: number
  /** Completion timestamp */
  complete_time?: number
  /** Payment status */
  status: TopupStatus
}

/**
 * Billing history response
 */
export interface BillingHistoryResponse {
  items: TopupRecord[]
  total: number
}

/**
 * Complete order request (admin only)
 */
export interface CompleteOrderRequest {
  trade_no: string
}
