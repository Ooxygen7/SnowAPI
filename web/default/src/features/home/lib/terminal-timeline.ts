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

// A fictional, English-only terminal illustration, never a live model session.
export const TERMINAL_PROMPT =
  'Make the request client resilient: retry transient failures with bounded backoff, cancel in-flight streams, and add regression tests.'

export const TERMINAL_LINES = [
  ['note', 'Inspecting the request lifecycle and its existing tests.'],
  ['command', '$ find src -name "*client*" -o -name "*stream*"'],
  ['muted', '  src/lib/api/client.ts'],
  ['muted', '  src/lib/api/stream.ts'],
  ['muted', '  src/lib/api/client.test.ts'],
  ['command', '$ rg "fetch|AbortSignal|reader" src/lib/api'],
  ['muted', '  client.ts:24  const response = await fetch(url, options)'],
  ['muted', '  stream.ts:81  const reader = response.body.getReader()'],
  ['note', 'Add bounded retries; preserve cancellation through every attempt.'],
  ['command', 'Patch src/lib/api/client.ts'],
  ['remove', '- const response = await fetch(url, options)'],
  ['add', '+ const response = await withRetry('],
  ['add', '+   () => fetch(url, { ...options, signal }),'],
  ['add', '+   { attempts: 3, backoff: [200, 400, 800], signal }'],
  ['add', '+ )'],
  ['command', '$ bun test src/lib/api/client.test.ts'],
  ['success', '  ✓ retries temporary server failures'],
  ['success', '  ✓ stops after three attempts'],
  ['success', '  ✓ does not retry authentication failures'],
  [
    'note',
    'Retry checks passed. Connect cancellation and release the stream reader.',
  ],
  ['command', 'Patch src/lib/api/stream.ts'],
  ['add', '+ const controller = new AbortController()'],
  ['add', '+ await consumeStream({ signal: controller.signal })'],
  ['add', '+ return () => controller.abort()'],
  ['command', '$ bun run typecheck'],
  ['success', '  Type check passed.'],
  ['command', '$ bun test src/lib/api'],
  ['success', '  ✓ pending retries stop when cancelled'],
  ['success', '  ✓ stream reader is released after abort'],
  ['success', '  ✓ cancellation does not trigger another request'],
  ['muted', '  Test Files  2 passed (2)'],
  ['muted', '       Tests  12 passed (12)'],
  ['muted', '    Duration  286ms'],
  [
    'note',
    'Done. Bounded retries and clean stream cancellation are ready for review.',
  ],
] as const

export const TERMINAL_SUBMIT_MS = 3000
// Bursts of output alternate with longer inspection pauses, at twice the speed.
const lineWeights = TERMINAL_LINES.map(([tone], index) =>
  tone === 'note' ? 3 : 0.55 + (index % 3) * 0.35
)
const totalWeight = lineWeights.reduce((sum, weight) => sum + weight, 0)
let accumulatedWeight = 0
export const TERMINAL_LINE_TIMES = lineWeights.map((weight) => {
  accumulatedWeight += weight
  return Math.round(3000 + (accumulatedWeight / totalWeight) * 10860)
})
export const TERMINAL_COMPLETE_MS =
  (TERMINAL_LINE_TIMES.at(-1) ?? TERMINAL_SUBMIT_MS) + 400
export const TERMINAL_CYCLE_MS = TERMINAL_COMPLETE_MS + 2000

export function getTerminalFrame(elapsed: number, reducedMotion = false) {
  const time = reducedMotion
    ? TERMINAL_COMPLETE_MS
    : Math.max(0, elapsed) % TERMINAL_CYCLE_MS
  const submitted = time >= TERMINAL_SUBMIT_MS
  return {
    submitted,
    promptLength: submitted
      ? 0
      : Math.min(
          TERMINAL_PROMPT.length,
          Math.floor((Math.max(0, time - 300) / 2350) * TERMINAL_PROMPT.length)
        ),
    lines: TERMINAL_LINE_TIMES.filter((at) => time >= at).length,
    seconds: Math.floor(
      Math.max(0, Math.min(time, TERMINAL_COMPLETE_MS) - TERMINAL_SUBMIT_MS) /
        1000
    ),
    complete: time >= TERMINAL_COMPLETE_MS,
    backgroundTime: Math.min(time, TERMINAL_COMPLETE_MS) * 2,
  }
}
