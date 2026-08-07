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

const vertexShaderSource = `#version 300 es
in vec2 a_position;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`

const fragmentShaderSource = `#version 300 es
precision highp float;

uniform vec2 u_resolution;
uniform vec2 u_pointer;
uniform float u_time;
uniform float u_cellSize;

out vec4 fragColor;

#define PI 3.14159265
#define SNOW_M1 1597334677U
#define SNOW_M2 3812015801U
#define SNOW_M3 3299493293U
#define SNOW_F0 2.3283064e-10

const vec3 snowCamK = vec3(0.57735027, 0.57735027, 0.57735027);
const vec3 snowCamI = vec3(0.70710678, 0.0, -0.70710678);
const vec3 snowCamJ = vec3(-0.40824829, 0.81649658, -0.40824829);

uint snowHash(uint n) {
  return n * (n ^ (n >> 15));
}

uint snowCoord3(vec3 p) {
  uvec3 cell = uvec3(ivec3(p));
  return cell.x * SNOW_M1 ^ cell.y * SNOW_M2 ^ cell.z * SNOW_M3;
}

vec3 snowHash3(uint n) {
  uvec3 hashed = snowHash(n) * uvec3(1U, 511U, 262143U);
  return vec3(hashed) * SNOW_F0;
}

vec4 pixelSnowLayer(vec2 sourceCoord) {
  float pixelResolution = 220.0;
  float pixelSize = max(1.0, floor(0.5 + u_resolution.x / pixelResolution));
  float invPixelSize = 1.0 / pixelSize;
  vec2 snowCoord = floor(sourceCoord * invPixelSize);
  vec2 snowResolution = u_resolution * invPixelSize;
  float invResolutionX = 1.0 / snowResolution.x;

  vec3 ray = normalize(vec3(
    (snowCoord - snowResolution * 0.5) * invResolutionX,
    1.0
  ));
  ray = ray.x * snowCamI + ray.y * snowCamJ + ray.z * snowCamK;

  float timeSpeed = u_time * 2.05;
  float direction = 125.0 * PI / 180.0;
  float windX = cos(direction) * 0.4;
  float windY = sin(direction) * 0.4;
  vec3 cameraPosition = (
    windX * snowCamI + windY * snowCamJ + 0.1 * snowCamK
  ) * timeSpeed;
  vec3 position = cameraPosition;

  vec3 absoluteRay = max(abs(ray), vec3(0.001));
  vec3 strides = 1.0 / absoluteRay;
  vec3 raySign = step(ray, vec3(0.0));
  vec3 phase = fract(position) * strides;
  phase = mix(strides - phase, phase, raySign);

  float rayDotCamera = dot(ray, snowCamK);
  float inverseRayDotCamera = 1.0 / rayDotCamera;
  float halfInverseResolutionX = 0.5 * invResolutionX;
  vec3 timeAnimation = timeSpeed * 0.1 * vec3(7.0, 8.0, 5.0);
  float travel = 0.0;

  for (int stepIndex = 0; stepIndex < 128; stepIndex++) {
    if (travel >= 20.0) break;

    vec3 floorPosition = floor(position);
    uint cellCoordinate = snowCoord3(floorPosition);
    float cellRandom = snowHash3(cellCoordinate).x;

    if (cellRandom < 0.30) {
      vec3 randomValue = snowHash3(cellCoordinate);
      vec3 sineA = floorPosition.yzx * 0.073;
      vec3 sineB = floorPosition.zxy * 0.27;
      vec3 flakePosition = 0.5 - 0.5 * cos(
        4.0 * sin(sineA) +
        4.0 * sin(sineB) +
        2.0 * randomValue +
        timeAnimation
      );
      flakePosition = flakePosition * 0.8 + 0.1 + floorPosition;

      float toIntersection = dot(
        flakePosition - position,
        snowCamK
      ) * inverseRayDotCamera;

      if (toIntersection > 0.0) {
        vec3 testPosition = position + ray * toIntersection - flakePosition;
        vec2 testUv = abs(vec2(
          dot(testPosition, snowCamI),
          dot(testPosition, snowCamJ)
        ));
        float depth = dot(flakePosition - cameraPosition, snowCamK);
        float flakeSize = max(0.01, 1.25 * depth * halfInverseResolutionX);
        float distanceToFlake = max(testUv.x, testUv.y);

        if (distanceToFlake < flakeSize) {
          float sizeRatio = 0.01 / flakeSize;
          float pathDepth = travel + toIntersection;
          float intensity = exp2(-pathDepth / 8.0) *
            min(1.0, sizeRatio * sizeRatio);
          float visibleIntensity = pow(
            clamp(intensity, 0.0, 1.0),
            0.4545
          );
          float depthRatio = clamp(pathDepth / 20.0, 0.0, 1.0);
          float gray = mix(0.04, 0.62, depthRatio);
          float alpha = clamp(
            visibleIntensity * mix(0.82, 0.24, depthRatio),
            0.05,
            0.82
          );

          return vec4(vec3(gray) * alpha, alpha);
        }
      }
    }

    float nextStep = min(min(phase.x, phase.y), phase.z);
    vec3 selection = step(phase, vec3(nextStep));
    phase = phase - nextStep + strides * selection;
    travel += nextStep;
    position = mix(
      position + ray * nextStep,
      floor(position + ray * nextStep + 0.5),
      selection
    );
  }

  return vec4(0.0);
}

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise21(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);

  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));

  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.52;
  mat2 rotation = mat2(0.80, -0.60, 0.60, 0.80);

  for (int i = 0; i < 4; i++) {
    value += amplitude * noise21(p);
    p = rotation * p * 2.02 + 13.1;
    amplitude *= 0.5;
  }

  return value;
}

float bayer4(vec2 cell) {
  ivec2 p = ivec2(mod(cell, 4.0));
  int index = p.x + p.y * 4;
  float matrix[16] = float[16](
     0.0,  8.0,  2.0, 10.0,
    12.0,  4.0, 14.0,  6.0,
     3.0, 11.0,  1.0,  9.0,
    15.0,  7.0, 13.0,  5.0
  );
  return (matrix[index] + 0.5) / 16.0;
}

vec2 rotate2d(vec2 p, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return mat2(c, -s, s, c) * p;
}

float segmentDistance(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

float snowflakeField(vec2 snowP, out float radialDepth) {
  float crystal = 0.0;
  radialDepth = 0.0;

  for (int armIndex = 0; armIndex < 6; armIndex++) {
    float armAngle = float(armIndex) * 1.0471975512;
    vec2 direction = vec2(cos(armAngle), sin(armAngle));
    vec2 normal = vec2(-direction.y, direction.x);

    float mainDistance = segmentDistance(
      snowP,
      direction * 0.025,
      direction * 0.425
    );
    float mainArm = 1.0 - smoothstep(0.014, 0.042, mainDistance);
    crystal = max(crystal, mainArm);

    for (int branchIndex = 0; branchIndex < 3; branchIndex++) {
      float branch = float(branchIndex);
      float baseRadius = 0.145 + branch * 0.098;
      float branchLength = 0.098 - branch * 0.012;
      vec2 branchBase = direction * baseRadius;
      vec2 forward = direction * 0.72 * branchLength;
      vec2 side = normal * 0.70 * branchLength;

      float branchDistanceA = segmentDistance(
        snowP,
        branchBase,
        branchBase + forward + side
      );
      float branchDistanceB = segmentDistance(
        snowP,
        branchBase,
        branchBase + forward - side
      );
      float sideBranch = 1.0 - smoothstep(
        0.011,
        0.034,
        min(branchDistanceA, branchDistanceB)
      );
      crystal = max(crystal, sideBranch);
    }

    radialDepth = max(
      radialDepth,
      mainArm * smoothstep(0.02, 0.42, dot(snowP, direction))
    );
  }

  float centerCrystal = 1.0 - smoothstep(0.045, 0.105, length(snowP));
  return max(crystal, centerCrystal);
}

void main() {
  vec2 resolution = max(u_resolution, vec2(1.0));
  vec4 backgroundSnow = pixelSnowLayer(gl_FragCoord.xy);
  vec2 cell = floor(gl_FragCoord.xy / u_cellSize);
  vec2 samplePx = (cell + 0.5) * u_cellSize;
  vec2 local = fract(gl_FragCoord.xy / u_cellSize) - 0.5;

  vec2 p = (samplePx - resolution * 0.5) / min(resolution.x, resolution.y);
  vec2 pointer = u_pointer - 0.5;
  pointer.x *= resolution.x / resolution.y;
  vec2 snowP = rotate2d(p, -u_time * 0.42);

  float radialDepth = 0.0;
  float crystal = snowflakeField(snowP, radialDepth);
  float fineNoise = fbm(
    snowP * 10.5 + vec2(u_time * 0.045, -u_time * 0.035)
  );
  float pointerGlow = exp(-10.0 * length(p - pointer));
  float shimmer = mix(0.78, 1.08, fineNoise) + pointerGlow * 0.07;
  float density = clamp(crystal * shimmer, 0.0, 1.0);

  float threshold = bayer4(cell);
  float quantized = smoothstep(threshold - 0.14, threshold + 0.11, density);
  float snowPresence = smoothstep(0.025, 0.18, crystal);
  quantized *= snowPresence;
  float randomSize = (hash21(cell + 17.3) - 0.5) * 0.035;
  float squarePresence = step(0.04, quantized);
  float squareHalfSize = squarePresence * max(
    0.0,
    mix(0.035, 0.34, pow(quantized, 1.20)) + randomSize * quantized
  );

  float distanceToSquare = max(abs(local.x), abs(local.y));
  float squareMask = step(distanceToSquare, squareHalfSize);
  float snowBounds = 1.0 - smoothstep(0.435, 0.455, length(snowP));
  float depthTone = smoothstep(0.04, 0.46, quantized + radialDepth * 0.10);
  float snowAlpha = squareMask * snowBounds * mix(0.50, 1.0, depthTone);
  vec3 snowColor = mix(
    vec3(0.10, 0.67, 0.76),
    vec3(0.02, 0.51, 0.66),
    depthTone
  );

  vec3 premultiplied = snowColor * snowAlpha +
    backgroundSnow.rgb * (1.0 - snowAlpha);
  float alpha = snowAlpha + backgroundSnow.a * (1.0 - snowAlpha);
  fragColor = vec4(premultiplied, alpha);
}
`

