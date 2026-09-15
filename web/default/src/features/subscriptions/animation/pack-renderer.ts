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
/* Dependency-free WebGL renderer. Paper, metal and geometry are procedural;
   the card artwork uses the locally embedded SnowAPI browser-tab logo. */
const PI = Math.PI,
  rad = (a: number) => (a * PI) / 180
const clamp = (n: number, a = 0, b = 1) => Math.max(a, Math.min(b, n))
const smooth = (n: number) => {
  n = clamp(n)
  return n * n * (3 - 2 * n)
}
// Monotone cubic interpolation avoids a velocity stop at each measured frame.
function track(t: number, points: number[][]): number {
  const last = points.at(-1)
  if (!last) return 0
  if (t <= points[0][0]) return points[0][1]
  if (t >= last[0]) return last[1]
  const slopes = points
    .slice(1)
    .map((p, i) => (p[1] - points[i][1]) / (p[0] - points[i][0]))
  const tangent = (i: number) => {
    if (i === 0) return slopes[0]
    if (i === points.length - 1) return slopes.at(-1) ?? 0
    if (slopes[i - 1] * slopes[i] <= 0) return 0
    return 2 / (1 / slopes[i - 1] + 1 / slopes[i])
  }
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i],
      b = points[i + 1]
    if (t > b[0]) continue
    const d = b[0] - a[0],
      u = (t - a[0]) / d,
      u2 = u * u,
      u3 = u2 * u
    return (
      (2 * u3 - 3 * u2 + 1) * a[1] +
      (u3 - 2 * u2 + u) * d * tangent(i) +
      (-2 * u3 + 3 * u2) * b[1] +
      (u3 - u2) * d * tangent(i + 1)
    )
  }
  return last[1]
}
const identity = () =>
  new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
function mul(a: Float32Array, b: Float32Array) {
  const out = new Float32Array(16)
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      for (let k = 0; k < 4; k++) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]
    }
  }
  return out
}
function translate(x: number, y: number, z: number) {
  const a = identity()
  a[12] = x
  a[13] = y
  a[14] = z
  return a
}
function rotateX(v: number) {
  const a = identity(),
    c = Math.cos(v),
    s = Math.sin(v)
  a[5] = c
  a[6] = s
  a[9] = -s
  a[10] = c
  return a
}
function rotateY(v: number) {
  const a = identity(),
    c = Math.cos(v),
    s = Math.sin(v)
  a[0] = c
  a[2] = -s
  a[8] = s
  a[10] = c
  return a
}
function rotateZ(v: number) {
  const a = identity(),
    c = Math.cos(v),
    s = Math.sin(v)
  a[0] = c
  a[1] = s
  a[4] = -s
  a[5] = c
  return a
}
function scaling(s: number) {
  const a = identity()
  a[0] = a[5] = a[10] = s
  return a
}
const compose = (...matrices: Float32Array[]) =>
  matrices.reduce(mul, identity())
