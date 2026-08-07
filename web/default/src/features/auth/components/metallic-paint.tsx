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
import { useCallback, useEffect, useRef, useState } from 'react'

import './metallic-paint.css'

const vertexShader = `#version 300 es
precision highp float;
in vec2 a_position;
out vec2 vP;
void main(){vP=a_position*.5+.5;gl_Position=vec4(a_position,0.,1.);}`

const fragmentShader = `#version 300 es
precision highp float;
in vec2 vP;
out vec4 oC;
uniform sampler2D u_tex;
uniform float u_time,u_ratio,u_imgRatio,u_seed,u_scale,u_refract,u_blur,u_liquid;
uniform float u_bright,u_contrast,u_angle,u_fresnel,u_sharp,u_wave,u_noise,u_chroma;
uniform float u_distort,u_contour;
uniform vec2 u_texel;
uniform vec3 u_lightColor,u_darkColor,u_tint;

vec3 sC,sM;

vec3 pW(vec3 v){
  vec3 i=floor(v),f=fract(v),s=sign(fract(v*.5)-.5),h=fract(sM*i+i.yzx),c=f*(f-1.);
  return s*c*((h*16.-4.)*c-1.);
}

vec3 aF(vec3 b,vec3 c){return pW(b+c.zxy-pW(b.zxy+c.yzx)+pW(b.yzx+c.xyz));}
vec3 lM(vec3 s,vec3 p){return(p+aF(s,p))*.5;}

vec2 fA(){
  vec2 c=vP-.5;
  c.x*=u_ratio>u_imgRatio?u_ratio/u_imgRatio:1.;
  c.y*=u_ratio>u_imgRatio?1.:u_imgRatio/u_ratio;
  return vec2(c.x+.5,.5-c.y);
}

vec2 rot(vec2 p,float r){float c=cos(r),s=sin(r);return vec2(p.x*c+p.y*s,p.y*c-p.x*s);}

float bM(vec2 c,float t){
  vec2 l=smoothstep(vec2(0.),vec2(t),c),u=smoothstep(vec2(0.),vec2(t),1.-c);
  return l.x*l.y*u.x*u.y;
}

float mG(float hi,float lo,float t,float sh,float cv){
  sh*=(2.-u_sharp);
  float ci=smoothstep(.15,.85,cv),r=lo;
  float e1=.08/u_scale;
  r=mix(r,hi,smoothstep(0.,sh*1.5,t));
  r=mix(r,lo,smoothstep(e1-sh,e1+sh,t));
  float e2=e1+.05/u_scale*(1.-ci*.35);
  r=mix(r,hi,smoothstep(e2-sh,e2+sh,t));
  float e3=e2+.025/u_scale*(1.-ci*.45);
  r=mix(r,lo,smoothstep(e3-sh,e3+sh,t));
  float e4=e1+.1/u_scale;
  r=mix(r,hi,smoothstep(e4-sh,e4+sh,t));
  float rm=1.-e4,gT=clamp((t-e4)/rm,0.,1.);
  r=mix(r,mix(hi,lo,smoothstep(0.,1.,gT)),smoothstep(e4-sh*.5,e4+sh*.5,t));
  return r;
}

void main(){
  sC=fract(vec3(.7548,.5698,.4154)*(u_seed+17.31))+.5;
  sM=fract(sC.zxy-sC.yzx*1.618);
  vec2 sc=vec2(vP.x*u_ratio,1.-vP.y);
  float angleRad=u_angle*3.14159/180.;
  sc=rot(sc-.5,angleRad)+.5;
  sc=clamp(sc,0.,1.);
  float sl=sc.x-sc.y,an=u_time*.001;
  vec2 iC=fA();
  vec4 texSample=texture(u_tex,iC);
  float dp=texSample.r;
  float shapeMask=texSample.a;
  vec2 outlineStep=u_texel*3.4;
  vec2 outlineDiagonal=outlineStep*.70710678;
  float expandedMask=shapeMask;
  expandedMask=max(expandedMask,texture(u_tex,iC+vec2(outlineStep.x,0.)).a);
  expandedMask=max(expandedMask,texture(u_tex,iC-vec2(outlineStep.x,0.)).a);
  expandedMask=max(expandedMask,texture(u_tex,iC+vec2(0.,outlineStep.y)).a);
  expandedMask=max(expandedMask,texture(u_tex,iC-vec2(0.,outlineStep.y)).a);
  expandedMask=max(expandedMask,texture(u_tex,iC+outlineDiagonal).a);
  expandedMask=max(expandedMask,texture(u_tex,iC-outlineDiagonal).a);
  expandedMask=max(expandedMask,texture(u_tex,iC+vec2(outlineDiagonal.x,-outlineDiagonal.y)).a);
  expandedMask=max(expandedMask,texture(u_tex,iC+vec2(-outlineDiagonal.x,outlineDiagonal.y)).a);
  float outlineMask=smoothstep(.06,.92,expandedMask)*(1.-smoothstep(.02,.9,shapeMask));
  outlineMask*=bM(iC,.01);
  vec3 hi=u_lightColor*u_bright;
  vec3 lo=u_darkColor*(2.-u_bright);
  lo.b+=smoothstep(.6,1.4,sc.x+sc.y)*.08;
  vec2 fC=sc-.5;
  float rd=length(fC+vec2(0.,sl*.15));
  vec2 ag=rot(fC,(.22-sl*.18)*3.14159);
  float cv=1.-pow(rd*1.65,1.15);
  cv*=pow(sc.y,.35);
  float vs=shapeMask;
  vs*=bM(iC,.01);
  float fr=pow(1.-cv,u_fresnel)*.3;
  vs=min(vs+fr*vs,1.);
  float mT=an*.0625;
  vec3 wO=vec3(-1.05,1.35,1.55);
  vec3 wA=aF(vec3(31.,73.,56.),mT+wO)*.22*u_wave;
  vec3 wB=aF(vec3(24.,64.,42.),mT-wO.yzx)*.22*u_wave;
  vec2 nC=sc*45.*u_noise;
  nC+=aF(sC.zxy,an*.17*sC.yzx-sc.yxy*.35).xy*18.*u_wave;
  vec3 tC=vec3(.00041,.00053,.00076)*mT+wB*nC.x+wA*nC.y;
  tC=lM(sC,tC);
  tC=lM(sC+1.618,tC);
  float tb=sin(tC.x*3.14159)*.5+.5;
  tb=tb*2.-1.;
  float noiseVal=pW(vec3(sc*8.+an,an*.5)).x;
  float edgeFactor=smoothstep(0.,.5,dp)*smoothstep(1.,.5,dp);
  float lD=dp+(1.-dp)*u_liquid*tb;
  lD+=noiseVal*u_distort*.15*edgeFactor;
  float rB=clamp(1.-cv,0.,1.);
  float fl=ag.x+sl;
  fl+=noiseVal*sl*u_distort*edgeFactor;
  fl*=mix(1.,1.-dp*.5,u_contour);
  fl-=dp*u_contour*.8;
  float eI=smoothstep(0.,1.,lD)*smoothstep(1.,0.,lD);
  fl-=tb*sl*1.8*eI;
  float cA=cv*clamp(pow(sc.y,.12),.25,1.);
  fl*=.12+(1.05-lD)*cA;
  fl*=smoothstep(1.,.65,lD);
  float vA1=smoothstep(.08,.18,sc.y)*smoothstep(.38,.18,sc.y);
  float vA2=smoothstep(.08,.18,1.-sc.y)*smoothstep(.38,.18,1.-sc.y);
  fl+=vA1*.16+vA2*.025;
  fl*=.45+pow(sc.y,2.)*.55;
  fl*=u_scale;
  fl-=an;
  float rO=rB+cv*tb*.025;
  float vM1=smoothstep(-.12,.18,sc.y)*smoothstep(.48,.08,sc.y);
  float cM1=smoothstep(.35,.55,cv)*smoothstep(.95,.35,cv);
  rO+=vM1*cM1*4.5;
  rO-=sl;
  float bO=rB*1.25;
  float vM2=smoothstep(-.02,.35,sc.y)*smoothstep(.75,.08,sc.y);
  float cM2=smoothstep(.35,.55,cv)*smoothstep(.75,.35,cv);
  bO+=vM2*cM2*.9;
  bO-=lD*.18;
  rO*=u_refract*u_chroma;
  bO*=u_refract*u_chroma;
  float sf=u_blur;
  float rP=fract(fl+rO);
  float rC=mG(hi.r,lo.r,rP,sf+.018+u_refract*cv*.025,cv);
  float gP=fract(fl);
  float gC=mG(hi.g,lo.g,gP,sf+.008/max(.01,1.-sl),cv);
  float bP=fract(fl-bO);
  float bC=mG(hi.b,lo.b,bP,sf+.008,cv);
  vec3 col=vec3(rC,gC,bC);
  col=(col-.5)*u_contrast+.5;
  col=clamp(col,0.,1.);
  col=mix(col,1.-min(vec3(1.),(1.-col)/max(u_tint,vec3(.001))),length(u_tint-1.)*.5);
  col=clamp(col,0.,1.);
  oC=vec4(col*vs,max(vs,outlineMask));
}`

