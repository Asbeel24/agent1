import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'

export type OrbMode = 'idle' | 'dialogue' | 'recording' | 'meeting' | 'translate'

const DESKTOP_PARTICLE_COUNT = 16000

type DeviceProfile = {
  label: string
  particleCount: number
  textureSize: number
  maxDpr: number
  targetFps: number
  bloomScale: number
}

function getDeviceProfile(): DeviceProfile {
  const ua = navigator.userAgent
  const width = window.innerWidth
  const touch = navigator.maxTouchPoints > 1
  const phone = /iPhone|iPod|Android.*Mobile/i.test(ua) || width < 600
  const tablet = /iPad/i.test(ua) || (touch && width <= 1180) || (!phone && width <= 1024)

  if (phone) {
    return { label: '手机', particleCount: 8000, textureSize: 90, maxDpr: 1, targetFps: 30, bloomScale: 0.5 }
  }
  if (tablet) {
    return { label: 'iPad', particleCount: 12500, textureSize: 112, maxDpr: 1.35, targetFps: 45, bloomScale: 0.78 }
  }
  return {
    label: 'PC',
    particleCount: DESKTOP_PARTICLE_COUNT,
    textureSize: 128,
    maxDpr: 2,
    targetFps: 60,
    bloomScale: 1,
  }
}

type SimulationControls = {
  noiseScale: number
  noiseAmplitude: number
  noiseForce: number
  noiseSpeed: number
  diffusion: number
  lifeSpeed: number
  motionSpeed: number
  attraction: number
  lifeColor: number
  levelGain: number
  levelGamma: number
  bloomStrength: number
  bloomRadius: number
  bloomThreshold: number
}

const DEFAULT_CONTROLS: SimulationControls = {
  noiseScale: 2.35,
  noiseAmplitude: 0.52,
  noiseForce: 0.06,
  noiseSpeed: 0.28,
  diffusion: 0.035,
  lifeSpeed: 0.003,
  motionSpeed: 0.38,
  attraction: 0.01,
  lifeColor: 0.78,
  levelGain: 1.0,
  levelGamma: 1.0,
  bloomStrength: 0.34,
  bloomRadius: 0.24,
  bloomThreshold: 0.72,
}

