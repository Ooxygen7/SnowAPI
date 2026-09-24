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

import { Pause, Play, RotateCcw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useHomeAnimationFrame, useHomeMotion } from '../hooks/use-home-motion'
import { getTerminalFrame } from '../lib/terminal-timeline'
import { GrainBackground } from './grain-background'

function TerminalTranscript(props: {
  playing: boolean
  reducedMotion: boolean
  onPause: () => void
}) {
  const { t } = useTranslation()
  const viewport = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLDivElement>(null)
  const prompt = t(
    'Add resilient SnowAPI requests: retry transient errors, support stream cancellation, and cover both with tests.'
  )
  const [frame, setFrame] = useState(() =>
    getTerminalFrame(0, prompt.length, props.reducedMotion)
  )
  useHomeAnimationFrame(props.playing, (elapsed) => {
    const next = getTerminalFrame(elapsed, prompt.length)
    setFrame((previous) => {
      if (
        previous.promptLength === next.promptLength &&
        previous.steps === next.steps &&
        previous.submitted === next.submitted &&
        previous.complete === next.complete
      ) {
        return previous
      }
      return next
    })
  })
  const current = props.reducedMotion
    ? getTerminalFrame(0, prompt.length, true)
    : frame
  const steps = [
    {
      command: t('Plan summary'),
      detail: t(
        'Inspect the client → add bounded retries and cancellation → run regression tests.'
      ),
      tone: 'plan',
    },
    {
      command: 'Read src/lib/snowapi.ts',
      detail: t(
        'Read the request client and streaming handler. Found 4 call sites.'
      ),
      tone: 'tool',
    },
    {
      command: 'Grep "fetch|AbortSignal" src/',
      detail:
        'src/lib/snowapi.ts:24\nsrc/hooks/use-chat.ts:81\nsrc/lib/__tests__/snowapi.test.ts:16',
      tone: 'tool',
    },
    {
      command: 'Update src/lib/snowapi.ts',
      detail:
        '- const response = await fetch(url, options)\n+ const response = await withRetry(() => fetch(url, options), {\n+   attempts: 3, backoff: [200, 400, 800], signal\n+ })',
      tone: 'diff',
    },
    {
      command: 'Bash bun test snowapi.test.ts',
      detail: t(
        '✓ Retries transient failures\n✓ Stops after 3 attempts\n✓ Does not retry authentication errors'
      ),
      tone: 'success',
    },
    {
      command: t('Progress summary'),
      detail: t(
        'Retry tests pass. Next: release the reader and stop pending retries when the request is cancelled.'
      ),
      tone: 'plan',
    },
    {
      command: 'Update src/hooks/use-chat.ts',
      detail:
        '+ const controller = new AbortController()\n+ await streamChat(messages, { signal: controller.signal })\n+ return () => controller.abort()',
      tone: 'diff',
    },
    {
      command: 'Bash bun run typecheck && bun test',
      detail: t(
        '✓ Type check passed\n✓ Stream cancellation verified\nTest Files  2 passed (2)\n     Tests  12 passed (12)'
      ),
      tone: 'success',
    },
    {
      command: t('Done. Ready for review.'),
      detail: t(
        'Added bounded retries and clean stream cancellation. All 12 tests pass; no API keys are stored in source.'
      ),
      tone: 'done',
    },
  ]

  useEffect(() => {
    const element = viewport.current
    if (element) element.scrollTop = element.scrollHeight
  }, [current.steps, current.submitted, props.reducedMotion])

  useEffect(() => {
    const element = input.current
    if (element) element.scrollTop = element.scrollHeight
  }, [current.promptLength])

  return (
    <div className='snow-home-terminal' data-complete={current.complete}>
      <div
        ref={viewport}
        className='snow-home-terminal-scroll'
        tabIndex={0}
        role='region'
        aria-label={t('Scripted coding demonstration')}
        aria-live='off'
        onWheel={props.onPause}
        onFocus={props.onPause}
      >
        <div className='snow-home-terminal-welcome'>
          <span className='snow-home-claude-mark' aria-hidden='true'>
            ✳
          </span>
          <div>
            <strong>Claude Code</strong>
            <p>SnowAPI · ~/apps/website</p>
          </div>
        </div>
        <p className='snow-home-terminal-connection'>
          ANTHROPIC_BASE_URL=https://api.unsnow.org
        </p>
        {current.submitted && (
          <p className='snow-home-terminal-request'>
            <span>❯</span> {prompt}
          </p>
        )}
        {steps.slice(0, current.steps).map((step) => (
          <div
            key={step.command}
            className='snow-home-terminal-step'
            data-tone={step.tone}
          >
            <p className='snow-home-terminal-command'>
              <span aria-hidden='true'>●</span> {step.command}
            </p>
            <div className='snow-home-terminal-output'>
              {step.detail.split('\n').map((line) => (
                <div
                  key={line}
                  data-diff={step.tone === 'diff' ? line.charAt(0) : undefined}
                >
                  {line}
                </div>
              ))}
            </div>
          </div>
        ))}
        {current.submitted && !current.complete && (
          <p className='snow-home-terminal-working'>
            <span aria-hidden='true'>✳</span> {t('Working…')}
          </p>
        )}
      </div>
      <div ref={input} className='snow-home-terminal-input' aria-hidden='true'>
        <span>❯</span>
        <span>
          {prompt.slice(0, current.promptLength)}
          <i className='snow-home-terminal-caret' />
        </span>
      </div>
      <div className='snow-home-terminal-status'>
        <span>~/apps/website</span>
        <span>
          {current.complete ? t('Review changes') : 'feature/resilient-client'}
        </span>
        <span>SnowAPI</span>
      </div>
    </div>
  )
}

export function GatewayShowcase() {
  const { t } = useTranslation()
  const [paused, setPaused] = useState(false)
  const [replay, setReplay] = useState(0)
  const { ref, playing, reducedMotion } = useHomeMotion<HTMLDivElement>(paused)

  return (
    <div ref={ref} className='snow-home-showcase' data-playing={playing}>
      <GrainBackground playing={playing} />
      <div className='snow-home-demo-window'>
        <div className='snow-home-window-bar'>
          <span className='snow-home-window-dots' aria-hidden='true'>
            <i />
            <i />
            <i />
          </span>
          <span className='snow-home-window-title'>claude — website</span>
          <div className='snow-home-window-actions'>
            <span className='snow-home-preview-label'>{t('Preview')}</span>
            <button
              type='button'
              aria-label={paused ? t('Play animation') : t('Pause animation')}
              title={paused ? t('Play animation') : t('Pause animation')}
              disabled={reducedMotion}
              onClick={() => setPaused(!paused)}
            >
              {paused ? <Play size={12} /> : <Pause size={12} />}
            </button>
            <button
              type='button'
              aria-label={t('Replay animation')}
              title={t('Replay animation')}
              disabled={reducedMotion}
              onClick={() => {
                setReplay(replay + 1)
                setPaused(false)
              }}
            >
              <RotateCcw size={12} />
            </button>
          </div>
        </div>
        <TerminalTranscript
          key={replay}
          playing={playing}
          reducedMotion={reducedMotion}
          onPause={() => setPaused(true)}
        />
      </div>
    </div>
  )
}
