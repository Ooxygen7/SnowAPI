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

import { useEffect, useRef, useState } from 'react'

import { useHomeAnimationFrame, useHomeMotion } from '../hooks/use-home-motion'
import {
  getTerminalFrame,
  TERMINAL_LINES,
  TERMINAL_PROMPT,
} from '../lib/terminal-timeline'
import { GrainBackground } from './grain-background'

export function GatewayShowcase() {
  const { ref, playing, reducedMotion } = useHomeMotion<HTMLDivElement>()
  const viewport = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLDivElement>(null)
  const renderBackground = useRef<(elapsed: number) => void>(() => {})
  const clock = useRef({ elapsed: 0, start: 0, interruptedUntil: 0 })
  const [frame, setFrame] = useState(() => getTerminalFrame(0, reducedMotion))
  const [interrupted, setInterrupted] = useState(false)

  // One clock drives both surfaces, including their shared two-second end hold.
  useHomeAnimationFrame(playing, (elapsed) => {
    clock.current.elapsed = elapsed
    if (clock.current.interruptedUntil) {
      if (elapsed < clock.current.interruptedUntil) return
      clock.current.interruptedUntil = 0
      clock.current.start = elapsed
      setInterrupted(false)
    }
    const next = getTerminalFrame(elapsed - clock.current.start)
    renderBackground.current(next.backgroundTime)
    setFrame((previous) =>
      previous.promptLength === next.promptLength &&
      previous.lines === next.lines &&
      previous.submitted === next.submitted &&
      previous.seconds === next.seconds &&
      previous.complete === next.complete
        ? previous
        : next
    )
  })
  const current = reducedMotion ? getTerminalFrame(0, true) : frame

  useEffect(() => {
    const element = viewport.current
    if (element) element.scrollTop = element.scrollHeight
  }, [current.lines, current.submitted, reducedMotion])

  useEffect(() => {
    const element = input.current
    if (element) element.scrollTop = element.scrollHeight
  }, [current.promptLength])

  return (
    <div
      ref={ref}
      className='snow-home-showcase'
      data-playing={playing && !current.complete && !interrupted}
    >
      <GrainBackground renderFrame={renderBackground} />
      <div className='snow-home-demo-window'>
        <div className='snow-home-window-bar'>
          <span className='snow-home-window-dots' aria-hidden='true'>
            <i />
            <i />
            <i />
          </span>
          <span className='snow-home-window-title'>terminal</span>
        </div>
        <div
          className='snow-home-terminal'
          data-complete={current.complete || interrupted}
        >
          <div
            ref={viewport}
            className='snow-home-terminal-scroll'
            tabIndex={0}
            role='region'
            aria-label='Scripted terminal demonstration'
            aria-live='off'
            onKeyDown={(event) => {
              if (
                event.key !== 'Escape' ||
                !playing ||
                !current.submitted ||
                current.complete
              ) {
                return
              }
              event.preventDefault()
              clock.current.interruptedUntil = clock.current.elapsed + 2000
              setInterrupted(true)
            }}
          >
            {current.submitted && (
              <p className='snow-home-terminal-request'>
                <span>❯</span> {TERMINAL_PROMPT}
              </p>
            )}
            {TERMINAL_LINES.slice(0, current.lines).map(([tone, text]) => (
              <div
                key={text}
                className='snow-home-terminal-line'
                data-tone={tone}
              >
                {text}
              </div>
            ))}
            {current.submitted && !current.complete && !interrupted && (
              <p className='snow-home-terminal-working'>
                <span className='snow-home-working-glyph' aria-hidden='true'>
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
                Working… ({current.seconds}s • Press esc to interrupt)
              </p>
            )}
            {interrupted && (
              <p className='snow-home-terminal-working'>Interrupted.</p>
            )}
          </div>
          <div
            ref={input}
            className='snow-home-terminal-input'
            aria-hidden='true'
          >
            <span>❯</span>
            <span>
              {TERMINAL_PROMPT.slice(0, current.promptLength)}
              <i className='snow-home-terminal-caret' />
            </span>
          </div>
          <div className='snow-home-terminal-status'>
            <span>~/apps/website</span>
            <span>feature/resilient-client</span>
            <span>{current.complete ? '12 tests passed' : 'workspace'}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
