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
import { useCallback, useEffect, useRef } from 'react'

import { cn } from '@/lib/utils'

import './legal.css'

type LegalLineSidebarProps = {
  items: string[]
  activeIndex: number
  ariaLabel: string
  onItemClick: (index: number) => void
  className?: string
}

const PROXIMITY_RADIUS = 96
const SMOOTHING_MS = 100

function smoothFalloff(progress: number) {
  return progress * progress * (3 - 2 * progress)
}

export function LegalLineSidebar(props: LegalLineSidebarProps) {
  const listRef = useRef<HTMLUListElement>(null)
  const itemRefs = useRef<Array<HTMLLIElement | null>>([])
  const targetsRef = useRef<number[]>([])
  const currentRef = useRef<number[]>([])
  const animationRef = useRef<number | null>(null)
  const lastFrameRef = useRef(0)
  const activeIndexRef = useRef(props.activeIndex)

  activeIndexRef.current = props.activeIndex

  const runFrame = useCallback((now: number) => {
    const elapsed = Math.min((now - lastFrameRef.current) / 1000, 0.05)
    lastFrameRef.current = now
    const amount = 1 - Math.exp(-elapsed / (SMOOTHING_MS / 1000))
    let moving = false

    itemRefs.current.forEach((item, index) => {
      if (!item) return

      const hoverTarget = targetsRef.current[index] ?? 0
      const target = Math.max(
        hoverTarget,
        activeIndexRef.current === index ? 1 : 0
      )
      const current = currentRef.current[index] ?? 0
      const next = current + (target - current) * amount
      const settled = Math.abs(target - next) < 0.0015
      const value = settled ? target : next
      currentRef.current[index] = value
      item.style.setProperty('--legal-line-effect', value.toFixed(4))
      moving ||= !settled
    })

    animationRef.current = moving ? requestAnimationFrame(runFrame) : null
  }, [])

  const startAnimation = useCallback(() => {
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current)
    }
    lastFrameRef.current = performance.now()
    animationRef.current = requestAnimationFrame(runFrame)
  }, [runFrame])

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLUListElement>) => {
      const list = listRef.current
      if (!list || event.pointerType === 'touch') return

      const pointerY = event.clientY - list.getBoundingClientRect().top
      itemRefs.current.forEach((item, index) => {
        if (!item) return
        const center = item.offsetTop + item.offsetHeight / 2
        const distance = Math.abs(pointerY - center)
        const proximity = Math.max(0, 1 - distance / PROXIMITY_RADIUS)
        targetsRef.current[index] = smoothFalloff(proximity)
      })
      startAnimation()
    },
    [startAnimation]
  )

  const handlePointerLeave = useCallback(() => {
    targetsRef.current = props.items.map(() => 0)
    startAnimation()
  }, [props.items, startAnimation])

  useEffect(() => {
    startAnimation()
  }, [props.activeIndex, startAnimation])

  useEffect(
    () => () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current)
      }
    },
    []
  )

  return (
    <nav
      className={cn('snowapi-legal-line-sidebar', props.className)}
      aria-label={props.ariaLabel}
    >
      <ul
        ref={listRef}
        className='snowapi-legal-line-list'
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      >
        {props.items.map((label, index) => (
          <li
            key={label}
            ref={(element) => {
              itemRefs.current[index] = element
            }}
            className='snowapi-legal-line-item'
            aria-current={props.activeIndex === index ? 'true' : undefined}
          >
            <button type='button' onClick={() => props.onItemClick(index)}>
              <span className='snowapi-legal-line-marker' aria-hidden='true' />
              <span className='snowapi-legal-line-index'>
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className='snowapi-legal-line-label'>{label}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
