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

import {
  modelFundingSourcesSchema,
  replaceModelFundingSelection,
} from './model-funding-sources'

test('changing one funding list preserves the other and cannot silently move models', () => {
  const rules = { a: 'subscription_only', b: 'wallet_only' } as const
  assert.deepEqual(
    JSON.parse(
      replaceModelFundingSelection(rules, 'subscription_only', ['b', 'c'])
    ),
    {
      b: 'wallet_only',
      c: 'subscription_only',
    }
  )
  assert.deepEqual(
    JSON.parse(replaceModelFundingSelection(rules, 'wallet_only', [])),
    { a: 'subscription_only' }
  )
  assert.equal(
    replaceModelFundingSelection(
      { a: 'subscription_only' },
      'subscription_only',
      []
    ),
    '{}'
  )
  assert.deepEqual(
    JSON.parse(replaceModelFundingSelection({}, 'wallet_only', ['a'])),
    { a: 'wallet_only' }
  )
})

test('funding configuration rejects malformed or conflicting values', () => {
  for (const invalid of [
    null,
    [],
    { a: 'wallet_first' },
    { a: ['wallet_only', 'subscription_only'] },
  ]) {
    assert.equal(modelFundingSourcesSchema.safeParse(invalid).success, false)
  }
  assert.equal(modelFundingSourcesSchema.safeParse({}).success, true)
})