// Position and velocity are stored in floating-point textures. Both shaders
// repeat the force calculation because GPUComputationRenderer updates all
// variables from the previous frame's state.
const simulationCommon = /* glsl */ `
  uniform float uAngle;
  uniform float uRadius;
  uniform float uParticleCount;
  uniform float uAttraction;
  uniform float uDamping;
  uniform float uRepelRadius;
  uniform float uRepelStrength;
  uniform float uNoiseScale;
  uniform float uNoiseStrength;
  uniform float uNoiseForce;
  uniform float uNoiseTime;
  uniform float uDiffusion;
  uniform float uLifeSpeed;
  uniform float uFrameScale;
  uniform vec2 uPointer;
  uniform float uPointerActive;

  float particleIndex() {
    return floor(gl_FragCoord.y) * resolution.x + floor(gl_FragCoord.x);
  }

  float hash21(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  // 2D gradient Perlin noise. It only warps the sphere's latitude and
  // longitude, so the radius and silhouette stay unchanged.
  float perlinNoise(vec2 p) {
    vec2 cell = floor(p);
    vec2 local = fract(p);
    vec2 fade = local * local * local * (local * (local * 6.0 - 15.0) + 10.0);

    float a00 = hash21(cell) * 6.28318530718;
    float a10 = hash21(cell + vec2(1.0, 0.0)) * 6.28318530718;
    float a01 = hash21(cell + vec2(0.0, 1.0)) * 6.28318530718;
    float a11 = hash21(cell + vec2(1.0, 1.0)) * 6.28318530718;

    float n00 = dot(vec2(cos(a00), sin(a00)), local);
    float n10 = dot(vec2(cos(a10), sin(a10)), local - vec2(1.0, 0.0));
    float n01 = dot(vec2(cos(a01), sin(a01)), local - vec2(0.0, 1.0));
    float n11 = dot(vec2(cos(a11), sin(a11)), local - vec2(1.0));
    return mix(mix(n00, n10, fade.x), mix(n01, n11, fade.x), fade.y) * 1.4142;
  }

  vec3 homePosition(float index) {
    // Uniform Fibonacci sphere: the base distribution already lives on a
    // proper 3D shell instead of a filled 2D disc.
    float normalizedIndex = (index + 0.5) / uParticleCount;
    float sphereY = 1.0 - 2.0 * normalizedIndex;
    float latitude = acos(clamp(sphereY, -1.0, 1.0));
    float longitude = index * 2.39996322973;
    vec3 surface = vec3(
      sin(longitude) * sin(latitude),
      cos(latitude),
      cos(longitude) * sin(latitude)
    );

    // Two decorrelated noise samples redistribute particles tangentially.
    vec2 noiseDrift = vec2(uNoiseTime * 0.23, -uNoiseTime * 0.17);
    float latitudeNoise = perlinNoise(surface.xy * uNoiseScale + noiseDrift);
    float longitudeNoise = perlinNoise(
      surface.yz * uNoiseScale + vec2(17.3, 9.1) - noiseDrift.yx
    );
    latitude += latitudeNoise * uNoiseStrength;
    longitude += longitudeNoise * uNoiseStrength * 1.35;

    vec3 warpedSurface = vec3(
      sin(longitude + uAngle) * sin(latitude) * uRadius,
      cos(latitude) * uRadius,
      cos(longitude + uAngle) * sin(latitude) * uRadius
    );
    return normalize(warpedSurface) * uRadius;
  }

  vec3 nextVelocity(vec3 position, vec3 velocity, float index, float life) {
    vec3 normal = normalize(position + vec3(0.00001));
    vec3 toHome = homePosition(index) - position;
    // Only the tangential part of the spring is allowed to move a particle.
    vec3 acceleration = (toHome - normal * dot(toHome, normal)) * uAttraction;

    // Three noise projections form a moving 3D field. Removing the component
    // parallel to the normal constrains the flow to the sphere's tangent plane.
    vec3 noisePosition = normal * uNoiseScale;
    vec2 noiseDrift = vec2(uNoiseTime * 0.19, -uNoiseTime * 0.14);
    vec3 rawNoiseFlow = vec3(
      perlinNoise(noisePosition.yz + noiseDrift),
      perlinNoise(noisePosition.zx + vec2(19.4, 7.2) - noiseDrift.yx),
      perlinNoise(noisePosition.xy + vec2(-8.7, 24.1) + noiseDrift.yx)
    );
    vec3 noiseFlow = rawNoiseFlow - normal * dot(rawNoiseFlow, normal);
    float lifeEnvelope = 0.35 + 0.65 * sin(life * 3.14159265);
    acceleration += noiseFlow * uNoiseForce * lifeEnvelope;

    // Math/Add stage: a second, finer noise band is added to feedback each
    // frame. This creates diffusion instead of only moving the home target.
    vec3 finePoint = noisePosition * 2.07 + index * vec3(0.00031, -0.00023, 0.00017);
    vec3 rawDiffusion = vec3(
      perlinNoise(finePoint.xy + vec2(31.7, 8.4)),
      perlinNoise(finePoint.yz + vec2(-12.2, 27.9)),
      perlinNoise(finePoint.zx + vec2(6.8, -17.5))
    );
    vec3 diffusionNoise = rawDiffusion - normal * dot(rawDiffusion, normal);
    acceleration += diffusionNoise * uDiffusion * (0.4 + life * 0.6);

    vec2 fromPointer = position.xy - uPointer;
    float distanceToPointer = length(fromPointer);

    if (
      uPointerActive > 0.5 &&
      distanceToPointer > 0.1 &&
      distanceToPointer < uRepelRadius
    ) {
      float falloff = 1.0 - distanceToPointer / uRepelRadius;
      acceleration += vec3(fromPointer / distanceToPointer, 0.0) * uRepelStrength * falloff;
    }

    // Project every accumulated force and the feedback velocity back onto the
    // tangent plane before integration.
    acceleration -= normal * dot(acceleration, normal);
    velocity -= normal * dot(velocity, normal);
    // The Processing sketch uses frame-based values. Scaling by a 60 Hz frame
    // keeps the same feel when the display refresh rate changes.
    velocity += acceleration * uFrameScale;
    return velocity * pow(uDamping, uFrameScale);
  }
`

