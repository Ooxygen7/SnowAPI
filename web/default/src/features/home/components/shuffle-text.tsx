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
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'
import { useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

import './shuffle-text.css'

gsap.registerPlugin(ScrollTrigger, SplitText)

type ShuffleTextProps = {
  className?: string
  duration?: number
  scrambleCharset?: string
  shuffleTimes?: number
  stagger?: number
  text: string
  triggerOnHover?: boolean
}

export function ShuffleText({
  className,
  duration = 0.35,
  scrambleCharset = '',
  shuffleTimes = 1,
  stagger = 0.03,
  text,
  triggerOnHover = true,
}: ShuffleTextProps) {
  const elementRef = useRef<HTMLSpanElement>(null)
  const [fontsLoaded, setFontsLoaded] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!('fonts' in document)) {
      setFontsLoaded(true)
      return
    }

    if (document.fonts.status === 'loaded') {
      setFontsLoaded(true)
      return
    }

    let active = true
    void document.fonts.ready.then(() => {
      if (active) setFontsLoaded(true)
    })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const element = elementRef.current
    if (!element || !text || !fontsLoaded) return

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setReady(true)
      return
    }

    let split: SplitText | null = null
    let wrappers: HTMLSpanElement[] = []
    let timeline: gsap.core.Timeline | null = null
    let playing = false
    let hoverHandler: (() => void) | null = null

    const removeHover = () => {
      if (!hoverHandler) return
      element.removeEventListener('mouseenter', hoverHandler)
      hoverHandler = null
    }

    const teardown = () => {
      timeline?.kill()
      timeline = null

      for (const wrapper of wrappers) {
        const original = wrapper.querySelector<HTMLElement>('[data-orig="1"]')
        if (original && wrapper.parentNode) {
          wrapper.parentNode.replaceChild(original, wrapper)
        }
      }
      wrappers = []

      try {
        split?.revert()
      } catch {
        // SplitText can already be reverted during a fast route transition.
      }
      split = null
      playing = false
    }

    const build = () => {
      teardown()

      split = new SplitText(element, {
        type: 'chars',
        charsClass: 'snowapi-shuffle-char',
        smartWrap: true,
        reduceWhiteSpace: false,
      })

      const rolls = Math.max(1, Math.floor(shuffleTimes))
      const characters = split.chars as HTMLElement[]

      for (const character of characters) {
        const parent = character.parentElement
        if (!parent) continue

        const width = character.getBoundingClientRect().width
        if (!width) continue

        const wrapper = document.createElement('span')
        Object.assign(wrapper.style, {
          display: 'inline-block',
          overflow: 'hidden',
          verticalAlign: 'bottom',
          width: `${width}px`,
        })

        const strip = document.createElement('span')
        Object.assign(strip.style, {
          display: 'inline-block',
          whiteSpace: 'nowrap',
          willChange: 'transform',
        })

        character.before(wrapper)
        wrapper.appendChild(strip)

        const firstCopy = character.cloneNode(true) as HTMLElement
        Object.assign(firstCopy.style, {
          display: 'inline-block',
          textAlign: 'center',
          width: `${width}px`,
        })

        character.dataset.orig = '1'
        Object.assign(character.style, {
          display: 'inline-block',
          textAlign: 'center',
          width: `${width}px`,
        })

        strip.appendChild(firstCopy)
        for (let index = 0; index < rolls; index += 1) {
          const shuffledCharacter = character.cloneNode(true) as HTMLElement
          if (scrambleCharset) {
            const randomIndex = Math.floor(
              Math.random() * scrambleCharset.length
            )
            shuffledCharacter.textContent = scrambleCharset.charAt(randomIndex)
          }
          Object.assign(shuffledCharacter.style, {
            display: 'inline-block',
            textAlign: 'center',
            width: `${width}px`,
          })
          strip.appendChild(shuffledCharacter)
        }
        strip.appendChild(character)

        const realCharacter = strip.lastElementChild
        if (realCharacter && strip.firstChild) {
          strip.firstChild.before(realCharacter)
        }
        strip.appendChild(firstCopy)

        const startX = -(rolls + 1) * width
        gsap.set(strip, { force3D: true, x: startX, y: 0 })
        strip.dataset.startX = String(startX)
        strip.dataset.finalX = '0'
        wrappers.push(wrapper)
      }
    }

    const cleanupToStill = () => {
      for (const wrapper of wrappers) {
        const strip = wrapper.firstElementChild as HTMLElement | null
        const original = strip?.querySelector<HTMLElement>('[data-orig="1"]')
        if (!strip || !original) continue

        strip.replaceChildren(original)
        strip.style.transform = 'none'
        strip.style.willChange = 'auto'
      }
    }

    function armHover() {
      if (!triggerOnHover) return

      removeHover()
      hoverHandler = () => {
        if (playing) return
        build()
        play()
      }
      elementRef.current?.addEventListener('mouseenter', hoverHandler)
    }

    function play() {
      const strips = wrappers
        .map((wrapper) => wrapper.firstElementChild as HTMLElement | null)
        .filter((strip): strip is HTMLElement => strip !== null)
      if (!strips.length) return

      playing = true
      const odd = strips.filter((_, index) => index % 2 === 1)
      const even = strips.filter((_, index) => index % 2 === 0)
      const oddTotal = duration + Math.max(0, odd.length - 1) * stagger
      const evenStart = odd.length ? oddTotal * 0.7 : 0

      timeline = gsap.timeline({
        smoothChildTiming: true,
        onComplete: () => {
          playing = false
          cleanupToStill()
          armHover()
        },
      })

      const addTween = (targets: HTMLElement[], position: number) => {
        if (!targets.length) return
        timeline?.to(
          targets,
          {
            duration,
            ease: 'power3.out',
            force3D: true,
            stagger,
            x: (_, target: HTMLElement) =>
              Number.parseFloat(target.dataset.finalX || '0'),
          },
          position
        )
      }

      addTween(odd, 0)
      addTween(even, evenStart)
    }

    const create = () => {
      build()
      play()
      setReady(true)
    }

    const scrollTrigger = ScrollTrigger.create({
      trigger: element,
      start: 'top 90%-=100px',
      once: true,
      onEnter: create,
    })

    return () => {
      scrollTrigger.kill()
      removeHover()
      teardown()
      setReady(false)
    }
  }, [
    duration,
    fontsLoaded,
    scrambleCharset,
    shuffleTimes,
    stagger,
    text,
    triggerOnHover,
  ])

  return (
    <span
      ref={elementRef}
      aria-hidden='true'
      className={cn(
        'snowapi-shuffle-text',
        ready && 'snowapi-shuffle-text-ready',
        className
      )}
    >
      {text}
    </span>
  )
}
