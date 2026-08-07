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
import test from 'node:test'

import { isMinimalModeRestrictedPath } from './minimal-mode-navigation.ts'

test('minimal mode guards channel, model pool, and pricing administration', () => {
  const restrictedPaths = [
    '/channels',
    '/channels/edit/1',
    '/models/metadata',
    '/system-settings/billing/model-pricing',
    '/system-settings/billing/group-pricing/history',
  ]

  for (const pathname of restrictedPaths) {
    assert.equal(isMinimalModeRestrictedPath(pathname), true, pathname)
  }
})

test('minimal mode keeps its landing page and unrelated routes available', () => {
  const availablePaths = [
    '/dashboard/overview',
    '/model-list',
    '/system-settings/billing/quota',
    '/system-settings/operations/minimal',
  ]

  for (const pathname of availablePaths) {
    assert.equal(isMinimalModeRestrictedPath(pathname), false, pathname)
  }
})
