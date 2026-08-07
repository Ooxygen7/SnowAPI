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
import { useCallback, useEffect, useId, useLayoutEffect, useRef } from 'react'

import { cn } from '@/lib/utils'

import './legal.css'

type LegalChapterWheelProps = {
  items: Array<{ id: string; label: string }>
  activeIndex: number
  ariaLabel: string
  onChange: (index: number) => void
  capturePageWheel?: boolean
  className?: string
}

type WheelConfig = {
  count: number
  rowHeight: number
  smoothing: number
}

type DragState = {
  pointerId: number
  startY: number
  startPosition: number
}

const DEFAULT_ROW_HEIGHT = 58
const CURVE = 0.9
const TILT_DEGREES = 9
const BLUR_PER_STEP = 1.35
const OPACITY_FADE = 0.23
const MIN_OPACITY = 0.06
const SMOOTHING_MS = 180

function clampIndex(value: number, count: number) {
  return Math.min(Math.max(value, 0), Math.max(count - 1, 0))
}

export function LegalChapterWheel(props: LegalChapterWheelProps) {
  const wheelId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const positionRef = useRef(props.activeIndex)
  const targetRef = useRef(props.activeIndex)
  const selectedRef = useRef(props.activeIndex)
  const animationRef = useRef<number | null>(null)
  const lastFrameRef = useRef(0)
  const wheelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const dragMovedRef = useRef(false)
  const onChangeRef = useRef(props.onChange)
  const configRef = useRef<WheelConfig>({
    count: props.items.length,
    rowHeight: DEFAULT_ROW_HEIGHT,
    smoothing: SMOOTHING_MS,
  })

  onChangeRef.current = props.onChange
  configRef.current.count = props.items.length

  const runFrame = useCallback((now: number) => {
    const elapsed = Math.min((now - lastFrameRef.current) / 1000, 0.05)
    lastFrameRef.current = now
    const config = configRef.current
    const smoothingSeconds = Math.max(config.smoothing, 1) / 1000
    const easing = 1 - Math.exp(-elapsed / smoothingSeconds)
    const target = targetRef.current
    const current = positionRef.current
    let next = current + (target - current) * easing
    const settled = Math.abs(target - next) < 0.001
    if (settled) next = target
    positionRef.current = next

    const tiltRadians = (TILT_DEGREES * Math.PI) / 180
    const radius = config.rowHeight / tiltRadians

    itemRefs.current.forEach((item, index) => {
      if (!item) return

      const distanceFromSelection = index - next
      const distance = Math.abs(distanceFromSelection)
      const angle = Math.max(
        -Math.PI / 2,
        Math.min(Math.PI / 2, distanceFromSelection * tiltRadians)
      )
      const y = radius * Math.sin(angle)
      const x = -radius * (1 - Math.cos(angle)) * CURVE
      const rotation = (angle * 180) / Math.PI
      const progress = Math.max(0, 1 - Math.min(distance, 1))

      item.style.transform = `translate(${x.toFixed(2)}px, calc(${y.toFixed(2)}px - 50%)) rotate(${rotation.toFixed(3)}deg)`
      item.style.opacity = String(
        Math.max(MIN_OPACITY, 1 - distance * OPACITY_FADE)
      )
      item.style.filter = `blur(${(distance * BLUR_PER_STEP).toFixed(2)}px)`
      item.style.setProperty('--legal-wheel-focus', progress.toFixed(4))
    })

    animationRef.current = settled ? null : requestAnimationFrame(runFrame)
  }, [])

  const startAnimation = useCallback(() => {
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current)
    }
    lastFrameRef.current = performance.now()
    animationRef.current = requestAnimationFrame(runFrame)
  }, [runFrame])

  const applyTarget = useCallback(
    (value: number, snap: boolean) => {
      const count = configRef.current.count
      if (count === 0) return

      let next = clampIndex(value, count)
      if (snap) next = Math.round(next)
      targetRef.current = next

      const selectedIndex = clampIndex(Math.round(next), count)
      if (selectedIndex !== selectedRef.current) {
        selectedRef.current = selectedIndex
        onChangeRef.current(selectedIndex)
      }
      startAnimation()
    },
    [startAnimation]
  )

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return

    const syncRowHeight = () => {
      const value = Number.parseFloat(
        window
          .getComputedStyle(root)
          .getPropertyValue('--legal-wheel-row-height')
      )
      configRef.current.rowHeight = Number.isFinite(value)
        ? value
        : DEFAULT_ROW_HEIGHT
      startAnimation()
    }

    syncRowHeight()
    const observer = new ResizeObserver(syncRowHeight)
    observer.observe(root)
    return () => observer.disconnect()
  }, [startAnimation])

  useEffect(() => {
    const nextIndex = clampIndex(props.activeIndex, props.items.length)
    selectedRef.current = nextIndex
    targetRef.current = nextIndex
    startAnimation()
  }, [props.activeIndex, props.items.length, startAnimation])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    const handleWheel = (event: WheelEvent) => {
      if (
        event.ctrlKey ||
        event.defaultPrevented ||
        Math.abs(event.deltaY) <= Math.abs(event.deltaX)
      ) {
        return
      }
      if (!props.capturePageWheel) event.preventDefault()
      const rowHeight = configRef.current.rowHeight
      const delta =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? event.deltaY * 24
          : event.deltaY
      const step = Math.max(-1, Math.min(1, delta / rowHeight))
      applyTarget(targetRef.current + step, false)

      if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current)
      wheelTimerRef.current = setTimeout(() => {
        applyTarget(targetRef.current, true)
      }, 140)
    }

    if (props.capturePageWheel) {
      window.addEventListener('wheel', handleWheel, { passive: false })
    } else {
      root.addEventListener('wheel', handleWheel, { passive: false })
    }
    return () => {
      if (props.capturePageWheel) {
        window.removeEventListener('wheel', handleWheel)
      } else {
        root.removeEventListener('wheel', handleWheel)
      }
      if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current)
    }
  }, [applyTarget, props.capturePageWheel])

  useEffect(
    () => () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current)
      }
    },
    []
  )

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      dragRef.current = {
        pointerId: event.pointerId,
        startY: event.clientY,
        startPosition: targetRef.current,
      }
      dragMovedRef.current = false
      rootRef.current?.setAttribute('data-dragging', 'true')
    },
    []
  )

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current
      if (!drag) return

      const deltaY = event.clientY - drag.startY
      if (!dragMovedRef.current && Math.abs(deltaY) > 4) {
        dragMovedRef.current = true
        rootRef.current?.setPointerCapture(drag.pointerId)
      }
      if (!dragMovedRef.current) return

      applyTarget(
        drag.startPosition - deltaY / configRef.current.rowHeight,
        false
      )
    },
    [applyTarget]
  )

  const handlePointerEnd = useCallback(() => {
    if (!dragRef.current) return
    dragRef.current = null
    rootRef.current?.removeAttribute('data-dragging')
    if (dragMovedRef.current) applyTarget(targetRef.current, true)
  }, [applyTarget])

  const handleItemClick = useCallback(
    (index: number) => {
      if (dragMovedRef.current) {
        dragMovedRef.current = false
        return
      }
      applyTarget(index, true)
    },
    [applyTarget]
  )

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      let nextIndex: number | null = null
      if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
        nextIndex = selectedRef.current - 1
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
        nextIndex = selectedRef.current + 1
      } else if (event.key === 'Home') {
        nextIndex = 0
      } else if (event.key === 'End') {
        nextIndex = props.items.length - 1
      }
      if (nextIndex === null) return

      event.preventDefault()
      applyTarget(nextIndex, true)
    },
    [applyTarget, props.items.length]
  )

  return (
    <div
      ref={rootRef}
      role='listbox'
      tabIndex={0}
      aria-label={props.ariaLabel}
      aria-activedescendant={`${wheelId}-option-${props.items[props.activeIndex]?.id}`}
      className={cn('snowapi-legal-wheel', props.className)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onKeyDown={handleKeyDown}
    >
      {props.items.map((item, index) => (
        <button
          key={item.id}
          id={`${wheelId}-option-${item.id}`}
          ref={(element) => {
            itemRefs.current[index] = element
          }}
          type='button'
          role='option'
          tabIndex={-1}
          aria-selected={props.activeIndex === index}
          className='snowapi-legal-wheel-item'
          onClick={() => handleItemClick(index)}
        >
          <span className='snowapi-legal-wheel-index'>
            {String(index + 1).padStart(2, '0')}
          </span>
          <span className='snowapi-legal-wheel-label'>{item.label}</span>
        </button>
      ))}
    </div>
  )
}
