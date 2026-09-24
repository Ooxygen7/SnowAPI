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
type ArtworkKind = 'polyhedron'

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
  return null
}
