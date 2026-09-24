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

import { getTerminalFrame } from './terminal-timeline'

test('the command is typed into the input before being submitted to the transcript', () => {
  assert.deepEqual(getTerminalFrame(0, 100), {
    submitted: false,
    promptLength: 0,
    steps: 0,
    complete: false,
  })
  assert.equal(getTerminalFrame(2950, 100).promptLength, 50)
  assert.equal(getTerminalFrame(5500, 100).promptLength, 100)
  assert.deepEqual(getTerminalFrame(6100, 100), {
    submitted: true,
    promptLength: 0,
    steps: 0,
    complete: false,
  })
})

test('tool results appear in sequence before completion, then the demonstration restarts', () => {
  assert.equal(getTerminalFrame(10000, 100).steps, 2)
  assert.equal(getTerminalFrame(25000, 100).complete, false)
  assert.deepEqual(getTerminalFrame(30000, 100), {
    submitted: true,
    promptLength: 0,
    steps: 9,
    complete: true,
  })
  assert.deepEqual(getTerminalFrame(34000, 100), getTerminalFrame(0, 100))
})

test('reduced motion exposes the completed transcript without requiring playback', () => {
  assert.deepEqual(getTerminalFrame(0, 100, true), {
    submitted: true,
    promptLength: 0,
    steps: 9,
    complete: true,
  })
  assert.deepEqual(
    getTerminalFrame(2000, 100, true),
    getTerminalFrame(0, 100, true)
  )
})