interface MetallicPaintProps {
  imageSrc: string
  seed?: number
  scale?: number
  refraction?: number
  blur?: number
  liquid?: number
  speed?: number
  brightness?: number
  contrast?: number
  angle?: number
  fresnel?: number
  lightColor?: string
  darkColor?: string
  patternSharpness?: number
  waveAmplitude?: number
  noiseScale?: number
  chromaticSpread?: number
  mouseAnimation?: boolean
  distortion?: number
  contour?: number
  tintColor?: string
  className?: string
}

function processImage(image: HTMLImageElement): ImageData {
  const maxSize = 512
  const minSize = 320
  let width = image.naturalWidth || image.width
  let height = image.naturalHeight || image.height
  const longestSide = Math.max(width, height)

  if (longestSide > maxSize || longestSide < minSize) {
    const scale =
      longestSide > maxSize ? maxSize / longestSide : minSize / longestSide
    width = Math.round(width * scale)
    height = Math.round(height * scale)
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) {
    throw new Error('Unable to prepare the SnowAPI logo texture')
  }

  const texturePadding = Math.max(
    4,
    Math.round(Math.min(width, height) * 0.015)
  )
  context.drawImage(
    image,
    texturePadding,
    texturePadding,
    width - texturePadding * 2,
    height - texturePadding * 2
  )
  const imageData = context.getImageData(0, 0, width, height)
  const data = imageData.data
  const size = width * height
  const alphaValues = new Float32Array(size)
  const shapeMask = new Uint8Array(size)
  const boundaryMask = new Uint8Array(size)

  for (let index = 0; index < size; index += 1) {
    const pixel = index * 4
    const red = data[pixel]
    const green = data[pixel + 1]
    const blue = data[pixel + 2]
    const alpha = data[pixel + 3]
    const isBackground =
      (red > 250 && green > 250 && blue > 250 && alpha === 255) || alpha < 5
    alphaValues[index] = isBackground ? 0 : alpha / 255
    shapeMask[index] = alphaValues[index] > 0.1 ? 1 : 0
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x
      if (!shapeMask[index]) continue
      if (
        x === 0 ||
        x === width - 1 ||
        y === 0 ||
        y === height - 1 ||
        !shapeMask[index - 1] ||
        !shapeMask[index + 1] ||
        !shapeMask[index - width] ||
        !shapeMask[index + width]
      ) {
        boundaryMask[index] = 1
      }
    }
  }

  const depthValues = new Float32Array(size)
  const iterations = 96
  const source = 0.01
  const relaxation = 1.85

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const index = y * width + x
        if (!shapeMask[index] || boundaryMask[index]) continue
        const sum =
          (shapeMask[index + 1] ? depthValues[index + 1] : 0) +
          (shapeMask[index - 1] ? depthValues[index - 1] : 0) +
          (shapeMask[index + width] ? depthValues[index + width] : 0) +
          (shapeMask[index - width] ? depthValues[index - width] : 0)
        const nextValue = (source + sum) / 4
        depthValues[index] =
          relaxation * nextValue + (1 - relaxation) * depthValues[index]
      }
    }
  }

  let maxDepth = 0
  for (let index = 0; index < size; index += 1) {
    maxDepth = Math.max(maxDepth, depthValues[index])
  }
  maxDepth ||= 1

  const output = context.createImageData(width, height)
  for (let index = 0; index < size; index += 1) {
    const pixel = index * 4
    const depth = depthValues[index] / maxDepth
    const gray = Math.round(255 * (1 - depth * depth))
    output.data[pixel] = gray
    output.data[pixel + 1] = gray
    output.data[pixel + 2] = gray
    output.data[pixel + 3] = Math.round(alphaValues[index] * 255)
  }

  return output
}

