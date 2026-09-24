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

import { useHomeAnimationFrame, useHomeMotion } from '../hooks/use-home-motion'

const phi = (1 + Math.sqrt(5)) / 2
const vertices = [
  [-1, phi, 0],
  [1, phi, 0],
  [-1, -phi, 0],
  [1, -phi, 0],
  [0, -1, phi],
  [0, 1, phi],
  [0, -1, -phi],
  [0, 1, -phi],
  [phi, 0, -1],
  [phi, 0, 1],
  [-phi, 0, -1],
  [-phi, 0, 1],
]
const faces: number[][] = []
for (let a = 0; a < 12; a++) {
  for (let b = a + 1; b < 12; b++) {
    for (let c = b + 1; c < 12; c++) {
      const close = [
        [a, b],
        [a, c],
        [b, c],
      ].every(
        ([i, j]) =>
          Math.abs(
            vertices[i].reduce(
              (sum, v, k) => sum + (v - vertices[j][k]) ** 2,
              0
            ) - 4
          ) < 0.01
      )
      if (close) faces.push([a, b, c])
    }
  }
}
function drawCrystal(canvas: HTMLCanvasElement, elapsed: number) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const ratio = Math.min(window.devicePixelRatio || 1, 2)
  const width = canvas.clientWidth,
    height = canvas.clientHeight
  if (!width || !height) return
  if (
    canvas.width !== Math.round(width * ratio) ||
    canvas.height !== Math.round(height * ratio)
  ) {
    canvas.width = Math.round(width * ratio)
    canvas.height = Math.round(height * ratio)
  }
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  ctx.clearRect(0, 0, width, height)
  ctx.translate(width / 2, height / 2)
  const dark = document.documentElement.classList.contains('dark')
  const scale = Math.min(width, height) * 0.22
  const project = (v: number[], angle: number, size: number) => {
    const x = v[0] * Math.cos(angle) - v[2] * Math.sin(angle),
      z = v[0] * Math.sin(angle) + v[2] * Math.cos(angle)
    const y = v[1] * Math.cos(0.4) - z * Math.sin(0.4),
      depth = v[1] * Math.sin(0.4) + z * Math.cos(0.4)
    return [x * scale * size, y * scale * size, depth]
  }
  const time = elapsed / 9000
  const shell = vertices.map((v) => project(v, time, 1.08))
  ctx.strokeStyle = dark ? '#9b978c80' : '#88847966'
  ctx.lineWidth = 0.55
  for (const [a, b, c] of faces) {
    ctx.beginPath()
    ctx.moveTo(shell[a][0], shell[a][1])
    ctx.lineTo(shell[b][0], shell[b][1])
    ctx.lineTo(shell[c][0], shell[c][1])
    ctx.closePath()
    ctx.stroke()
  }
  for (const [x, y, z] of shell) {
    ctx.fillStyle = dark ? '#cbc7bb' : '#aaa698'
    ctx.beginPath()
    ctx.arc(x, y, 1.3 + z * 0.15, 0, Math.PI * 2)
    ctx.fill()
  }
  const core = vertices.map((v) => project(v, -time * 0.65, 0.65))
  const triangles = faces
    .flatMap(([a, b, c]) => {
      const tip = vertices[a].map(
        (_, k) =>
          ((vertices[a][k] + vertices[b][k] + vertices[c][k]) / 3) * 1.12
      )
      const center = project(tip, -time * 0.65, 0.65)
      return [
        [core[a], core[b], center],
        [core[b], core[c], center],
        [core[c], core[a], center],
      ]
    })
    .sort(
      (a, b) =>
        a.reduce((s, p) => s + p[2], 0) - b.reduce((s, p) => s + p[2], 0)
    )
  for (const [index, triangle] of triangles.entries()) {
    ctx.beginPath()
    ctx.moveTo(triangle[0][0], triangle[0][1])
    ctx.lineTo(triangle[1][0], triangle[1][1])
    ctx.lineTo(triangle[2][0], triangle[2][1])
    ctx.closePath()
    ctx.fillStyle = `hsl(246 90% ${40 + (index / triangles.length) * 34 + (index % 3) * 3}%)`
    ctx.fill()
    ctx.strokeStyle = '#aba6ff33'
    ctx.stroke()
  }
  ctx.strokeStyle = dark ? '#9c96ff55' : '#4137ff33'
  ctx.lineWidth = 0.6
  for (const direction of [-1, 1]) {
    ctx.save()
    ctx.rotate(direction * (0.45 + time * 0.15))
    ctx.beginPath()
    ctx.ellipse(0, 0, scale * 2.1, scale * 0.48, 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }
}
export function HomeArtwork(_props: { kind: 'polyhedron' }) {
  const { ref, playing, reducedMotion } = useHomeMotion<HTMLDivElement>()
  const canvas = useRef<HTMLCanvasElement>(null)
  useHomeAnimationFrame(playing, (elapsed) => {
    if (canvas.current) drawCrystal(canvas.current, elapsed)
  })
  useEffect(() => {
    const draw = () => {
      if (canvas.current) drawCrystal(canvas.current, 0)
    }
    draw()
    const size = new ResizeObserver(draw)
    if (ref.current) size.observe(ref.current)
    const theme = new MutationObserver(draw)
    theme.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })
    return () => {
      size.disconnect()
      theme.disconnect()
    }
  }, [ref, reducedMotion])
  return (
    <div
      ref={ref}
      className='snow-home-art snow-home-polyhedron'
      aria-hidden='true'
    >
      <canvas ref={canvas} className='h-full w-full' />
    </div>
  )
}