const positionShader = /* glsl */ `
  ${simulationCommon}

  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 feedback = texture2D(texturePosition, uv);
    vec3 position = feedback.xyz;
    float life = feedback.w;
    vec3 velocity = texture2D(textureVelocity, uv).xyz;
    float index = particleIndex();
    vec3 updatedVelocity = nextVelocity(position, velocity, index, life);

    // Feedback + Life through an Over-style blend. At the end of its life a
    // new home sample overlays the old feedback, then enters the loop again.
    float advancedLife = life + uLifeSpeed * uFrameScale;
    float respawn = step(1.0, advancedLife);
    vec3 feedbackPosition = position + updatedVelocity * uFrameScale;

    // Math Length + Composite Divide: measure distance to the origin and
    // divide by it, then multiply by the fixed radius. Noise can now change
    // spacing, never the spherical shape.
    float distanceToOrigin = max(length(feedbackPosition), 0.00001);
    vec3 normalizedPosition = feedbackPosition / distanceToOrigin * uRadius;
    vec3 nextPosition = mix(normalizedPosition, homePosition(index), respawn);
    nextPosition = normalize(nextPosition + vec3(0.00001)) * uRadius;
    gl_FragColor = vec4(nextPosition, fract(advancedLife));
  }
`

const velocityShader = /* glsl */ `
  ${simulationCommon}

  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 feedback = texture2D(texturePosition, uv);
    vec3 position = feedback.xyz;
    float life = feedback.w;
    vec3 velocity = texture2D(textureVelocity, uv).xyz;
    vec3 updatedVelocity = nextVelocity(position, velocity, particleIndex(), life);
    float respawn = step(1.0, life + uLifeSpeed * uFrameScale);
    updatedVelocity *= mix(1.0, 0.12, respawn);
    vec3 normal = normalize(position + vec3(0.00001));
    updatedVelocity -= normal * dot(updatedVelocity, normal);
    gl_FragColor = vec4(updatedVelocity, 1.0);
  }
`

const particleVertexShader = /* glsl */ `
  precision highp float;

  uniform sampler2D uPosition;
  uniform float uPixelRatio;
  uniform float uParticleCount;
  attribute vec2 aReference;
  attribute float aIndex;
  varying float vLife;
  varying float vVisible;

  void main() {
    vec4 state = texture2D(uPosition, aReference);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(state.xyz, 1.0);
    vLife = state.w;
    vVisible = 1.0 - step(uParticleCount, aIndex);
    gl_PointSize = 2.0 * uPixelRatio;
  }
`

const particleFragmentShader = /* glsl */ `
  precision highp float;
  uniform float uLifeColor;
  uniform float uLevelGain;
  uniform float uLevelGamma;
  varying float vLife;
  varying float vVisible;

  void main() {
    if (vVisible < 0.5) discard;
    vec2 point = gl_PointCoord - 0.5;
    float lifeAlpha = smoothstep(0.0, 0.055, vLife)
      * (1.0 - smoothstep(0.84, 1.0, vLife));
    float alpha = (1.0 - smoothstep(0.34, 0.5, length(point))) * lifeAlpha;
    if (alpha <= 0.0) discard;

    // Select the Life channel as the instance color reference: young points
    // are blue, mature points approach white, and old points become cyan.
    vec3 birthColor = vec3(0.18, 0.46, 1.0);
    vec3 matureColor = vec3(1.0, 1.0, 1.0);
    vec3 oldColor = vec3(0.22, 0.88, 1.0);
    vec3 firstHalf = mix(birthColor, matureColor, smoothstep(0.0, 0.48, vLife));
    vec3 secondHalf = mix(matureColor, oldColor, smoothstep(0.48, 1.0, vLife));
    vec3 lifeGradient = mix(firstHalf, secondHalf, step(0.48, vLife));

    vec3 color = mix(vec3(1.0), lifeGradient, uLifeColor);
    color = pow(max(color * uLevelGain, vec3(0.0)), vec3(1.0 / max(uLevelGamma, 0.001)));
    gl_FragColor = vec4(color, alpha);
  }
`