function hexToRgb(hex: string): [number, number, number] {
  const match = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex)
  return match
    ? [
        Number.parseInt(match[1], 16) / 255,
        Number.parseInt(match[2], 16) / 255,
        Number.parseInt(match[3], 16) / 255,
      ]
    : [1, 1, 1]
}

export function MetallicPaint({
  imageSrc,
  seed = 42,
  scale = 4.6,
  refraction = 0.018,
  blur = 0.014,
  liquid = 0.78,
  speed = 0.24,
  brightness = 1.8,
  contrast = 0.72,
  angle = -8,
  fresnel = 1.1,
  lightColor = '#ffffff',
  darkColor = '#080808',
  patternSharpness = 1.15,
  waveAmplitude = 0.9,
  noiseScale = 0.46,
  chromaticSpread = 1.15,
  mouseAnimation = false,
  distortion = 0.75,
  contour = 0.24,
  tintColor = '#d8d8d8',
  className = '',
}: MetallicPaintProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const glRef = useRef<WebGL2RenderingContext | null>(null)
  const programRef = useRef<WebGLProgram | null>(null)
  const bufferRef = useRef<WebGLBuffer | null>(null)
  const uniformsRef = useRef<Record<string, WebGLUniformLocation | null>>({})
  const textureRef = useRef<WebGLTexture | null>(null)
  const animationTimeRef = useRef(0)
  const lastTimeRef = useRef(0)
  const animationFrameRef = useRef<number | null>(null)
  const speedRef = useRef(speed)
  const paintVisibleRef = useRef(false)
  const mouseRef = useRef({
    x: 0.5,
    y: 0.5,
    targetX: 0.5,
    targetY: 0.5,
  })
  const [ready, setReady] = useState(false)
  const [textureReady, setTextureReady] = useState(false)
  const [paintVisible, setPaintVisible] = useState(false)

  useEffect(() => {
    speedRef.current = speed
  }, [speed])

  const initializeWebGl = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return false

    const gl = canvas.getContext('webgl2', {
      antialias: true,
      alpha: true,
      premultipliedAlpha: true,
    })
    if (!gl) return false

    const compile = (source: string, type: number) => {
      const shader = gl.createShader(type)
      if (!shader) return null
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader)
        return null
      }
      return shader
    }

    const vertex = compile(vertexShader, gl.VERTEX_SHADER)
    const fragment = compile(fragmentShader, gl.FRAGMENT_SHADER)
    if (!vertex || !fragment) return false

    const program = gl.createProgram()
    if (!program) return false
    gl.attachShader(program, vertex)
    gl.attachShader(program, fragment)
    gl.linkProgram(program)
    gl.deleteShader(vertex)
    gl.deleteShader(fragment)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program)
      return false
    }

    const uniforms: Record<string, WebGLUniformLocation | null> = {}
    const uniformCount = gl.getProgramParameter(
      program,
      gl.ACTIVE_UNIFORMS
    ) as number
    for (let index = 0; index < uniformCount; index += 1) {
      const info = gl.getActiveUniform(program, index)
      if (info) uniforms[info.name] = gl.getUniformLocation(program, info.name)
    }

    const vertices = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1])
    const buffer = gl.createBuffer()
    if (!buffer) {
      gl.deleteProgram(program)
      return false
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW)
    gl.useProgram(program)
    const position = gl.getAttribLocation(program, 'a_position')
    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)

    glRef.current = gl
    programRef.current = program
    bufferRef.current = buffer
    uniformsRef.current = uniforms
    return true
  }, [])

  const uploadTexture = useCallback((imageData: ImageData) => {
    const gl = glRef.current
    const uniforms = uniformsRef.current
    if (!gl) return

    if (textureRef.current) gl.deleteTexture(textureRef.current)
    const texture = gl.createTexture()
    if (!texture) return

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      imageData.width,
      imageData.height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      imageData.data
    )
    gl.uniform1i(uniforms.u_tex, 0)
    gl.uniform1f(uniforms.u_imgRatio, imageData.width / imageData.height)
    gl.uniform2f(uniforms.u_texel, 1 / imageData.width, 1 / imageData.height)
    textureRef.current = texture
  }, [])

  useEffect(() => {
    if (!initializeWebGl()) return

    const canvas = canvasRef.current
    const gl = glRef.current
    if (!canvas || !gl) return

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
      const width = Math.max(1, Math.round(rect.width * pixelRatio))
      const height = Math.max(1, Math.round(rect.height * pixelRatio))
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }
      gl.viewport(0, 0, width, height)
      gl.uniform1f(uniformsRef.current.u_ratio, width / height)
    }

    resize()
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(canvas)
    setReady(true)

    return () => {
      resizeObserver.disconnect()
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      if (textureRef.current) gl.deleteTexture(textureRef.current)
      if (bufferRef.current) gl.deleteBuffer(bufferRef.current)
      if (programRef.current) gl.deleteProgram(programRef.current)
    }
  }, [initializeWebGl])

  useEffect(() => {
    if (!ready || !imageSrc) return

    let cancelled = false
    setTextureReady(false)
    setPaintVisible(false)
    paintVisibleRef.current = false
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => {
      if (cancelled) return
      try {
        uploadTexture(processImage(image))
        setTextureReady(true)
      } catch {
        setTextureReady(false)
      }
    }
    image.src = imageSrc

    return () => {
      cancelled = true
    }
  }, [imageSrc, ready, uploadTexture])

  useEffect(() => {
    const gl = glRef.current
    const uniforms = uniformsRef.current
    if (!gl || !ready) return

    gl.uniform1f(uniforms.u_seed, seed)
    gl.uniform1f(uniforms.u_scale, scale)
    gl.uniform1f(uniforms.u_refract, refraction)
    gl.uniform1f(uniforms.u_blur, blur)
    gl.uniform1f(uniforms.u_liquid, liquid)
    gl.uniform1f(uniforms.u_bright, brightness)
    gl.uniform1f(uniforms.u_contrast, contrast)
    gl.uniform1f(uniforms.u_angle, angle)
    gl.uniform1f(uniforms.u_fresnel, fresnel)
    gl.uniform1f(uniforms.u_sharp, patternSharpness)
    gl.uniform1f(uniforms.u_wave, waveAmplitude)
    gl.uniform1f(uniforms.u_noise, noiseScale)
    gl.uniform1f(uniforms.u_chroma, chromaticSpread)
    gl.uniform1f(uniforms.u_distort, distortion)
    gl.uniform1f(uniforms.u_contour, contour)

    const light = hexToRgb(lightColor)
    const dark = hexToRgb(darkColor)
    const tint = hexToRgb(tintColor)
    gl.uniform3f(uniforms.u_lightColor, ...light)
    gl.uniform3f(uniforms.u_darkColor, ...dark)
    gl.uniform3f(uniforms.u_tint, ...tint)
  }, [
    angle,
    blur,
    brightness,
    chromaticSpread,
    contour,
    contrast,
    darkColor,
    distortion,
    fresnel,
    lightColor,
    liquid,
    noiseScale,
    patternSharpness,
    ready,
    refraction,
    scale,
    seed,
    tintColor,
    waveAmplitude,
  ])

  useEffect(() => {
    const gl = glRef.current
    const canvas = canvasRef.current
    const uniforms = uniformsRef.current
    if (!gl || !canvas || !ready || !textureReady) return

    const mouse = mouseRef.current
    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches

    const handlePointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      mouse.targetX = (event.clientX - rect.left) / rect.width
      mouse.targetY = (event.clientY - rect.top) / rect.height
    }

    if (mouseAnimation) {
      canvas.addEventListener('pointermove', handlePointerMove)
    }

    const render = (time: number) => {
      const delta = Math.min(time - lastTimeRef.current, 64)
      lastTimeRef.current = time

      if (mouseAnimation) {
        mouse.x += (mouse.targetX - mouse.x) * 0.08
        mouse.y += (mouse.targetY - mouse.y) * 0.08
        animationTimeRef.current = mouse.x * 3000 + mouse.y * 1500
      } else if (!reducedMotion) {
        animationTimeRef.current += delta * speedRef.current
      }

      gl.uniform1f(uniforms.u_time, animationTimeRef.current)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      if (!paintVisibleRef.current) {
        paintVisibleRef.current = true
        setPaintVisible(true)
      }

      if (!reducedMotion) {
        animationFrameRef.current = requestAnimationFrame(render)
      }
    }

    lastTimeRef.current = performance.now()
    animationFrameRef.current = requestAnimationFrame(render)

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      canvas.removeEventListener('pointermove', handlePointerMove)
    }
  }, [mouseAnimation, ready, textureReady])

  return (
    <div
      className={`metallic-paint ${className}`.trim()}
      data-ready={paintVisible}
      role='img'
      aria-label='SnowAPI'
    >
      <img
        src={imageSrc}
        alt=''
        className='metallic-paint__fallback'
        aria-hidden='true'
      />
      <canvas
        ref={canvasRef}
        className='metallic-paint__canvas'
        aria-hidden='true'
      />
    </div>
  )
}