const vertices = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1])

const targetFps = 30
const maxPixelRatio = 1.5
const animationSpeed = 0.54
const gridDivisions = 104

export function SnowflakeCanvas() {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return

    const gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    })
    if (!gl) {
      container.dataset.webgl = 'false'
      return
    }

    const compileShader = (type: number, source: string) => {
      const shader = gl.createShader(type)
      if (!shader) throw new Error('Unable to create WebGL shader')

      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const details = gl.getShaderInfoLog(shader) || 'Unknown shader error'
        gl.deleteShader(shader)
        throw new Error(details)
      }
      return shader
    }

    let program: WebGLProgram
    try {
      const vertexShader = compileShader(gl.VERTEX_SHADER, vertexShaderSource)
      const fragmentShader = compileShader(
        gl.FRAGMENT_SHADER,
        fragmentShaderSource
      )
      const nextProgram = gl.createProgram()
      if (!nextProgram) throw new Error('Unable to create WebGL program')

      gl.attachShader(nextProgram, vertexShader)
      gl.attachShader(nextProgram, fragmentShader)
      gl.linkProgram(nextProgram)
      gl.deleteShader(vertexShader)
      gl.deleteShader(fragmentShader)

      if (!gl.getProgramParameter(nextProgram, gl.LINK_STATUS)) {
        const details =
          gl.getProgramInfoLog(nextProgram) || 'Unknown program error'
        gl.deleteProgram(nextProgram)
        throw new Error(details)
      }
      program = nextProgram
    } catch {
      container.dataset.webgl = 'false'
      return
    }

    const buffer = gl.createBuffer()
    if (!buffer) {
      gl.deleteProgram(program)
      container.dataset.webgl = 'false'
      return
    }

    container.dataset.webgl = 'true'
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW)
    gl.useProgram(program)

    const positionLocation = gl.getAttribLocation(program, 'a_position')
    gl.enableVertexAttribArray(positionLocation)
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0)

    const uniforms = {
      cellSize: gl.getUniformLocation(program, 'u_cellSize'),
      pointer: gl.getUniformLocation(program, 'u_pointer'),
      resolution: gl.getUniformLocation(program, 'u_resolution'),
      time: gl.getUniformLocation(program, 'u_time'),
    }

    gl.disable(gl.DEPTH_TEST)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.clearColor(0, 0, 0, 0)

    const pointerTarget = { x: 0.5, y: 0.5 }
    const pointerCurrent = { x: 0.5, y: 0.5 }
    let animationFrame = 0
    let elapsed = 0
    let lastFrameTime = 0
    let previousTime = performance.now()
    let isVisible = true

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const pixelRatio = Math.min(window.devicePixelRatio || 1, maxPixelRatio)
      const width = Math.max(1, Math.round(rect.width * pixelRatio))
      const height = Math.max(1, Math.round(rect.height * pixelRatio))

      if (canvas.width === width && canvas.height === height) return
      canvas.width = width
      canvas.height = height
      gl.viewport(0, 0, width, height)
    }

    const render = (now: number, force = false) => {
      const minFrameTime = 1000 / targetFps
      if (!force && now - lastFrameTime < minFrameTime) return

      const delta = Math.min(0.1, Math.max(0, (now - previousTime) * 0.001))
      previousTime = now
      lastFrameTime = now
      elapsed += delta * animationSpeed

      resize()
      pointerCurrent.x += (pointerTarget.x - pointerCurrent.x) * 0.06
      pointerCurrent.y += (pointerTarget.y - pointerCurrent.y) * 0.06

      const cellSize = Math.max(4, Math.min(8.5, canvas.width / gridDivisions))

      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.useProgram(program)
      gl.uniform2f(uniforms.resolution, canvas.width, canvas.height)
      gl.uniform2f(uniforms.pointer, pointerCurrent.x, pointerCurrent.y)
      gl.uniform1f(uniforms.time, elapsed)
      gl.uniform1f(uniforms.cellSize, cellSize)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
    }

    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches
    const tick = (now: number) => {
      if (isVisible && !document.hidden) render(now)
      animationFrame = window.requestAnimationFrame(tick)
    }

    const handlePointerMove = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect()
      pointerTarget.x = Math.max(
        0,
        Math.min(1, (event.clientX - rect.left) / rect.width)
      )
      pointerTarget.y =
        1 - Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))
    }
    const handlePointerLeave = () => {
      pointerTarget.x = 0.5
      pointerTarget.y = 0.5
    }

    const resizeObserver = new ResizeObserver(() => {
      resize()
      render(performance.now(), true)
    })
    const intersectionObserver = new IntersectionObserver((entries) => {
      isVisible = entries[0]?.isIntersecting ?? false
    })

    container.addEventListener('pointermove', handlePointerMove, {
      passive: true,
    })
    container.addEventListener('pointerleave', handlePointerLeave)
    resizeObserver.observe(container)
    intersectionObserver.observe(container)
    resize()
    render(performance.now(), true)

    if (!reducedMotion) {
      animationFrame = window.requestAnimationFrame(tick)
    }

    return () => {
      window.cancelAnimationFrame(animationFrame)
      resizeObserver.disconnect()
      intersectionObserver.disconnect()
      container.removeEventListener('pointermove', handlePointerMove)
      container.removeEventListener('pointerleave', handlePointerLeave)
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className='snowapi-deeix-snowflake'
      data-webgl='pending'
      aria-hidden='true'
    >
      <canvas ref={canvasRef} />
      <span>❄</span>
    </div>
  )
}
