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
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { aggregateModelHealth } from './model-list-data.ts'
import type { ModelHealthModel } from './types'

describe('live model health', () => {
  test('new models use observed request counts and update on refreshed snapshots', () => {
    const snapshot: ModelHealthModel = {
      model_name: 'mimo-v2.5',
      channel_id: 42,
      buckets: [
        {
          hour: 100,
          total_count: 0,
          success_count: 0,
          probe_count: 0,
          success_rate: 0,
        },
        {
          hour: 200,
          total_count: 10,
          success_count: 8,
          probe_count: 2,
          success_rate: 80,
        },
      ],
    }
    const health = aggregateModelHealth([snapshot]).get('mimo-v2.5')
    assert.equal(health?.successRate, 80)
    assert.deepEqual(
      health?.hourlyHealth.map((hour) => hour.successRate),
      [null, 80]
    )
    const refreshed = {
      ...snapshot,
      buckets: [
        ...snapshot.buckets,
        {
          hour: 300,
          total_count: 2,
          success_count: 0,
          probe_count: 1,
          success_rate: 0,
        },
      ],
    }
    assert.equal(
      aggregateModelHealth([refreshed]).get('mimo-v2.5')?.successRate,
      40
    )
    assert.equal(aggregateModelHealth([]).has('mimo-v2.5'), false)
  })
})
