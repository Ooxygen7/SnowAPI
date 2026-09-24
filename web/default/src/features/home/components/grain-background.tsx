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

import { useEffect, useRef, type RefObject } from 'react'

// A small, dependency-free shader: warm moving light, fine film grain and scanlines.
const vertexSource = `
attribute vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }
`
const fragmentSource = `
precision mediump float;
uniform vec2 resolution;
uniform float elapsed;
uniform float dark;
float grain(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
void main() {
  vec2 p = gl_FragCoord.xy;
  float phase = elapsed * mix(1.0, 0.3, dark);
  float band = clamp(0.5 + sin((0.5 - (p.y - resolution.y * 0.5)
    / max(resolution.x, resolution.y) / 1.05) * 3.0 + phase)
    * mix(1.3, 0.495, dark), 0.0, 1.0);
  vec3 paper = mix(vec3(0.969, 0.965, 0.937), vec3(0.0), dark);
  vec3 shade = mix(vec3(0.894, 0.890, 0.863), vec3(0.306, 0.294, 0.282), dark);
  vec3 color = mix(paper, shade, band);
  float scan = pow(abs(sin(p.y * 0.392699)), 9.0);
  color *= 0.94 + 0.06 * scan;
  color += (grain(floor(p) + fract(elapsed * 30.0)) - 0.5) * 0.128;
  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`

export function GrainBackground(props: {
  renderFrame: RefObject<(elapsed: number) => void>
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const render = props.renderFrame

  useEffect(() => {
    const element = canvas.current
    if (!element) return
    const gl = element.getContext('webgl', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'low-power',
    })
    if (!gl) return
    const program = gl.createProgram()
    const vertex = gl.createShader(gl.VERTEX_SHADER)
    const fragment = gl.createShader(gl.FRAGMENT_SHADER)
    const buffer = gl.createBuffer()
    if (!program || !vertex || !fragment || !buffer) {
      if (program) gl.deleteProgram(program)
      if (vertex) gl.deleteShader(vertex)
      if (fragment) gl.deleteShader(fragment)
      if (buffer) gl.deleteBuffer(buffer)
      return
    }
    gl.shaderSource(vertex, vertexSource)
    gl.shaderSource(fragment, fragmentSource)
    gl.compileShader(vertex)
    gl.compileShader(fragment)
    gl.attachShader(program, vertex)
    gl.attachShader(program, fragment)
    gl.linkProgram(program)
    gl.deleteShader(vertex)
    gl.deleteShader(fragment)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program)
      gl.deleteBuffer(buffer)
      return
    }
    gl.useProgram(program)
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    )
    const position = gl.getAttribLocation(program, 'position')
    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
    const resolution = gl.getUniformLocation(program, 'resolution')
    const elapsed = gl.getUniformLocation(program, 'elapsed')
    const dark = gl.getUniformLocation(program, 'dark')
    let time = 0
    let lost = false

    render.current = (milliseconds) => {
      if (lost) return
      time = milliseconds
      gl.viewport(0, 0, element.width, element.height)
      gl.uniform2f(resolution, element.width, element.height)
      gl.uniform1f(elapsed, milliseconds / 1000)
      gl.uniform1f(
        dark,
        document.documentElement.classList.contains('dark') ? 1 : 0
      )
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }
    const resize = () => {
      const box = element.getBoundingClientRect()
      const ratio = Math.min(
        window.devicePixelRatio || 1,
        1.5,
        Math.sqrt(800000 / Math.max(1, box.width * box.height))
      )
      element.width = Math.max(1, Math.round(box.width * ratio))
      element.height = Math.max(1, Math.round(box.height * ratio))
      render.current(time)
    }
    const onContextLost = () => {
      lost = true
      element.style.opacity = '0'
    }
    element.addEventListener('webglcontextlost', onContextLost)
    const observer = new ResizeObserver(resize)
    observer.observe(element)
    const theme = new MutationObserver(() => render.current(time))
    theme.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })
    resize()
    return () => {
      render.current = () => {}
      observer.disconnect()
      theme.disconnect()
      element.removeEventListener('webglcontextlost', onContextLost)
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
    }
  }, [render])

  return <canvas ref={canvas} className='snow-home-grain' aria-hidden='true' />
}
