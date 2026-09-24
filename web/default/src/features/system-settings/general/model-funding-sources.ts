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

import * as z from 'zod'

export const modelFundingSourcesSchema = z.record(
  z.string().min(1),
  z.enum(['subscription_only', 'wallet_only'])
)
export type ModelFundingSources = z.infer<typeof modelFundingSourcesSchema>
export type ModelFundingSource = ModelFundingSources[string]

export function replaceModelFundingSelection(
  rules: ModelFundingSources,
  source: ModelFundingSource,
  selected: string[]
): string {
  const entries = Object.entries(rules).filter(([, value]) => value !== source)
  const occupied = new Set(entries.map(([name]) => name))
  for (const name of selected) {
    if (!occupied.has(name)) entries.push([name, source])
  }
  return JSON.stringify(
    Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b)))
  )
}