function fillInitialState(
  positionTexture: THREE.DataTexture,
  velocityTexture: THREE.DataTexture,
  radius: number,
  textureSize: number,
  particleCount: number,
) {
  const positions = positionTexture.image.data as Float32Array
  const velocities = velocityTexture.image.data as Float32Array

  for (let i = 0; i < textureSize * textureSize; i += 1) {
    const normalizedIndex = (i + 0.5) / particleCount
    const y = Math.max(-1, Math.min(1, 1 - 2 * normalizedIndex))
    const ringRadius = Math.sqrt(Math.max(0, 1 - y * y))
    const longitude = i * 2.39996322973
    positions[i * 4] = Math.sin(longitude) * ringRadius * radius
    positions[i * 4 + 1] = y * radius
    positions[i * 4 + 2] = Math.cos(longitude) * ringRadius * radius
    positions[i * 4 + 3] = (i * 0.61803398875) % 1
    velocities[i * 4] = 0
    velocities[i * 4 + 1] = 0
    velocities[i * 4 + 2] = 0
    velocities[i * 4 + 3] = 1
  }
}

function createParticleGeometry(textureSize: number) {
  const count = textureSize * textureSize
  const references = new Float32Array(count * 2)
  const indices = new Float32Array(count)

  for (let i = 0; i < count; i += 1) {
    references[i * 2] = (i % textureSize + 0.5) / textureSize
    references[i * 2 + 1] = (Math.floor(i / textureSize) + 0.5) / textureSize
    indices[i] = i
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
  geometry.setAttribute('aReference', new THREE.BufferAttribute(references, 2))
  geometry.setAttribute('aIndex', new THREE.BufferAttribute(indices, 1))
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 2000)
  return geometry
}

function addSimulationUniforms(
  material: THREE.ShaderMaterial,
  radius: number,
  particleCount: number,
  controls: SimulationControls,
) {
  material.uniforms.uAngle = { value: 0 }
  material.uniforms.uRadius = { value: radius }
  material.uniforms.uParticleCount = { value: particleCount }
  material.uniforms.uAttraction = { value: controls.attraction }
  material.uniforms.uDamping = { value: 0.9 }
  material.uniforms.uRepelRadius = { value: radius === 160 ? 60 : 90 }
  material.uniforms.uRepelStrength = { value: 28 }
  material.uniforms.uNoiseScale = { value: controls.noiseScale }
  material.uniforms.uNoiseStrength = { value: controls.noiseAmplitude }
  material.uniforms.uNoiseForce = { value: controls.noiseForce }
  material.uniforms.uNoiseTime = { value: 0 }
  material.uniforms.uDiffusion = { value: controls.diffusion }
  material.uniforms.uLifeSpeed = { value: controls.lifeSpeed }
  material.uniforms.uFrameScale = { value: 1 }
  material.uniforms.uPointer = { value: new THREE.Vector2() }
  material.uniforms.uPointerActive = { value: 0 }
}

