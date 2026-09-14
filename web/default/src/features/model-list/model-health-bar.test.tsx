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
import { test } from 'node:test'

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { ModelHealthBar } from './model-health-bar'

test('health timeline preserves semantic levels and unknown gaps in list and detail views', () => {
  for (const showLabel of [false, true]) {
    const markup = renderToStaticMarkup(
      createElement(ModelHealthBar, {
        modelName: 'health-test',
        successRate: 80,
        showLabel,
        hourlyHealth: [100, 95, 80, 50, null].map((successRate, hour) => ({
          hour,
          totalCount: 100,
          successCount: successRate ?? 0,
          successRate,
        })),
      })
    )
    assert.equal((markup.match(/data-health-level=/g) ?? []).length, 24)
    for (const level of ['excellent', 'good', 'warning', 'critical']) {
      assert.ok(markup.includes(`data-health-level="${level}"`))
    }
    assert.equal(
      (markup.match(/data-health-level="unknown"/g) ?? []).length,
      20
    )
    assert.ok(markup.includes('aria-valuenow="80"'))
  }
})