function canvas(
  w: number,
  h: number
): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const context = c.getContext('2d')
  if (!context) throw new Error('Canvas unavailable')
  return [c, context]
}
let randomSeed = 918273
function random() {
  randomSeed = (Math.imul(randomSeed, 1664525) + 1013904223) >>> 0
  return randomSeed / 4294967296
}
function logoStamp(
  g: CanvasRenderingContext2D,
  logo: HTMLImageElement,
  x: number,
  y: number,
  size: number,
  color: string
) {
  const [stamp, ink] = canvas(256, 256)
  ink.drawImage(logo, 0, 0, 256, 256)
  ink.globalCompositeOperation = 'source-in'
  ink.fillStyle = color
  ink.fillRect(0, 0, 256, 256)
  g.drawImage(stamp, x, y, size, size)
}
function paper(variant: string, logo: HTMLImageElement) {
  let base = 29
  if (variant === 'outer') base = 26
  if (variant === 'plain') base = 21
  const [c, g] = canvas(1024, 552),
    data = g.createImageData(1024, 552)
  for (let y = 0; y < 552; y++) {
    for (let x = 0; x < 1024; x++) {
      const i = (y * 1024 + x) * 4
      const broad = Math.exp(
        -((x - 500) ** 2 / 360000 + (y - 50) ** 2 / 140000)
      )
      const n = (random() - 0.5) * 2.5
      const v = base + broad * (variant === 'outer' ? 7 : 4) + n
      data.data[i] = v
      data.data[i + 1] = v
      data.data[i + 2] = v
      data.data[i + 3] = 255
    }
  }
  g.putImageData(data, 0, 0)
  g.strokeStyle = 'rgba(255,255,255,.028)'
  g.lineWidth = 2
  g.strokeRect(2, 2, 1020, 548)
  if (variant === 'outer' || variant === 'lid') {
    const yy = variant === 'lid' ? 305 : 220
    g.save()
    // The inside of the lid turns over its horizontal hinge when opened.
    if (variant === 'lid') {
      g.translate(0, yy * 2 + 96)
      g.scale(1, -1)
    }
    logoStamp(g, logo, 464, yy, 96, variant === 'outer' ? '#171717' : '#161616')
    g.restore()
  }
  if (variant === 'tray') {
    const grad = g.createRadialGradient(525, 310, 30, 525, 310, 350)
    grad.addColorStop(0, 'rgba(255,255,255,.018)')
    grad.addColorStop(1, 'rgba(0,0,0,.015)')
    g.fillStyle = grad
    g.fillRect(0, 0, 1024, 552)
    // Die-cut retaining slots remain visible below the rising card.
    g.strokeStyle = '#181818'
    g.lineWidth = 2.5
    g.beginPath()
    g.moveTo(273, 275)
    g.lineTo(273, 374)
    g.quadraticCurveTo(297, 380, 297, 405)
    g.lineTo(297, 440)
    g.moveTo(751, 275)
    g.lineTo(751, 374)
    g.quadraticCurveTo(727, 380, 727, 405)
    g.lineTo(727, 440)
    g.stroke()
    g.strokeStyle = '#202020'
    g.lineWidth = 1
    g.beginPath()
    g.moveTo(299, 440)
    g.lineTo(725, 440)
    g.stroke()
  }
  return c
}
function metal(logo: HTMLImageElement, planTitle: string) {
  const [c, g] = canvas(1024, 640),
    data = g.createImageData(1024, 640)
  for (let y = 0; y < 640; y++) {
    for (let x = 0; x < 1024; x++) {
      const i = (y * 1024 + x) * 4,
        n = (random() - 0.5) * 7,
        v = 128 + (x / 1024) * 9 - (y / 640) * 8 + n
      data.data[i] = v
      data.data[i + 1] = v
      data.data[i + 2] = v
      data.data[i + 3] = 255
    }
  }
  g.putImageData(data, 0, 0)
  const shine = g.createLinearGradient(0, 0, 1024, 640)
  shine.addColorStop(0, '#ffffff18')
  shine.addColorStop(0.28, '#ffffff04')
  shine.addColorStop(0.6, '#00000005')
  shine.addColorStop(1, '#ffffff12')
  g.fillStyle = shine
  g.fillRect(0, 0, 1024, 640)
  g.strokeStyle = 'rgba(255,255,255,.035)'
  g.lineWidth = 0.4
  for (let y = 0; y < 640; y += 2) {
    g.beginPath()
    g.moveTo(0, y)
    g.lineTo(1024, y)
    g.stroke()
  }
  // Etched contact chip, with the same muted silver finish as the film.
  const chipX = 97,
    chipY = 215,
    chipW = 151,
    chipH = 139
  g.fillStyle = '#c0c0be'
  g.beginPath()
  g.roundRect(chipX, chipY, chipW, chipH, 19)
  g.fill()
  g.strokeStyle = '#aeaeac'
  g.lineWidth = 2
  g.stroke()
  g.save()
  g.beginPath()
  g.roundRect(chipX, chipY, chipW, chipH, 19)
  g.clip()
  g.strokeStyle = '#adadab'
  g.lineWidth = 2
  g.beginPath()
  g.roundRect(141, 231, 64, 107, 12)
  g.moveTo(98, 251)
  g.lineTo(141, 251)
  g.moveTo(98, 283)
  g.lineTo(141, 283)
  g.moveTo(98, 317)
  g.lineTo(141, 317)
  g.moveTo(205, 251)
  g.lineTo(249, 251)
  g.moveTo(205, 283)
  g.lineTo(249, 283)
  g.moveTo(205, 317)
  g.lineTo(249, 317)
  g.moveTo(170, 231)
  g.lineTo(170, 215)
  g.moveTo(170, 338)
  g.lineTo(170, 354)
  g.stroke()
  g.restore()
  // Preserve the site's actual favicon silhouette. No remote image requests
  // are made by the animation, including when opened directly from disk.
  g.drawImage(logo, 538, 100, 370, 370)
  g.font = '500 88px Arial, Helvetica, sans-serif'
  g.textBaseline = 'alphabetic'
  g.fillStyle = '#282828'
  g.fillText(planTitle, 91, 542, 842)
  g.strokeStyle = 'rgba(255,255,255,.1)'
  g.lineWidth = 3
  g.strokeRect(1, 1, 1022, 638)
  return c
}
function shadowTexture() {
  const [c, g] = canvas(256, 256)
  const a = g.createRadialGradient(128, 128, 12, 128, 128, 128)
  a.addColorStop(0, 'rgba(0,0,0,.62)')
  a.addColorStop(0.5, 'rgba(0,0,0,.30)')
  a.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = a
  g.fillRect(0, 0, 256, 256)
  return c
}
// Rounded paper and metal slabs, including their thin physical edges.
function slab(w: number, h: number, d: number, r: number) {
  const a: number[] = [],
    outline: number[][] = []
  for (const [cx, cy, start] of [
    [w / 2 - r, h / 2 - r, 0],
    [-w / 2 + r, h / 2 - r, 90],
    [-w / 2 + r, -h / 2 + r, 180],
    [w / 2 - r, -h / 2 + r, 270],
  ]) {
    for (let j = 0; j <= 6; j++) {
      const angle = rad(start + j * 15)
      outline.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)])
    }
  }
  const vertex = (p: number[], n: number[], uv: number[]) =>
    a.push(...p, ...n, ...uv)
  for (let side = 0; side < 2; side++) {
    const z = side ? -d / 2 : d / 2,
      n = [0, 0, side ? -1 : 1]
    for (let i = 0; i < outline.length; i++) {
      const p = outline[i],
        q = outline[(i + 1) % outline.length],
        list = side ? [q, p] : [p, q]
      vertex([0, 0, z], n, [0.5, 0.5])
      for (const v of list) {
        vertex([v[0], v[1], z], n, [v[0] / w + 0.5, 0.5 - v[1] / h])
      }
    }
  }
  const faces = a.length / 8
  for (let i = 0; i < outline.length; i++) {
    const p = outline[i],
      q = outline[(i + 1) % outline.length],
      dx = q[0] - p[0],
      dy = q[1] - p[1],
      l = Math.hypot(dx, dy),
      n = [dy / l, -dx / l, 0]
    for (const v of [
      [p[0], p[1], d / 2],
      [p[0], p[1], -d / 2],
      [q[0], q[1], d / 2],
      [q[0], q[1], d / 2],
      [p[0], p[1], -d / 2],
      [q[0], q[1], -d / 2],
    ]) {
      vertex(v, n, [0.05, 0.05])
    }
  }
  return {
    vertices: new Float32Array(a),
    front: faces / 2,
    faces,
    count: a.length / 8,
  }
}
export class PackRenderer {
  private canvas: HTMLCanvasElement
  private gl: WebGLRenderingContext
  private program: WebGLProgram | null = null
  private shaders: WebGLShader[] = []
  private locations: Record<string, WebGLUniformLocation | null> = {}
  private attributes: number[] = []
  private textures: Record<string, WebGLTexture> = {}
  private meshes: Record<
    string,
    ReturnType<typeof slab> & { buffer: WebGLBuffer }
  > = {}
  private opacity = 1
  private paperLight = 0
  private foldLight = 0
  constructor(
    canvas: HTMLCanvasElement,
    logo: HTMLImageElement,
    planTitle: string
  ) {
    this.canvas = canvas
    const gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: true,
      premultipliedAlpha: true,
    })
    if (!gl) throw new Error('WebGL unavailable')
    this.gl = gl
    try {
      const vs = `attribute vec3 aPosition;attribute vec3 aNormal;attribute vec2 aUV;
        uniform mat4 uModel;uniform vec2 uViewport;uniform vec2 uOffset;uniform float uScale;
        varying vec3 vNormal;varying vec3 vPosition;varying vec2 vUV;
        void main(){vec4 p=uModel*vec4(aPosition,1.);float w=8.-p.z;
        vec2 screen=vec2(p.x,-p.y)*uScale*8.;vec2 ndc=(uOffset/uViewport*2.-1.);
        gl_Position=vec4((screen/uViewport*2.+ndc*w)*vec2(1.,-1.),-p.z*.05,w);
        vNormal=mat3(uModel)*aNormal;vPosition=p.xyz;vUV=aUV;}`
      const fs = `precision mediump float;uniform sampler2D uTexture;uniform float uOpacity;uniform float uMetal;uniform float uShadow;uniform float uPaperLight;
        varying vec3 vNormal;varying vec3 vPosition;varying vec2 vUV;
        void main(){vec4 tex=texture2D(uTexture,vUV);if(tex.a<.003)discard;
        vec3 n=normalize(vNormal);vec3 eye=normalize(vec3(0.,0.,8.)-vPosition);
        float diffuse=abs(dot(n,normalize(vec3(-.3,.65,2.))));
        float rim=pow(1.-abs(dot(n,eye)),2.5);
        float spec=pow(abs(dot(n,normalize(vec3(-.6,.8,2.4)))),18.);
        vec3 col=tex.rgb*(.85+.16*diffuse)+vec3(rim*.055+spec*.025);
        col+=vec3(uMetal*(spec*.045+rim*.06));
        col+=vec3(uPaperLight*(.17+.83*exp(-pow(vUV.y*2.,2.))));
        if(uShadow>.5)col=vec3(0.);
        gl_FragColor=vec4(col,tex.a*uOpacity);}`
      const compile = (type: number, source: string) => {
        const s = gl.createShader(type)
        if (!s) throw new Error('Shader unavailable')
        this.shaders.push(s)
        gl.shaderSource(s, source)
        gl.compileShader(s)
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
          throw new Error(gl.getShaderInfoLog(s) || 'Shader compilation failed')
        }
        return s
      }
      const program = (this.program = gl.createProgram())
      if (!program) throw new Error('Program unavailable')
      gl.attachShader(program, compile(gl.VERTEX_SHADER, vs))
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fs))
      gl.linkProgram(program)
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program) || 'Program link failed')
      }
      gl.useProgram(program)
      this.locations = {}
      for (const name of [
        'uModel',
        'uViewport',
        'uOffset',
        'uScale',
        'uTexture',
        'uOpacity',
        'uMetal',
        'uShadow',
        'uPaperLight',
      ]) {
        this.locations[name] = gl.getUniformLocation(program, name)
      }
      this.attributes = ['aPosition', 'aNormal', 'aUV'].map((n) =>
        gl.getAttribLocation(program, n)
      )
      this.textures = {}
      for (const [name, source] of Object.entries({
        outer: paper('outer', logo),
        lid: paper('lid', logo),
        tray: paper('tray', logo),
        plain: paper('plain', logo),
        card: metal(logo, planTitle),
        shadow: shadowTexture(),
      })) {
        const t = gl.createTexture()
        if (!t) throw new Error('Texture unavailable')
        this.textures[name] = t
        gl.bindTexture(gl.TEXTURE_2D, t)
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          source
        )
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
        this.textures[name] = t
      }
      this.meshes = {}
      for (const [name, args] of Object.entries({
        body: [2, 1.08, 0.016, 0.014],
        lid: [2, 1.08, 0.014, 0.014],
        wing: [0.65, 1.06, 0.009, 0.025],
        spine: [2, 0.03, 0.065, 0.005],
        hinge: [0.023, 1.075, 0.045, 0.004],
        card: [1.06, 0.715, 0.012, 0.031],
        shadow: [1.5, 0.97, 0, 0.1],
      })) {
        const buffer = gl.createBuffer()
        if (!buffer) throw new Error('Buffer unavailable')
        const m = { ...slab(args[0], args[1], args[2], args[3]), buffer }
        this.meshes[name] = m
        gl.bindBuffer(gl.ARRAY_BUFFER, m.buffer)
        gl.bufferData(gl.ARRAY_BUFFER, m.vertices, gl.STATIC_DRAW)
        this.meshes[name] = m
      }
      gl.enable(gl.DEPTH_TEST)
      gl.depthFunc(gl.LEQUAL)
      gl.enable(gl.BLEND)
      gl.blendFuncSeparate(
        gl.SRC_ALPHA,
        gl.ONE_MINUS_SRC_ALPHA,
        gl.ONE,
        gl.ONE_MINUS_SRC_ALPHA
      )
      gl.clearColor(0, 0, 0, 0)
      this.resize()
    } catch (error) {
      this.dispose()
      throw error
    }
  }
  dispose() {
    const gl = this.gl
    for (const mesh of Object.values(this.meshes)) gl.deleteBuffer(mesh.buffer)
    for (const texture of Object.values(this.textures)) {
      gl.deleteTexture(texture)
    }
    for (const shader of this.shaders) gl.deleteShader(shader)
    if (this.program) gl.deleteProgram(this.program)
    this.meshes = {}
    this.textures = {}
    this.shaders = []
    this.program = null
    gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
  resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    const width = this.canvas.getBoundingClientRect().width || 960
    // Keep CSS and backing-store aspect ratios aligned at every viewport.
    this.canvas.width = Math.round(width * ratio)
    this.canvas.height = Math.round(((width * 224) / 272) * ratio)
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height)
  }
  draw(
    name: string,
    model: Float32Array,
    front: string,
    back = front,
    metal = 0,
    opacity = 1
  ) {
    const foldLight = name === 'wing' ? this.foldLight : 0
    const gl = this.gl,
      l = this.locations,
      m = this.meshes[name]
    gl.bindBuffer(gl.ARRAY_BUFFER, m.buffer)
    ;[3, 3, 2].forEach((size, i) => {
      gl.enableVertexAttribArray(this.attributes[i])
      gl.vertexAttribPointer(
        this.attributes[i],
        size,
        gl.FLOAT,
        false,
        32,
        [0, 12, 24][i]
      )
    })
    gl.uniformMatrix4fv(l.uModel, false, model)
    gl.uniform1f(l.uMetal, metal)
    gl.uniform1f(l.uOpacity, this.opacity * opacity)
    gl.uniform1f(l.uShadow, name === 'shadow' ? 1 : 0)
    gl.uniform1f(l.uPaperLight, front === 'outer' ? this.paperLight : foldLight)
    gl.bindTexture(gl.TEXTURE_2D, this.textures[front])
    gl.drawArrays(gl.TRIANGLES, 0, m.front)
    gl.uniform1f(l.uPaperLight, back === 'outer' ? this.paperLight : foldLight)
    gl.bindTexture(gl.TEXTURE_2D, this.textures[back])
    gl.drawArrays(gl.TRIANGLES, m.front, m.front)
    gl.uniform1f(l.uPaperLight, 0)
    gl.bindTexture(gl.TEXTURE_2D, this.textures[metal ? 'card' : 'plain'])
    gl.drawArrays(gl.TRIANGLES, m.faces, m.count - m.faces)
  }
  render(t: number) {
    if (this.gl.isContextLost()) return
    const gl = this.gl,
      l = this.locations
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    const visibility = smooth((t - 1.48) / 0.24)
    this.canvas.style.opacity = String(visibility)
    this.opacity = 1
    if (visibility === 0) return
    this.paperLight = track(t, [
      [0, 0.1],
      [1.8, 0.14],
      [2.05, -0.01],
      [2.25, -0.015],
      [2.6, 0.04],
      [3.05, 0.24],
      [3.2, 0.25],
      [3.38, 0.04],
      [3.5, 0],
      [6.184, 0],
    ])
    const yaw = track(t, [
      [0, 0],
      [1.8, 0],
      [2.05, 4],
      [2.2, 22],
      [2.4, 56],
      [2.52, 90],
      [2.65, 148],
      [2.74, 180],
      [2.8, 212],
      [2.86, 240],
      [2.94, 270],
      [2.96, 282],
      [3.13, 334],
      [3.4, 358],
      [3.65, 360],
      [6.184, 360],
    ])
    const pitch = track(t, [
      [0, 0],
      [2.1, 0],
      [2.6, -5],
      [2.85, -13],
      [3.15, -19],
      [3.6, -20],
      [4.1, -28],
      [5.6, -30],
      [6.184, -30],
    ])
    const roll = track(t, [
      [0, 0],
      [2.1, 0],
      [2.8, 1],
      [3.1, 1.2],
      [3.5, 0.5],
      [3.9, 0],
      [6.184, 0],
    ])
    const scale = track(t, [
      [0, 126],
      [1.8, 126],
      [2.1, 121],
      [2.4, 105],
      [2.5, 102],
      [2.8, 86],
      [3.15, 77],
      [3.6, 77],
      [6.184, 77],
    ])
    const centerY = track(t, [
      [0, 375],
      [1.48, 375],
      [1.8, 352],
      [2.08, 351],
      [2.5, 366],
      [2.85, 383],
      [3.2, 390],
      [3.4, 395],
      [3.6, 395],
      [4.1, 392],
      [4.7, 385],
      [5.6, 374],
      [6.184, 374],
    ])
    const centerX = track(t, [
      [0, 136],
      [2.1, 136],
      [2.8, 140],
      [3.1, 144],
      [3.4, 138],
      [3.7, 136],
      [6.184, 136],
    ])
    const lidAngle = track(t, [
      [0, 0],
      [2.73, 0],
      [2.86, 15],
      [3.06, 35],
      [3.2, 52],
      [3.4, 113],
      [3.6, 156],
      [4, 185],
      [5.6, 190],
      [6.184, 190],
    ])
    const wingAngle = track(t, [
      [0, 0],
      [3.48, 0],
      [3.6, 50],
      [3.7, 93],
      [3.85, 120],
      [4.2, 136],
      [5.6, 146],
      [6.184, 146],
    ])
    this.foldLight =
      0.07 * smooth((wingAngle - 8) / 35) * (1 - smooth((wingAngle - 90) / 40))
    const lift = track(t, [
      [0, 0],
      [3.7, 0],
      [4.1, 0.025],
      [4.8, 0.21],
      [5.7, 0.31],
      [6.184, 0.31],
    ])
    const cardScale = track(t, [
      [0, 0.84],
      [3.65, 0.84],
      [4.2, 0.91],
      [5.6, 1],
      [6.184, 1],
    ])
    const root = compose(
      rotateZ(rad(roll)),
      rotateY(rad(-yaw)),
      rotateX(rad(pitch))
    )
    gl.uniform2f(l.uViewport, 272, 224)
    gl.uniform2f(l.uOffset, centerX, centerY - 235)
    gl.uniform1f(l.uScale, scale)
    this.draw('body', root, 'tray', 'outer')
    this.draw('spine', compose(root, translate(0, 0.535, 0.018)), 'plain')
    this.draw('hinge', compose(root, translate(-0.997, 0, 0.018)), 'plain')
    this.draw('hinge', compose(root, translate(0.997, 0, 0.018)), 'plain')
    const lid = compose(
      root,
      translate(0, 0.54, 0.049),
      rotateX(rad(-lidAngle)),
      translate(0, -0.54, 0)
    )
    this.draw('lid', lid, 'outer', 'lid')
    // The side wings hinge at the edges of the backing and fold inward first.
    const left = compose(
      root,
      translate(-1, 0, 0.031),
      rotateY(rad(-wingAngle)),
      translate(0.325, 0, 0)
    )
    const right = compose(
      root,
      translate(1, 0, 0.033),
      rotateY(rad(wingAngle)),
      translate(-0.325, 0, 0)
    )
    this.draw('wing', left, 'plain')
    this.draw('wing', right, 'plain')
    gl.depthMask(false)
    this.draw(
      'shadow',
      compose(root, translate(0.018, lift - 0.06, 0.01)),
      'shadow',
      'shadow',
      0,
      0.66
    )
    gl.depthMask(true)
    this.draw(
      'card',
      compose(
        root,
        translate(0, lift - 0.035, 0.029 + lift * 0.22),
        rotateX(rad(lift * 4)),
        scaling(cardScale)
      ),
      'card',
      'card',
      1
    )
  }
}