export function ParticleOrb({ mode: _mode }: { mode: OrbMode }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const controlsRef = useRef<SimulationControls>({ ...DEFAULT_CONTROLS })
  const [controls, setControls] = useState<SimulationControls>({ ...DEFAULT_CONTROLS })
  const [deviceSummary, setDeviceSummary] = useState('检测设备…')

  const updateControl = (key: keyof SimulationControls, value: number) => {
    const next = { ...controlsRef.current, [key]: value }
    controlsRef.current = next
    setControls(next)
  }

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const profile = getDeviceProfile()
    setDeviceSummary(`${profile.label} · ${profile.particleCount.toLocaleString()} 粒子 · ${profile.targetFps} FPS`)
    const isMobile = profile.label === '手机'
    const radius = isMobile ? 160 : 250
    const pixelRatio = Math.min(window.devicePixelRatio, profile.maxDpr)
    const scene = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(-450, 450, 350, -350, 0.1, 2000)
    camera.position.z = 800

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' })
    } catch {
      container.dataset.error = 'true'
      return
    }

    renderer.setPixelRatio(pixelRatio)
    renderer.setClearColor(0x000000, 1)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    container.appendChild(renderer.domElement)

    const gpuCompute = new GPUComputationRenderer(profile.textureSize, profile.textureSize, renderer)
    const initialPosition = gpuCompute.createTexture()
    const initialVelocity = gpuCompute.createTexture()
    fillInitialState(initialPosition, initialVelocity, radius, profile.textureSize, profile.particleCount)

    const positionVariable = gpuCompute.addVariable('texturePosition', positionShader, initialPosition)
    const velocityVariable = gpuCompute.addVariable('textureVelocity', velocityShader, initialVelocity)
    gpuCompute.setVariableDependencies(positionVariable, [positionVariable, velocityVariable])
    gpuCompute.setVariableDependencies(velocityVariable, [positionVariable, velocityVariable])
    addSimulationUniforms(positionVariable.material, radius, profile.particleCount, controlsRef.current)
    addSimulationUniforms(velocityVariable.material, radius, profile.particleCount, controlsRef.current)

    const computeError = gpuCompute.init()
    if (computeError) {
      console.error(computeError)
      container.dataset.error = 'true'
    }

    const geometry = createParticleGeometry(profile.textureSize)
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uPosition: { value: gpuCompute.getCurrentRenderTarget(positionVariable).texture },
        uPixelRatio: { value: pixelRatio },
        uParticleCount: { value: profile.particleCount },
        uLifeColor: { value: controlsRef.current.lifeColor },
        uLevelGain: { value: controlsRef.current.levelGain },
        uLevelGamma: { value: controlsRef.current.levelGamma },
      },
      vertexShader: particleVertexShader,
      fragmentShader: particleFragmentShader,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    })
    const points = new THREE.Points(geometry, material)
    points.frustumCulled = false
    scene.add(points)

    const composer = new EffectComposer(renderer)
    composer.setPixelRatio(pixelRatio)
    const renderPass = new RenderPass(scene, camera)
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(1, 1),
      controlsRef.current.bloomStrength * profile.bloomScale,
      controlsRef.current.bloomRadius,
      controlsRef.current.bloomThreshold,
    )
    composer.addPass(renderPass)
    composer.addPass(bloomPass)

    const pointer = new THREE.Vector2()
    let pointerActive = false
    let frame = 0
    let lastTime = performance.now()
    let angle = 0
    let noiseTime = 0

    const syncPointerUniforms = () => {
      for (const variable of [positionVariable, velocityVariable]) {
        variable.material.uniforms.uPointer.value.copy(pointer)
        variable.material.uniforms.uPointerActive.value = pointerActive ? 1 : 0
      }
    }

    const movePointer = (event: PointerEvent) => {
      const bounds = container.getBoundingClientRect()
      pointer.set(
        event.clientX - bounds.left - bounds.width / 2,
        bounds.height / 2 - (event.clientY - bounds.top),
      )
      pointerActive = true
      syncPointerUniforms()
    }
    const leavePointer = () => {
      pointerActive = false
      syncPointerUniforms()
    }
    container.addEventListener('pointermove', movePointer)
    container.addEventListener('pointerdown', movePointer)
    container.addEventListener('pointerleave', leavePointer)
    container.addEventListener('pointerup', leavePointer)

    const resize = () => {
      const { width, height } = container.getBoundingClientRect()
      if (!width || !height) return
      renderer.setSize(width, height, false)
      composer.setSize(width, height)
      camera.left = -width / 2
      camera.right = width / 2
      camera.top = height / 2
      camera.bottom = -height / 2
      camera.updateProjectionMatrix()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    resize()

    const render = (now: number) => {
      const minimumFrameTime = 1000 / profile.targetFps
      if (now - lastTime < minimumFrameTime) {
        frame = requestAnimationFrame(render)
        return
      }
      const delta = Math.min((now - lastTime) / 1000, 1 / 30)
      lastTime = now
      const currentControls = controlsRef.current
      const frameScale = delta * 60 * currentControls.motionSpeed
      angle += 0.01 * frameScale
      noiseTime += delta * currentControls.noiseSpeed

      if (!computeError) {
        for (const variable of [positionVariable, velocityVariable]) {
          variable.material.uniforms.uAngle.value = angle
          variable.material.uniforms.uNoiseTime.value = noiseTime
          variable.material.uniforms.uNoiseScale.value = currentControls.noiseScale
          variable.material.uniforms.uNoiseStrength.value = currentControls.noiseAmplitude
          variable.material.uniforms.uNoiseForce.value = currentControls.noiseForce
          variable.material.uniforms.uDiffusion.value = currentControls.diffusion
          variable.material.uniforms.uLifeSpeed.value = currentControls.lifeSpeed
          variable.material.uniforms.uAttraction.value = currentControls.attraction
          variable.material.uniforms.uFrameScale.value = frameScale
        }
        gpuCompute.compute()
        material.uniforms.uPosition.value = gpuCompute.getCurrentRenderTarget(positionVariable).texture
      }

      material.uniforms.uLifeColor.value = currentControls.lifeColor
      material.uniforms.uLevelGain.value = currentControls.levelGain
      material.uniforms.uLevelGamma.value = currentControls.levelGamma
      bloomPass.strength = currentControls.bloomStrength * profile.bloomScale
      bloomPass.radius = currentControls.bloomRadius
      bloomPass.threshold = currentControls.bloomThreshold
      composer.render()
      frame = requestAnimationFrame(render)
    }
    frame = requestAnimationFrame(render)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      container.removeEventListener('pointermove', movePointer)
      container.removeEventListener('pointerdown', movePointer)
      container.removeEventListener('pointerleave', leavePointer)
      container.removeEventListener('pointerup', leavePointer)
      geometry.dispose()
      material.dispose()
      bloomPass.dispose()
      composer.dispose()
      gpuCompute.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  const simulationRows: Array<{
    key: keyof SimulationControls
    label: string
    min: number
    max: number
    step: number
  }> = [
    { key: 'noiseScale', label: '噪声尺寸', min: 0.35, max: 6, step: 0.01 },
    { key: 'noiseAmplitude', label: '噪声幅度', min: 0, max: 1.4, step: 0.01 },
    { key: 'noiseForce', label: '噪声强度', min: 0, max: 0.6, step: 0.01 },
    { key: 'noiseSpeed', label: '噪声速度', min: 0, max: 1.5, step: 0.01 },
    { key: 'diffusion', label: '扩散量', min: 0, max: 0.2, step: 0.005 },
    { key: 'lifeSpeed', label: '生命速度', min: 0.0005, max: 0.015, step: 0.0005 },
    { key: 'motionSpeed', label: '整体速度', min: 0.05, max: 1.2, step: 0.01 },
    { key: 'attraction', label: '回归力', min: 0.002, max: 0.03, step: 0.001 },
  ]

  const renderRows: typeof simulationRows = [
    { key: 'lifeColor', label: '生命色彩', min: 0, max: 1, step: 0.01 },
    { key: 'levelGain', label: 'Level 亮度', min: 0.2, max: 3, step: 0.01 },
    { key: 'levelGamma', label: 'Level Gamma', min: 0.35, max: 2.2, step: 0.01 },
    { key: 'bloomStrength', label: 'Bloom 强度', min: 0, max: 2.5, step: 0.01 },
    { key: 'bloomRadius', label: 'Bloom 半径', min: 0, max: 1, step: 0.01 },
    { key: 'bloomThreshold', label: 'Bloom 阈值', min: 0, max: 1.5, step: 0.01 },
  ]

  const renderControlRows = (rows: typeof simulationRows) =>
    rows.map(({ key, label, min, max, step }) => (
      <label className="noise-control" key={key}>
        <span>{label}</span>
        <output>
          {controls[key].toFixed(
            key === 'lifeSpeed' ? 4 : key === 'attraction' || key === 'diffusion' ? 3 : 2,
          )}
        </output>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={controls[key]}
          onChange={(event) => updateControl(key, Number(event.target.value))}
        />
      </label>
    ))

  return (
    <div className="particle-orb-shell">
      <div ref={containerRef} className="orb-canvas" role="img" aria-label="可交互的旋转白色粒子球">
        <div className="webgl-fallback">此设备暂不支持浮点纹理粒子模拟</div>
      </div>
      <details className="noise-panel" open>
        <summary>噪声参数</summary>
        <div className="noise-panel__controls">
          {renderControlRows(simulationRows)}
          <button
            className="noise-panel__reset"
            type="button"
            onClick={() => {
              const next = { ...DEFAULT_CONTROLS }
              controlsRef.current = next
              setControls(next)
            }}
          >
            重置参数
          </button>
        </div>
      </details>
      <details className="noise-panel render-panel" open>
        <summary>渲染参数</summary>
        <div className="noise-panel__controls">
          <p className="device-profile">{deviceSummary}</p>
          {renderControlRows(renderRows)}
        </div>
      </details>
    </div>
  )
}
