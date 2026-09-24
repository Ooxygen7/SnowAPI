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

import { useEffect, useRef } from 'react'

import canopy from '../assets/canopy.svg'
import contours from '../assets/contours.svg'
import puzzle from '../assets/puzzle.mp4'
import { useHomeMotion } from '../hooks/use-home-motion'

// Source artwork: https://poolside.ai/ (see assets/SOURCES.md).
// Pointer movement writes transform variables, never per-frame React state.
export function PlatformArtwork(props: {
  kind: 'contours' | 'canopy' | 'puzzle'
}) {
  const { ref, playing, reducedMotion } = useHomeMotion<HTMLDivElement>()
  const video = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const element = ref.current
    const card = element?.closest<HTMLElement>('.snow-home-platform-card')
    if (!element || !card) return
    const media = video.current
    const coarse = window.matchMedia('(hover: none)')
    let hovering = false
    let focused = false
    const update = () => {
      const active = playing && (hovering || focused || coarse.matches)
      element.dataset.active = String(active)
      if (media) {
        if (active) void media.play().catch(() => {})
        else media.pause()
      }
    }
    const enter = () => {
      hovering = true
      update()
    }
    const leave = () => {
      hovering = false
      element.style.setProperty('--art-x', '0')
      element.style.setProperty('--art-y', '0')
      update()
    }
    const focus = () => {
      focused = true
      update()
    }
    const blur = () => {
      focused = false
      update()
    }
    const move = (event: PointerEvent) => {
      if (!playing || reducedMotion) return
      const box = card.getBoundingClientRect()
      element.style.setProperty(
        '--art-x',
        String(((event.clientX - box.left) / box.width) * 2 - 1)
      )
      element.style.setProperty(
        '--art-y',
        String(((event.clientY - box.top) / box.height) * 2 - 1)
      )
    }
    card.addEventListener('pointerenter', enter)
    card.addEventListener('pointerleave', leave)
    card.addEventListener('pointermove', move)
    card.addEventListener('focus', focus)
    card.addEventListener('blur', blur)
    coarse.addEventListener('change', update)
    update()
    return () => {
      media?.pause()
      card.removeEventListener('pointerenter', enter)
      card.removeEventListener('pointerleave', leave)
      card.removeEventListener('pointermove', move)
      card.removeEventListener('focus', focus)
      card.removeEventListener('blur', blur)
      coarse.removeEventListener('change', update)
    }
  }, [playing, reducedMotion, ref])

  return (
    <div
      ref={ref}
      className={`snow-home-platform-art snow-home-platform-${props.kind}`}
      aria-hidden='true'
    >
      {props.kind === 'puzzle' ? (
        <video
          ref={video}
          src={puzzle}
          muted
          playsInline
          loop
          preload='auto'
          width={300}
          height={300}
          tabIndex={-1}
          disablePictureInPicture
        />
      ) : (
        <img
          src={props.kind === 'canopy' ? canopy : contours}
          width={props.kind === 'canopy' ? 495 : 1215}
          height={props.kind === 'canopy' ? 732 : 463}
          alt=''
          loading='lazy'
          decoding='async'
        />
      )}
    </div>
  )
}
