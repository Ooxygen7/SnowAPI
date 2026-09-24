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
type ArtworkKind = 'polyhedron' | 'contours' | 'canopy' | 'puzzle'

export function HomeArtwork(props: { kind: ArtworkKind }) {
  if (props.kind === 'polyhedron') {
    return (
      <div className='snow-home-art snow-home-polyhedron' aria-hidden='true'>
        <svg viewBox='0 0 360 256'>
          <g
            className='snow-home-polyhedron-wire'
            fill='none'
            stroke='currentColor'
            strokeWidth='.6'
          >
            <path d='M180 20 280 73 310 171 217 231 103 213 49 123 92 48ZM180 20 160 111 280 73 217 231 160 111 103 213 92 48 160 111 49 123 217 231M180 20 310 171 160 111 92 48M280 73 103 213M49 123 280 73' />
          </g>
          <g className='snow-home-polyhedron-core'>
            <path fill='#4137ff' d='m105 133 30-65 88 20 29 89-81 28z' />
            <path fill='#8480ff' d='m135 68 36 88 52-68z' />
            <path fill='#6459ff' d='m105 133 66 23-36-88z' />
            <path fill='#a39cff' d='m171 156 52-68 29 89z' />
            <path fill='#2416d5' d='m105 133 66 23v49z' />
            <path fill='#584af5' d='m171 156 81 21-81 28z' />
          </g>
        </svg>
      </div>
    )
  }
  if (props.kind === 'contours') {
    return (
      <div className='snow-home-art snow-home-contours' aria-hidden='true'>
        <svg viewBox='0 0 304 310' fill='none'>
          <g stroke='currentColor' strokeWidth='.65'>
            {Array.from({ length: 25 }, (_, i) => (
              <path
                key={i}
                d={`M${-90 + i * 8} -30 C${35 + i * 4} 32 ${-76 + i * 11} 91 ${65 + i * 6} 115 S${145 + i * 5} 192 ${110 + i * 7} 228 S${210 + i * 5} 320 ${290 + i * 7} 350`}
              />
            ))}
          </g>
          <g fill='#4137ff'>
            <circle cx='86' cy='102' r='5' />
            <circle cx='192' cy='73' r='5' />
            <circle cx='147' cy='201' r='5' />
            <circle cx='227' cy='245' r='5' />
          </g>
        </svg>
      </div>
    )
  }
  if (props.kind === 'canopy') {
    return (
      <div className='snow-home-art snow-home-canopy' aria-hidden='true'>
        <svg
          viewBox='0 0 304 310'
          fill='none'
          stroke='currentColor'
          strokeWidth='.65'
        >
          <g className='snow-home-canopy-wire'>
            <path d='M45 130Q151-28 266 130Q154 228 45 130ZM45 130Q151 22 266 130M45 130Q151 70 266 130M45 130Q151 114 266 130M45 130Q151 153 266 130M45 130Q151 190 266 130' />
            {[65, 90, 115, 140, 165, 190, 215, 240].map((x) => (
              <path key={x} d={`M151 44 Q${x} 72 ${x} 155 Q${x} 183 157 174`} />
            ))}
            <path d='M153 169V257Q153 280 175 277Q191 275 189 260M158 169V255Q158 273 174 272Q186 271 184 260' />
          </g>
        </svg>
      </div>
    )
  }
  return (
    <div className='snow-home-art snow-home-puzzle' aria-hidden='true'>
      <svg viewBox='0 0 304 310'>
        <g stroke='#c7c5ba' strokeWidth='1' className='snow-home-puzzle-pieces'>
          <path
            fill='#e9e7df'
            d='m54 126 52-31 23 14q-14 17 4 20t23-6l30 18-26 16q-20-12-27 0t9 16l-31 18-57-34z'
          />
          <path fill='#d5d2c9' d='m54 157 57 34v19l-57-34z' />
          <path fill='#c9c6bc' d='m111 191 31-18v19l-31 18z' />
          <path
            fill='#f3f2ec'
            d='m157 82 42-25 58 34v30l-30 18q-21-14-27-1t9 16l-35 20-25-15q17-16-2-21t-24 7l-22-13 26-16q20 12 25-1t-10-16z'
          />
          <path fill='#dbd8ce' d='m174 174 35-20v19l-35 20-25-15v-19z' />
          <path fill='#d0cdc2' d='m227 139 30-18v19l-30 18z' />
          <path
            fill='#e5e2d9'
            d='m187 196 37-22 23 13q-13 16 3 19l-45 26-51-30 24-14z'
          />
          <path fill='#c4c0b6' d='m154 202 51 30v18l-51-30z' />
          <path fill='#d8d5cb' d='m205 232 45-26v18l-45 26z' />
        </g>
      </svg>
    </div>
  )
}
