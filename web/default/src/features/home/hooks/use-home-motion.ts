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

// Every animated surface stops work when offscreen, hidden, or motion is reduced.
export function useHomeMotion<T extends HTMLElement>(paused = false) {
  const ref = useRef<T>(null)
  const [visible, setVisible] = useState(false)
  const [hidden, setHidden] = useState(() => document.hidden)
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onMotion = () => setReducedMotion(media.matches)
    const onVisibility = () => setHidden(document.hidden)
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0 }
    )
    observer.observe(element)
    media.addEventListener('change', onMotion)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      observer.disconnect()
      media.removeEventListener('change', onMotion)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return {
    ref,
    reducedMotion,
    playing: visible && !hidden && !reducedMotion && !paused,
  }
}

// Elapsed time is retained across pauses; animation frames never update React state.
export function useHomeAnimationFrame(
  playing: boolean,
  draw: (elapsed: number) => void
) {
  const callback = useRef(draw)
  const elapsed = useRef(0)
  useEffect(() => {
    callback.current = draw
  }, [draw])
  useEffect(() => {
    if (!playing) return
    let frame = 0
    let previous = performance.now()
    let rendered = -Infinity
    const tick = (now: number) => {
      elapsed.current += Math.min(now - previous, 100)
      previous = now
      if (now - rendered >= 1000 / 30) {
        callback.current(elapsed.current)
        rendered = now
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing])
}
