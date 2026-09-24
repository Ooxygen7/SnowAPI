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
  getTerminalFrame,
  TERMINAL_COMPLETE_MS,
  TERMINAL_CYCLE_MS,
  TERMINAL_LINE_TIMES,
  TERMINAL_LINES,
  TERMINAL_PROMPT,
} from './terminal-timeline'

test('the prompt types in the input before moving to the transcript', () => {
  assert.equal(getTerminalFrame(0).promptLength, 0)
  assert.equal(
    getTerminalFrame(1475).promptLength,
    Math.floor(TERMINAL_PROMPT.length / 2)
  )
  assert.equal(getTerminalFrame(2750).promptLength, TERMINAL_PROMPT.length)
  assert.equal(getTerminalFrame(3000).submitted, true)
  assert.equal(getTerminalFrame(3000).promptLength, 0)
  assert.equal(getTerminalFrame(3000).lines, 0)
})

test('each output line arrives independently, with a running work timer', () => {
  TERMINAL_LINE_TIMES.forEach((at, index) => {
    assert.equal(getTerminalFrame(at - 1).lines, index)
    assert.equal(getTerminalFrame(at).lines, index + 1)
  })
  assert.equal(getTerminalFrame(8500).seconds, 5)
  const gaps = TERMINAL_LINE_TIMES.slice(1).map(
    (at, index) => at - TERMINAL_LINE_TIMES[index]
  )
  assert.ok(new Set(gaps).size > 2)
  assert.equal(TERMINAL_COMPLETE_MS, 14260)
  assert.equal(getTerminalFrame(TERMINAL_COMPLETE_MS - 1).complete, false)
})

test('terminal and background hold the finished frame for exactly two seconds, then reset together', () => {
  const done = getTerminalFrame(TERMINAL_COMPLETE_MS)
  assert.equal(done.complete, true)
  assert.equal(done.lines, TERMINAL_LINES.length)
  assert.deepEqual(getTerminalFrame(TERMINAL_COMPLETE_MS + 1999), done)
  assert.equal(TERMINAL_CYCLE_MS - TERMINAL_COMPLETE_MS, 2000)
  assert.deepEqual(
    getTerminalFrame(TERMINAL_COMPLETE_MS + 2000),
    getTerminalFrame(0)
  )
  assert.deepEqual(
    getTerminalFrame(TERMINAL_CYCLE_MS * 3 + 7500),
    getTerminalFrame(7500)
  )
})

test('reduced motion exposes the complete demonstration without playback', () => {
  assert.deepEqual(
    getTerminalFrame(0, true),
    getTerminalFrame(TERMINAL_COMPLETE_MS)
  )
  assert.deepEqual(getTerminalFrame(2000, true), getTerminalFrame(0, true))
})
