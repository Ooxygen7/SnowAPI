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

// The terminal is a scripted product illustration, not a live model session.
export const TERMINAL_CYCLE_MS = 34000
export const TERMINAL_COMPLETE_MS = 27000
export const TERMINAL_STEP_TIMES = [
  6800, 9000, 11500, 14300, 17000, 19600, 22200, 24900, 27000,
]

export function getTerminalFrame(
  elapsed: number,
  promptLength: number,
  reducedMotion = false
) {
  const time = reducedMotion
    ? TERMINAL_COMPLETE_MS
    : Math.max(0, elapsed) % TERMINAL_CYCLE_MS
  const submitted = time >= 6000
  return {
    submitted,
    promptLength: submitted
      ? 0
      : Math.min(
          promptLength,
          Math.floor((Math.max(0, time - 600) / 4700) * promptLength)
        ),
    steps: TERMINAL_STEP_TIMES.filter((at) => time >= at).length,
    complete: time >= TERMINAL_COMPLETE_MS,
  }
}
