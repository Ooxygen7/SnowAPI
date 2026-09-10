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
import gsap from 'gsap'
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
import React, {
  Children,
  cloneElement,
  forwardRef,
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
} from 'react'

import './card-swap.css'

type CardProps = HTMLAttributes<HTMLDivElement> & {
  customClass?: string
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ customClass, className, ...rest }, ref) => (
    <div
      ref={ref}
      {...rest}
      className={`card ${customClass ?? ''} ${className ?? ''}`.trim()}
    />
  )
)

Card.displayName = 'Card'

type CardSwapProps = {
  width?: CSSProperties['width']
  height?: CSSProperties['height']
  cardDistance?: number
  verticalDistance?: number
  delay?: number
  pauseOnHover?: boolean
  onCardClick?: (index: number) => void
  skewAmount?: number
  easing?: 'elastic' | 'smooth'
  children: ReactNode
}

type CardSlot = {
  x: number
  y: number
  z: number
  zIndex: number
}

const makeSlot = (
  index: number,
  distanceX: number,
  distanceY: number,
  total: number
): CardSlot => ({
  x: index * distanceX,
  y: -index * distanceY,
  z: -index * distanceX * 1.5,
  zIndex: total - index,
})

const placeNow = (element: HTMLDivElement, slot: CardSlot, skew: number) =>
  gsap.set(element, {
    x: slot.x,
    y: slot.y,
    z: slot.z,
    xPercent: -50,
    yPercent: -50,
    skewY: skew,
    transformOrigin: 'center center',
    zIndex: slot.zIndex,
    opacity: 1,
    force3D: true,
  })

export default function CardSwap({
  width = 500,
  height = 400,
  cardDistance = 60,
  verticalDistance = 70,
  delay = 5000,
  pauseOnHover = false,
  onCardClick,
  skewAmount = 6,
  easing = 'elastic',
  children,
}: CardSwapProps) {
  const config =
    easing === 'elastic'
      ? {
          ease: 'elastic.out(0.6,0.9)',
          durDrop: 0.52,
          durMove: 0.68,
          durReturn: 0.54,
          promoteOverlap: 0.7,
          returnGap: 0,
          stagger: 0.06,
        }
      : {
          ease: 'power3.inOut',
          durDrop: 0.36,
          durMove: 0.52,
          durReturn: 0.38,
          promoteOverlap: 0.75,
          returnGap: 0,
          stagger: 0.05,
        }

  const childArray = useMemo(() => Children.toArray(children), [children])
  const refs = useMemo(
    () => childArray.map(() => React.createRef<HTMLDivElement>()),
    [childArray]
  )
  const order = useRef(
    Array.from({ length: childArray.length }, (_, index) => index)
  )
  const timelineRef = useRef<gsap.core.Timeline | null>(null)
  const timeoutRef = useRef<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const total = refs.length
    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches

    refs.forEach((cardRef, index) => {
      if (cardRef.current) {
        placeNow(
          cardRef.current,
          makeSlot(index, cardDistance, verticalDistance, total),
          skewAmount
        )
        cardRef.current.dataset.cardActive = index === 0 ? 'true' : 'false'
      }
    })

    if (prefersReducedMotion || total < 2) return

    let isHovered = false

    const clearSwapTimeout = () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }

    const scheduleSwap = () => {
      clearSwapTimeout()
      if (!isHovered) {
        timeoutRef.current = window.setTimeout(swap, delay)
      }
    }

    function swap() {
      if (order.current.length < 2) return
      if (timelineRef.current?.isActive()) return

      const [front, ...rest] = order.current
      const frontElement = refs[front].current
      if (!frontElement) return

      const timeline = gsap.timeline()
      timelineRef.current = timeline
      const promoteAt = config.durDrop * (1 - config.promoteOverlap)
      const returnAt = config.durDrop + config.returnGap

      timeline.to(frontElement, {
        y: 360,
        opacity: 0,
        duration: config.durDrop,
        ease: 'power2.in',
      })

      timeline.addLabel('promote', promoteAt)
      timeline.call(
        () => {
          frontElement.dataset.cardActive = 'false'
          const nextElement = refs[rest[0]]?.current
          if (nextElement) nextElement.dataset.cardActive = 'true'
        },
        undefined,
        promoteAt
      )

      rest.forEach((index, position) => {
        const element = refs[index].current
        if (!element) return

        const slot = makeSlot(
          position,
          cardDistance,
          verticalDistance,
          refs.length
        )
        const promotionAt = promoteAt + position * config.stagger
        timeline.set(element, { zIndex: slot.zIndex }, promotionAt)
        timeline.to(
          element,
          {
            x: slot.x,
            y: slot.y,
            z: slot.z,
            duration: config.durMove,
            ease: config.ease,
          },
          promotionAt
        )
      })

      const backSlot = makeSlot(
        refs.length - 1,
        cardDistance,
        verticalDistance,
        refs.length
      )
      timeline.addLabel('return', returnAt)
      timeline.set(
        frontElement,
        {
          x: backSlot.x,
          y: backSlot.y + 24,
          z: backSlot.z,
          zIndex: backSlot.zIndex,
          opacity: 0,
        },
        returnAt
      )
      timeline.to(
        frontElement,
        {
          y: backSlot.y,
          opacity: 1,
          duration: config.durReturn,
          ease: 'power3.out',
        },
        returnAt
      )

      timeline.eventCallback('onComplete', () => {
        order.current = [...rest, front]
        if (timelineRef.current === timeline) {
          timelineRef.current = null
        }
        scheduleSwap()
      })
    }

    const pause = () => {
      isHovered = true
      timelineRef.current?.pause()
      clearSwapTimeout()
    }
    const resume = () => {
      isHovered = false
      timelineRef.current?.play()
      if (!timelineRef.current) {
        scheduleSwap()
      }
    }

    scheduleSwap()

    const container = containerRef.current
    if (pauseOnHover && container) {
      container.addEventListener('mouseenter', pause)
      container.addEventListener('mouseleave', resume)
    }

    return () => {
      if (pauseOnHover && container) {
        container.removeEventListener('mouseenter', pause)
        container.removeEventListener('mouseleave', resume)
      }
      clearSwapTimeout()
      timelineRef.current?.kill()
      timelineRef.current = null
    }
  }, [
    cardDistance,
    config.durDrop,
    config.durMove,
    config.durReturn,
    config.ease,
    config.promoteOverlap,
    config.returnGap,
    config.stagger,
    delay,
    pauseOnHover,
    refs,
    skewAmount,
    verticalDistance,
  ])

  const rendered = childArray.map((child, index) => {
    if (!isValidElement<CardProps>(child)) return child

    const card = child as ReactElement<CardProps>
    return cloneElement(card, {
      key: index,
      ref: refs[index],
      style: { width, height, ...card.props.style },
      onClick: (event: React.MouseEvent<HTMLDivElement>) => {
        card.props.onClick?.(event)
        onCardClick?.(index)
      },
    } as CardProps & React.RefAttributes<HTMLDivElement>)
  })

  return (
    <div
      ref={containerRef}
      className='card-swap-container'
      style={{ width, height }}
    >
      {rendered}
    </div>
  )
}
