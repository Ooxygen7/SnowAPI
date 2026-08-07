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
/**
 * Shared constants for usage logs feature
 */
import type { LogStatistics, UsageLogView } from './types'

// ============================================================================
// Default Values
// ============================================================================

/**
 * Default log statistics when no data is available
 */
export const DEFAULT_LOG_STATS: LogStatistics = {
  quota: 0,
  rpm: 0,
  tpm: 0,
}

/**
 * Default empty logs data
 */
export const DEFAULT_LOGS_DATA = {
  items: [],
  total: 0,
}

// ============================================================================
// Log Type Enum
// ============================================================================

/**
 * Log type enum values
 */
export const LOG_TYPE_ENUM = {
  UNKNOWN: 0,
  TOPUP: 1,
  CONSUME: 2,
  MANAGE: 3,
  SYSTEM: 4,
  ERROR: 5,
  REFUND: 6,
  LOGIN: 7,
} as const

// ============================================================================
// Time Range Presets
// ============================================================================

/**
 * Quick time range presets for filter dialog
 */
export const TIME_RANGE_PRESETS = [
  { days: 1, label: '24 Hours' },
  { days: 7, label: '7 Days' },
  { days: 14, label: '14 Days' },
  { days: 30, label: '30 Days' },
] as const

// ============================================================================
// Common Logs Configuration
// ============================================================================

/**
 * Log types configuration for filtering and display
 */
export const LOG_TYPES = [
  { value: 0, label: 'Unknown', color: 'default' },
  { value: 1, label: 'Top-up', color: 'cyan' },
  { value: 2, label: 'Consume', color: 'green' },
  { value: 3, label: 'Manage', color: 'orange' },
  { value: 4, label: 'System', color: 'purple' },
  { value: 5, label: 'Error', color: 'red' },
  { value: 6, label: 'Refund', color: 'blue' },
  { value: 7, label: 'Login', color: 'teal' },
] as const

export const USAGE_LOG_VIEW_TYPES: Record<UsageLogView, readonly number[]> = {
  consume: [LOG_TYPE_ENUM.CONSUME, LOG_TYPE_ENUM.ERROR],
  billing: [LOG_TYPE_ENUM.TOPUP, LOG_TYPE_ENUM.REFUND],
  other: [
    LOG_TYPE_ENUM.UNKNOWN,
    LOG_TYPE_ENUM.MANAGE,
    LOG_TYPE_ENUM.SYSTEM,
    LOG_TYPE_ENUM.LOGIN,
  ],
}

// ============================================================================
// Log Type Checkers (Constants)
// ============================================================================

/**
 * Log types that are displayable (have detailed info)
 */
export const DISPLAYABLE_LOG_TYPES = [0, 2, 5, 6] as const

/**
 * Log types that show timing info
 */
export const TIMING_LOG_TYPES = [2, 5] as const
