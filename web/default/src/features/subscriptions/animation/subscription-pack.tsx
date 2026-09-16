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
import { useTranslation } from 'react-i18next'

import type { SnowEventTier } from '../snow-event-plans'
import logoUrl from './assets/snowapi-logo.png'
import type { PackRenderer } from './pack-renderer'

const START_TIME = 1.46
const END_TIME = 371 / 60

export function SubscriptionPack(props: {
  planTitle: string
  tier: SnowEventTier
}) {
  const { t } = useTranslation()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const replayRef = useRef<(() => void) | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let renderer: PackRenderer | undefined
    let disposed = false
    let frame = 0
    let previous = 0
    let time = reducedMotion.matches ? END_TIME : START_TIME
    let playing = false

    const render = () => {
      renderer?.render(time)
      canvas.dataset.time = time.toFixed(3)
    }
    const tick = (now: number) => {
      frame = 0
      if (disposed || !playing || document.hidden) return
      if (previous) time = Math.min(END_TIME, time + (now - previous) / 1000)
      previous = now
      render()
      playing = time < END_TIME
      if (playing) frame = requestAnimationFrame(tick)
    }
    const replay = () => {
      if (!renderer || disposed) return
      cancelAnimationFrame(frame)
      time = START_TIME
      previous = 0
      playing = true
      frame = requestAnimationFrame(tick)
    }
    const visibilityChanged = () => {
      cancelAnimationFrame(frame)
      frame = 0
      previous = 0
      if (!document.hidden && playing) frame = requestAnimationFrame(tick)
    }
    const motionChanged = () => {
      if (!reducedMotion.matches) return
      cancelAnimationFrame(frame)
      frame = 0
      playing = false
      time = END_TIME
      render()
    }
    const contextLost = (event: Event) => {
      event.preventDefault()
      cancelAnimationFrame(frame)
      playing = false
      setFailed(true)
    }
    const resize = new ResizeObserver(() => {
      renderer?.resize()
      render()
    })
    resize.observe(canvas)
    canvas.addEventListener('webglcontextlost', contextLost)
    document.addEventListener('visibilitychange', visibilityChanged)
    reducedMotion.addEventListener('change', motionChanged)

    const initialize = async () => {
      try {
        const logo = new Image()
        logo.src = logoUrl
        const [module] = await Promise.all([
          import('./pack-renderer'),
          logo.decode(),
        ])
        if (disposed) return
        // Let the white success screen paint before preparing GPU textures.
        frame = requestAnimationFrame(() => {
          frame = 0
          if (disposed) return
          try {
            renderer = new module.PackRenderer(
              canvas,
              logo,
              props.planTitle,
              props.tier
            )
            replayRef.current = replay
            render()
            if (!reducedMotion.matches) replay()
          } catch {
            setFailed(true)
          }
        })
      } catch {
        if (!disposed) setFailed(true)
      }
    }
    void initialize()

    return () => {
      disposed = true
      playing = false
      cancelAnimationFrame(frame)
      replayRef.current = null
      resize.disconnect()
      canvas.removeEventListener('webglcontextlost', contextLost)
      document.removeEventListener('visibilitychange', visibilityChanged)
      reducedMotion.removeEventListener('change', motionChanged)
      renderer?.dispose()
    }
  }, [props.planTitle, props.tier])

  if (failed) {
    return (
      <div
        className='snowapi-subscription-pack-fallback'
        data-tier={props.tier}
      >
        <img src={logoUrl} alt='' aria-hidden='true' />
        <span>{props.planTitle}</span>
      </div>
    )
  }

  return (
    <canvas
      ref={canvasRef}
      data-tier={props.tier}
      className='snowapi-subscription-pack'
      role='button'
      tabIndex={0}
      aria-label={t('Replay the {{plan}} card opening', {
        plan: props.planTitle,
      })}
      onClick={() => replayRef.current?.()}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          replayRef.current?.()
        }
      }}
    />
  )
}
