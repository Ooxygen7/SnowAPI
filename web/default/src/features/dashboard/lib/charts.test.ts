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

import type { QuotaDataItem } from '../types'
import { processChartData, processUserChartData } from './charts'

const rows: QuotaDataItem[] = [
  {
    model_name: 'mimo-v2.5',
    username: 'alice',
    created_at: 1_790_467_200,
    quota: 250000,
    count: 12,
    token_used: 900,
  },
  {
    model_name: 'deepseek-v4.1-flash',
    username: 'bob',
    created_at: 1_790_467_200,
    quota: 500000,
    count: 3,
    token_used: 300,
  },
  {
    model_name: 'glm-5.3',
    username: 'carol',
    created_at: 1_790_470_800,
    quota: 100000,
    count: 7,
    token_used: 600,
  },
]

interface ModelColorScale {
  domain: string[]
  range: string[]
}

function assertDistinctDataColors(colors: string[]) {
  assert.equal(new Set(colors).size, colors.length)
  for (const color of colors) {
    assert.match(color, /^#[\da-f]{6}$/i)
    const channels = [1, 3, 5].map((offset) =>
      Number.parseInt(color.slice(offset, offset + 2), 16)
    )
    assert.ok(
      Math.max(...channels) - Math.min(...channels) >= 60,
      `Expected a categorical color, got ${color}`
    )
  }
}

describe('dashboard categorical colors', () => {
  test('models retain distinct colors across consumption, trend, pie and ranking views', () => {
    const charts = processChartData(rows, 'hour')
    const expected = charts.spec_line.color as ModelColorScale
    assertDistinctDataColors(expected.range)
    for (const spec of [
      charts.spec_area,
      charts.spec_model_line,
      charts.spec_pie,
      charts.spec_rank_bar,
    ]) {
      assert.deepEqual(spec.color, expected)
    }
    const reversed = processChartData([...rows].reverse(), 'hour')
    assert.deepEqual(reversed.spec_line.color, expected)
    assert.equal(charts.totalCountDisplay, '22')
  })

  test('user ranking and trend share distinct colors regardless of input order', () => {
    const charts = processUserChartData(rows, 'hour')
    const expected = charts.spec_user_rank.color as {
      specified: Record<string, string>
    }
    assertDistinctDataColors(Object.values(expected.specified))
    assert.deepEqual(charts.spec_user_trend.color, expected)
    assert.deepEqual(
      processUserChartData([...rows].reverse(), 'hour').spec_user_rank.color,
      expected
    )
  })
})
