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

import { useId, type CSSProperties } from 'react'

import { useHomeMotion } from '../hooks/use-home-motion'

const rows = Array.from({ length: 36 }, (_, row) => row)

export function StripedWordmark() {
  const id = useId()
  const { ref, playing } = useHomeMotion<HTMLDivElement>()
  return (
    <div
      ref={ref}
      className='snow-home-wordmark'
      data-playing={playing}
      aria-hidden='true'
    >
      <svg viewBox='0 0 1120 210' focusable='false'>
        <defs>
          <clipPath id={id}>
            <text
              x='-8'
              y='205'
              textLength='1128'
              lengthAdjust='spacingAndGlyphs'
            >
              snowapi
            </text>
          </clipPath>
        </defs>
        <g clipPath={`url(#${id})`}>
          {rows.map((row) => (
            <rect
              key={row}
              x='0'
              y={row * 6}
              width='1120'
              height='2'
              rx='1'
              style={{ '--stripe-row': row } as CSSProperties}
            />
          ))}
        </g>
      </svg>
    </div>
  )
}
