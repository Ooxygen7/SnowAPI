/*
Copyright (C) 2023-2026 QuantumNous
SPDX-License-Identifier: AGPL-3.0-or-later
*/
import i18next from 'i18next'

let messageKeys: Map<string, string> | undefined

/** Localize known dashboard messages without changing protocol markers or
 * unknown upstream diagnostics. The API also has older Chinese-only messages. */
export function localizeApiMessage(message: string): string {
  if (!message || ['success', 'error', 'bind'].includes(message)) return message
  if (!messageKeys) {
    const english = i18next.getResourceBundle('en', 'translation') as
      | Record<string, string>
      | undefined
    const chinese = i18next.getResourceBundle('zhCN', 'translation') as
      | Record<string, string>
      | undefined
    if (!english || !chinese) return message
    messageKeys = new Map()
    for (const [key, value] of Object.entries(english)) {
      messageKeys.set(key.toLowerCase(), key)
      messageKeys.set(value.toLowerCase(), key)
      if (chinese[key]) messageKeys.set(chinese[key], key)
    }
  }
  const key = messageKeys.get(message) ?? messageKeys.get(message.toLowerCase())
  return key ? i18next.t(key) : message
}
