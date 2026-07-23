import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'

export type OrbMode = 'idle' | 'dialogue' | 'recording' | 'meeting' | 'translate'

const DESKTOP_PARTICLE_COUNT = 16000
const MAX_MARKERS = 8
const LOUD_LEVEL_GAMMA = 0.74
const RENDER_OVERSCAN = 1.6
const ORB_BACKGROUND_COLOR = 0x000000

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
  noiseType: number
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
  particleOpacity: number
}

const DEFAULT_CONTROLS: SimulationControls = {
  noiseType: 0,
  noiseScale: 2.35,
  noiseAmplitude: 0.52,
  noiseForce: 0.06,
  noiseSpeed: 0.28,
  diffusion: 0.035,
  lifeSpeed: 0.003,
  motionSpeed: 0.38,
  attraction: 0.01,
  lifeColor: 1,
  levelGain: 3,
  levelGamma: 1.96,
  bloomStrength: 2.5,
  bloomRadius: 1,
  bloomThreshold: 1.1,
  particleOpacity: 0.17,
}

const CONTROL_LIMITS: Record<keyof SimulationControls, readonly [number, number]> = {
  noiseType: [0, 3],
  noiseScale: [0.35, 6],
  noiseAmplitude: [0, 1.4],
  noiseForce: [0, 0.6],
  noiseSpeed: [0, 1.5],
  diffusion: [0, 0.2],
  lifeSpeed: [0.0005, 0.015],
  motionSpeed: [0.05, 1.2],
  attraction: [0.002, 0.03],
  lifeColor: [0, 1],
  levelGain: [0.2, 3],
  levelGamma: [0.35, 2.2],
  bloomStrength: [0, 2.5],
  bloomRadius: [0, 1],
  bloomThreshold: [0, 1.5],
  particleOpacity: [0, 1],
}

const BUILT_IN_PRESETS: Record<string, Partial<SimulationControls>> = {
  idle: {},
  listening: {
    noiseType: 0,
    noiseAmplitude: 0.62,
    noiseForce: 0.09,
    noiseSpeed: 0.38,
    motionSpeed: 0.34,
  },
  speaking: {
    noiseType: 1,
    noiseAmplitude: 0.82,
    noiseForce: 0.16,
    noiseSpeed: 0.72,
    motionSpeed: 0.62,
  },
  thinking: {
    noiseType: 3,
    noiseScale: 3.4,
    noiseAmplitude: 0.7,
    noiseForce: 0.08,
    noiseSpeed: 0.18,
    motionSpeed: 0.25,
    lifeColor: 1,
  },
}

export type ParticleOrbParams = Partial<SimulationControls>

export type OrbMarkerOptions = {
  visible?: boolean
  orbitRadius?: number
  phase?: number
  speed?: number
  tilt?: number
  brightness?: number
  size?: number
  color?: string
}

export type OrbMarkerState = Required<OrbMarkerOptions> & {
  id: string
  slot: number
}

export type OrbPersonaOptions = {
  color: string
  transition?: number
}

export type ParticleOrbState = {
  version: 1
  params: SimulationControls
  preset: string
  audioLevel: number
  horizontalInput: number
  personaColor: string
  markers: OrbMarkerState[]
}

export type ParticleOrbAPI = {
  readonly version: 1
  setParams: (params: ParticleOrbParams) => ParticleOrbState
  getState: () => ParticleOrbState
  reset: () => ParticleOrbState
  setAudioLevel: (level: number) => ParticleOrbState
  setHorizontalInput: (value: number) => ParticleOrbState
  setPersona: (options: OrbPersonaOptions) => ParticleOrbState
  trigger: (name: 'burst', options?: { intensity?: number; duration?: number }) => ParticleOrbState
  setPreset: (name: string) => ParticleOrbState
  registerPreset: (name: string, params: ParticleOrbParams) => void
  setAllowedOrigins: (origins: string[]) => void
  markers: {
    set: (id: string, options?: OrbMarkerOptions) => OrbMarkerState
    flash: (id: string, options?: { intensity?: number; duration?: number }) => OrbMarkerState
    remove: (id: string) => void
    clear: () => void
    list: () => OrbMarkerState[]
  }
}

export type OrbDebugAPI = {
  fire: (eventName: string, payload?: Record<string, unknown> | number | string) => unknown
  api: ParticleOrbAPI
}

declare global {
  interface Window {
    particleOrb?: ParticleOrbAPI
    ParticleOrbAPI?: ParticleOrbAPI
    __orb?: OrbDebugAPI
  }
}

type InternalMarker = OrbMarkerState & {
  colorValue: THREE.Color
  flashEnergy: number
  flashDecayPerSecond: number
}

const DEFAULT_MARKER_OPTIONS: Required<OrbMarkerOptions> = {
  visible: true,
  orbitRadius: 1.28,
  phase: 0,
  speed: 0.22,
  tilt: 0.3,
  brightness: 1.6,
  size: 12,
  color: '#ffffff',
}

function markerToPublic(marker: InternalMarker): OrbMarkerState {
  const { colorValue: _colorValue, flashEnergy: _flashEnergy, flashDecayPerSecond: _flashDecay, ...state } = marker
  return { ...state }
}

function sanitizeMarkerOptions(input: OrbMarkerOptions = {}): OrbMarkerOptions {
  const result: OrbMarkerOptions = {}
  if (typeof input.visible === 'boolean') result.visible = input.visible
  if (typeof input.color === 'string' && input.color.length <= 64) result.color = input.color
  const limits: Partial<Record<keyof OrbMarkerOptions, readonly [number, number]>> = {
    orbitRadius: [1.05, 1.8],
    phase: [-100, 100],
    speed: [-2, 2],
    tilt: [-Math.PI / 2, Math.PI / 2],
    brightness: [0, 4],
    size: [2, 32],
  }
  for (const [key, range] of Object.entries(limits) as Array<
    [keyof OrbMarkerOptions, readonly [number, number]]
  >) {
    const value = input[key]
    if (typeof value === 'number' && Number.isFinite(value)) {
      ;(result as Record<string, unknown>)[key] = THREE.MathUtils.clamp(value, range[0], range[1])
    }
  }
  return result
}

function sanitizeParams(input: unknown): ParticleOrbParams {
  if (!input || typeof input !== 'object') return {}
  const result: ParticleOrbParams = {}
  const writableResult = result as Record<keyof SimulationControls, number | undefined>

  for (const key of Object.keys(CONTROL_LIMITS) as Array<keyof SimulationControls>) {
    const value = (input as Record<string, unknown>)[key]
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    const [minimum, maximum] = CONTROL_LIMITS[key]
    const clamped = THREE.MathUtils.clamp(value, minimum, maximum)
    writableResult[key] = key === 'noiseType' ? Math.round(clamped) : clamped
  }
  return result
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
  uniform float uPointerRadius;
  uniform float uPointerStrength;
  uniform float uNoiseScale;
  uniform float uNoiseType;
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

  float fieldNoise(vec2 p) {
    float singlePerlin = perlinNoise(p);
    float amplitude = 0.55;
    float fbmTotal = 0.0;
    float turbulenceTotal = 0.0;
    float ridgedTotal = 0.0;
    float weight = 0.0;
    for (int octave = 0; octave < 4; octave++) {
      float value = perlinNoise(p);
      fbmTotal += value * amplitude;
      turbulenceTotal += (abs(value) * 2.0 - 0.72) * amplitude;
      float ridge = 1.0 - abs(value);
      ridgedTotal += (ridge * ridge * 2.0 - 0.9) * amplitude;
      weight += amplitude;
      p = p * 2.03 + vec2(11.7, -7.3);
      amplitude *= 0.5;
    }

    float fbmNoise = fbmTotal / max(weight, 0.0001);
    float turbulenceNoise = turbulenceTotal / max(weight, 0.0001);
    float ridgedNoise = ridgedTotal / max(weight, 0.0001);
    float mode = clamp(uNoiseType, 0.0, 3.0);

    // Adjacent modes share the exact value at their boundary. Preset changes
    // can therefore interpolate through Perlin → FBM → turbulence → ridged
    // without replacing the particle field in a single frame.
    if (mode < 1.0) {
      return mix(singlePerlin, fbmNoise, smoothstep(0.0, 1.0, mode));
    }
    if (mode < 2.0) {
      return mix(fbmNoise, turbulenceNoise, smoothstep(1.0, 2.0, mode));
    }
    return mix(turbulenceNoise, ridgedNoise, smoothstep(2.0, 3.0, mode));
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
    float latitudeNoise = fieldNoise(surface.xy * uNoiseScale + noiseDrift);
    float longitudeNoise = fieldNoise(
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
      fieldNoise(noisePosition.yz + noiseDrift),
      fieldNoise(noisePosition.zx + vec2(19.4, 7.2) - noiseDrift.yx),
      fieldNoise(noisePosition.xy + vec2(-8.7, 24.1) + noiseDrift.yx)
    );
    vec3 noiseFlow = rawNoiseFlow - normal * dot(rawNoiseFlow, normal);
    float lifeEnvelope = 0.35 + 0.65 * sin(life * 3.14159265);
    acceleration += noiseFlow * uNoiseForce * lifeEnvelope;

    // Math/Add stage: a second, finer noise band is added to feedback each
    // frame. This creates diffusion instead of only moving the home target.
    vec3 finePoint = noisePosition * 2.07 + index * vec3(0.00031, -0.00023, 0.00017);
    vec3 rawDiffusion = vec3(
      fieldNoise(finePoint.xy + vec2(31.7, 8.4)),
      fieldNoise(finePoint.yz + vec2(-12.2, 27.9)),
      fieldNoise(finePoint.zx + vec2(6.8, -17.5))
    );
    vec3 diffusionNoise = rawDiffusion - normal * dot(rawDiffusion, normal);
    acceleration += diffusionNoise * uDiffusion * (0.4 + life * 0.6);

    vec2 toPointer = uPointer - position.xy;
    float distanceToPointer = length(toPointer);

    if (
      uPointerActive > 0.5 &&
      distanceToPointer > 0.1 &&
      distanceToPointer < uPointerRadius
    ) {
      // A soft gravitational well follows the cursor. Squared falloff keeps
      // the edge calm while particles close to the pointer visibly converge.
      float falloff = 1.0 - distanceToPointer / uPointerRadius;
      float attractionFalloff = falloff * falloff;
      acceleration += vec3(toPointer / distanceToPointer, 0.0)
        * uPointerStrength * attractionFalloff;
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
  varying float vKeyLight;
  varying float vRimLight;
  varying float vDepthLight;

  void main() {
    vec4 state = texture2D(uPosition, aReference);
    vec3 surfaceNormal = normalize(state.xyz + vec3(0.00001));
    vec3 keyDirection = normalize(vec3(-0.48, 0.64, 0.60));
    vKeyLight = max(dot(surfaceNormal, keyDirection), 0.0);
    vRimLight = pow(1.0 - abs(surfaceNormal.z), 2.15);
    vDepthLight = clamp(surfaceNormal.z * 0.5 + 0.5, 0.0, 1.0);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(state.xyz, 1.0);
    vLife = state.w;
    vVisible = 1.0 - step(uParticleCount, aIndex);
    gl_PointSize = (1.65 + vDepthLight * 0.62 + vRimLight * 0.24) * uPixelRatio;
  }
`

const particleFragmentShader = /* glsl */ `
  precision highp float;
  uniform float uLifeColor;
  uniform float uLevelGain;
  uniform float uLevelGamma;
  uniform float uParticleOpacity;
  uniform vec3 uPersonaColor;
  varying float vLife;
  varying float vVisible;
  varying float vKeyLight;
  varying float vRimLight;
  varying float vDepthLight;

  void main() {
    if (vVisible < 0.5) discard;
    vec2 point = gl_PointCoord - 0.5;
    float lifeAlpha = smoothstep(0.0, 0.055, vLife)
      * (1.0 - smoothstep(0.84, 1.0, vLife));
    float depthOpacity = mix(0.58, 1.0, vDepthLight);
    float alpha = (1.0 - smoothstep(0.34, 0.5, length(point)))
      * lifeAlpha * uParticleOpacity * depthOpacity;
    if (alpha <= 0.0) discard;

    // Select the Life channel as the instance color reference: young points
    // are blue, mature points approach white, and old points become cyan.
    vec3 birthColor = vec3(0.18, 0.46, 1.0);
    vec3 matureColor = vec3(1.0, 1.0, 1.0);
    vec3 oldColor = vec3(0.22, 0.88, 1.0);
    vec3 firstHalf = mix(birthColor, matureColor, smoothstep(0.0, 0.48, vLife));
    vec3 secondHalf = mix(matureColor, oldColor, smoothstep(0.48, 1.0, vLife));
    vec3 lifeGradient = mix(firstHalf, secondHalf, step(0.48, vLife));

    vec3 baseColor = mix(vec3(1.0), lifeGradient, uLifeColor) * uPersonaColor;
    float shapedKeyLight = smoothstep(0.0, 0.88, vKeyLight);
    float surfaceLight = (0.38 + shapedKeyLight * 0.68) * mix(0.62, 1.0, vDepthLight);
    vec3 rimColor = mix(baseColor, vec3(1.0), 0.52);
    vec3 color = baseColor * surfaceLight
      + rimColor * vRimLight * (0.12 + vDepthLight * 0.24);
    color = pow(max(color * uLevelGain, vec3(0.0)), vec3(1.0 / max(uLevelGamma, 0.001)));
    gl_FragColor = vec4(color, alpha);
  }
`

const markerVertexShader = /* glsl */ `
  precision highp float;
  uniform float uPixelRatio;
  attribute float aSize;
  attribute float aBrightness;
  attribute vec3 aColor;
  varying float vBrightness;
  varying vec3 vColor;

  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uPixelRatio;
    vBrightness = aBrightness;
    vColor = aColor;
  }
`

const markerFragmentShader = /* glsl */ `
  precision highp float;
  varying float vBrightness;
  varying vec3 vColor;

  void main() {
    vec2 point = gl_PointCoord - 0.5;
    float distanceToCenter = length(point);
    if (distanceToCenter > 0.5 || vBrightness <= 0.0) discard;
    float core = 1.0 - smoothstep(0.04, 0.2, distanceToCenter);
    float halo = (1.0 - smoothstep(0.08, 0.5, distanceToCenter)) * 0.45;
    float alpha = min(1.0, (core + halo) * vBrightness);
    gl_FragColor = vec4(vColor * (0.75 + vBrightness * 0.75), alpha);
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
  material.uniforms.uPointerRadius = { value: radius * 0.58 }
  material.uniforms.uPointerStrength = { value: radius === 160 ? 2 : 2.6 }
  material.uniforms.uNoiseType = { value: controls.noiseType }
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

export function ParticleOrb({
  mode,
  showControls = true,
}: {
  mode: OrbMode
  showControls?: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const controlsRef = useRef<SimulationControls>({ ...DEFAULT_CONTROLS })
  const renderedControlsRef = useRef<SimulationControls>({ ...DEFAULT_CONTROLS })
  const presetRef = useRef('idle')
  const presetsRef = useRef<Record<string, ParticleOrbParams>>({ ...BUILT_IN_PRESETS })
  const audioTargetRef = useRef(0)
  const audioCurrentRef = useRef(0)
  const horizontalTargetRef = useRef(0)
  const horizontalCurrentRef = useRef(0)
  const burstRef = useRef({ energy: 0, decayPerSecond: 1 })
  const markersRef = useRef(new Map<string, InternalMarker>())
  const personaRef = useRef({
    current: new THREE.Color('#ffffff'),
    from: new THREE.Color('#ffffff'),
    target: new THREE.Color('#ffffff'),
    elapsed: 1,
    duration: 1,
  })
  const allowedOriginsRef = useRef(new Set(['*']))
  const notifyRef = useRef<(type: string, state: ParticleOrbState) => void>(() => undefined)
  const [controls, setControls] = useState<SimulationControls>({ ...DEFAULT_CONTROLS })
  const [personaColor, setPersonaColor] = useState('#ffffff')
  const [markerStates, setMarkerStates] = useState<OrbMarkerState[]>([])
  const [deviceSummary, setDeviceSummary] = useState('检测设备…')

  const getPublicState = (): ParticleOrbState => ({
    version: 1,
    params: { ...controlsRef.current },
    preset: presetRef.current,
    audioLevel: audioTargetRef.current,
    horizontalInput: horizontalTargetRef.current,
    personaColor: `#${personaRef.current.target.getHexString()}`,
    markers: Array.from(markersRef.current.values(), markerToPublic),
  })

  const commitControls = (next: SimulationControls, preset = 'custom') => {
    controlsRef.current = next
    presetRef.current = preset
    setControls(next)
    notifyRef.current('paramsChanged', getPublicState())
  }

  const updateControl = (key: keyof SimulationControls, value: number) => {
    const sanitized = sanitizeParams({ [key]: value })
    commitControls({ ...controlsRef.current, ...sanitized })
  }

  const resetControls = () => {
    audioTargetRef.current = 0
    horizontalTargetRef.current = 0
    burstRef.current.energy = 0
    markersRef.current.clear()
    personaRef.current.current.set('#ffffff')
    personaRef.current.from.set('#ffffff')
    personaRef.current.target.set('#ffffff')
    personaRef.current.elapsed = personaRef.current.duration
    setPersonaColor('#ffffff')
    commitControls({ ...DEFAULT_CONTROLS }, 'idle')
  }

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const profile = getDeviceProfile()
    setDeviceSummary(`${profile.label} · ${profile.particleCount.toLocaleString()} 粒子 · ${profile.targetFps} FPS`)
    const isMobile = profile.label === '手机'
    const radius = isMobile ? 160 : 250
    // The canvas is deliberately oversized in CSS so orbiting task markers
    // and Bloom never meet a hard WebGL edge. Scaling the projection by the
    // same factor keeps the visible sphere diameter unchanged.
    const projectionHalfExtent = radius * 1.32 * RENDER_OVERSCAN
    const pixelRatio = Math.min(window.devicePixelRatio, profile.maxDpr)
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(ORB_BACKGROUND_COLOR)
    const camera = new THREE.OrthographicCamera(
      -projectionHalfExtent,
      projectionHalfExtent,
      projectionHalfExtent,
      -projectionHalfExtent,
      0.1,
      2000,
    )
    camera.position.z = 800

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'high-performance' })
    } catch {
      container.dataset.error = 'true'
      return
    }

    renderer.setPixelRatio(pixelRatio)
    renderer.setClearColor(ORB_BACKGROUND_COLOR, 1)
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
        uParticleOpacity: { value: controlsRef.current.particleOpacity },
        uPersonaColor: { value: personaRef.current.current },
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

    const markerPositions = new Float32Array(MAX_MARKERS * 3)
    const markerSizes = new Float32Array(MAX_MARKERS)
    const markerBrightness = new Float32Array(MAX_MARKERS)
    const markerColors = new Float32Array(MAX_MARKERS * 3)
    const markerGeometry = new THREE.BufferGeometry()
    markerGeometry.setAttribute('position', new THREE.BufferAttribute(markerPositions, 3))
    markerGeometry.setAttribute('aSize', new THREE.BufferAttribute(markerSizes, 1))
    markerGeometry.setAttribute('aBrightness', new THREE.BufferAttribute(markerBrightness, 1))
    markerGeometry.setAttribute('aColor', new THREE.BufferAttribute(markerColors, 3))
    markerGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 2000)
    const markerMaterial = new THREE.ShaderMaterial({
      uniforms: { uPixelRatio: { value: pixelRatio } },
      vertexShader: markerVertexShader,
      fragmentShader: markerFragmentShader,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    })
    const markerPoints = new THREE.Points(markerGeometry, markerMaterial)
    markerPoints.frustumCulled = false
    scene.add(markerPoints)

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

    const emitState = (type: string, state: ParticleOrbState) => {
      const message = { source: 'particle-orb', version: 1, type, payload: state }
      window.dispatchEvent(new CustomEvent(`particle-orb:${type}`, { detail: state }))
      if (window.parent !== window) window.parent.postMessage(message, '*')
    }
    notifyRef.current = emitState

    const markerAPI: ParticleOrbAPI['markers'] = {
      set: (id, options = {}) => {
        if (!id || id.length > 64) throw new Error('Marker id must contain 1–64 characters')
        const existing = markersRef.current.get(id)
        if (!existing && markersRef.current.size >= MAX_MARKERS) {
          throw new Error(`Particle orb supports at most ${MAX_MARKERS} markers`)
        }
        const slot = existing?.slot ?? Array.from({ length: MAX_MARKERS }, (_, index) => index).find(
          (candidate) => !Array.from(markersRef.current.values()).some((marker) => marker.slot === candidate),
        )!
        const sanitized = sanitizeMarkerOptions(options)
        const base = existing ?? {
          ...DEFAULT_MARKER_OPTIONS,
          id,
          slot,
          phase: slot / MAX_MARKERS,
          colorValue: new THREE.Color(DEFAULT_MARKER_OPTIONS.color),
          flashEnergy: 0,
          flashDecayPerSecond: 1,
        }
        const marker: InternalMarker = { ...base, ...sanitized, id, slot }
        if (sanitized.color) marker.colorValue.set(sanitized.color)
        marker.color = `#${marker.colorValue.getHexString()}`
        markersRef.current.set(id, marker)
        setMarkerStates(Array.from(markersRef.current.values(), markerToPublic))
        emitState('markersChanged', getPublicState())
        return markerToPublic(marker)
      },
      flash: (id, options = {}) => {
        const marker = markersRef.current.get(id)
        if (!marker) throw new Error(`Unknown particle orb marker: ${id}`)
        const intensity = THREE.MathUtils.clamp(options.intensity ?? 1, 0, 4)
        const duration = THREE.MathUtils.clamp(options.duration ?? 0.45, 0.05, 5)
        marker.flashEnergy = Math.max(marker.flashEnergy, intensity)
        marker.flashDecayPerSecond = intensity / duration
        emitState('markerFlashed', getPublicState())
        return markerToPublic(marker)
      },
      remove: (id) => {
        markersRef.current.delete(id)
        setMarkerStates(Array.from(markersRef.current.values(), markerToPublic))
        emitState('markersChanged', getPublicState())
      },
      clear: () => {
        markersRef.current.clear()
        setMarkerStates([])
        emitState('markersChanged', getPublicState())
      },
      list: () => Array.from(markersRef.current.values(), markerToPublic),
    }

    const api: ParticleOrbAPI = {
      version: 1,
      setParams: (params) => {
        commitControls({ ...controlsRef.current, ...sanitizeParams(params) })
        return getPublicState()
      },
      getState: getPublicState,
      reset: () => {
        audioTargetRef.current = 0
        horizontalTargetRef.current = 0
        burstRef.current.energy = 0
        markersRef.current.clear()
        setMarkerStates([])
        personaRef.current.current.set('#ffffff')
        personaRef.current.from.set('#ffffff')
        personaRef.current.target.set('#ffffff')
        personaRef.current.elapsed = personaRef.current.duration
        setPersonaColor('#ffffff')
        commitControls({ ...DEFAULT_CONTROLS }, 'idle')
        return getPublicState()
      },
      setAudioLevel: (level) => {
        audioTargetRef.current = THREE.MathUtils.clamp(Number.isFinite(level) ? level : 0, 0, 1)
        return getPublicState()
      },
      setHorizontalInput: (value) => {
        horizontalTargetRef.current = THREE.MathUtils.clamp(Number.isFinite(value) ? value : 0, -1, 1)
        return getPublicState()
      },
      setPersona: ({ color, transition = 1 }) => {
        if (typeof color !== 'string' || !color) throw new Error('Persona color is required')
        const persona = personaRef.current
        persona.from.copy(persona.current)
        persona.target.set(color)
        persona.elapsed = 0
        persona.duration = THREE.MathUtils.clamp(transition, 0.05, 10)
        setPersonaColor(`#${persona.target.getHexString()}`)
        emitState('personaChanged', getPublicState())
        return getPublicState()
      },
      trigger: (name, options = {}) => {
        if (name !== 'burst') throw new Error(`Unsupported particle orb trigger: ${name}`)
        const intensity = THREE.MathUtils.clamp(options.intensity ?? 1, 0, 2)
        const duration = THREE.MathUtils.clamp(options.duration ?? 0.75, 0.1, 5)
        burstRef.current.energy = Math.max(burstRef.current.energy, intensity)
        burstRef.current.decayPerSecond = intensity / duration
        emitState('triggered', getPublicState())
        return getPublicState()
      },
      setPreset: (name) => {
        const preset = presetsRef.current[name]
        if (!preset) throw new Error(`Unknown particle orb preset: ${name}`)
        commitControls({ ...DEFAULT_CONTROLS, ...sanitizeParams(preset) }, name)
        return getPublicState()
      },
      registerPreset: (name, params) => {
        if (!name || name.length > 64) throw new Error('Preset name must contain 1–64 characters')
        presetsRef.current[name] = sanitizeParams(params)
      },
      setAllowedOrigins: (origins) => {
        allowedOriginsRef.current = new Set(origins.filter((origin) => typeof origin === 'string' && origin.length > 0))
      },
      markers: markerAPI,
    }

    const debugAPI: OrbDebugAPI = {
      api,
      fire: (eventName, payload = {}) => {
        const data = payload && typeof payload === 'object' ? payload : { value: payload }
        const rawValue = (data as Record<string, unknown>).level ?? (data as Record<string, unknown>).value
        const value = Number(rawValue ?? 0)
        if (['voice', 'volume', '音量', '用户说话'].includes(eventName)) {
          return api.setAudioLevel(rawValue === undefined ? 0.78 : value)
        }
        if (['horizontal', 'swipe', '横滑'].includes(eventName)) return api.setHorizontalInput(value)
        if (['burst', '能量爆发', '主动发声'].includes(eventName)) {
          return api.trigger('burst', data as { intensity?: number; duration?: number })
        }
        if (['state', 'preset', '状态切换'].includes(eventName)) {
          const name = String((data as Record<string, unknown>).name ?? (data as Record<string, unknown>).value ?? 'speaking')
          return api.setPreset(name)
        }
        if (['persona', '人格换色'].includes(eventName)) {
          const color = String((data as Record<string, unknown>).color ?? '#74a7ff')
          const transition = Number((data as Record<string, unknown>).transition ?? 1)
          return api.setPersona({ color, transition })
        }
        const id = String((data as Record<string, unknown>).id ?? 'task-1')
        if (['task:add', '新建任务'].includes(eventName)) return markerAPI.set(id, data as OrbMarkerOptions)
        if (['task:progress', '任务有进展'].includes(eventName)) {
          const progress = Number((data as Record<string, unknown>).progress ?? 0.5)
          return markerAPI.flash(id, { intensity: 0.8 + THREE.MathUtils.clamp(progress, 0, 1) * 1.2 })
        }
        if (['task:complete', '任务完成'].includes(eventName)) {
          return markerAPI.flash(id, { intensity: 2.4, duration: 0.8 })
        }
        if (['task:remove', '移除任务'].includes(eventName)) return markerAPI.remove(id)
        throw new Error(`Unknown orb debug event: ${eventName}`)
      },
    }

    const replyToMessage = (event: MessageEvent, type: string, payload: unknown, requestId?: unknown) => {
      if (!event.source || !('postMessage' in event.source)) return
      const targetOrigin = event.origin === 'null' ? '*' : event.origin
      ;(event.source as Window).postMessage(
        { source: 'particle-orb', version: 1, type, requestId, payload },
        targetOrigin,
      )
    }

    const handleMessage = (event: MessageEvent) => {
      const allowed = allowedOriginsRef.current
      if (!allowed.has('*') && !allowed.has(event.origin)) return
      const data = event.data as Record<string, unknown> | null
      if (!data || data.source !== 'particle-orb-control' || data.version !== 1 || typeof data.type !== 'string') return

      const type = data.type.replace(/^particle-orb:/, '')
      const payload = data.payload
      try {
        let state: ParticleOrbState
        if (type === 'setParams' || type === 'set-params') {
          state = api.setParams((payload ?? {}) as ParticleOrbParams)
        } else if (type === 'setAudioLevel' || type === 'audio-level') {
          const level = typeof payload === 'number' ? payload : Number((payload as { level?: unknown })?.level)
          state = api.setAudioLevel(level)
        } else if (type === 'setHorizontalInput' || type === 'horizontal-input') {
          const value = typeof payload === 'number' ? payload : Number((payload as { value?: unknown })?.value)
          state = api.setHorizontalInput(value)
        } else if (type === 'setPersona' || type === 'set-persona') {
          state = api.setPersona((payload ?? {}) as OrbPersonaOptions)
        } else if (type === 'trigger') {
          const triggerPayload = (payload ?? {}) as { name?: unknown; intensity?: number; duration?: number }
          state = api.trigger(String(triggerPayload.name ?? 'burst') as 'burst', triggerPayload)
        } else if (type === 'setPreset' || type === 'set-preset') {
          const name = typeof payload === 'string' ? payload : String((payload as { name?: unknown })?.name ?? '')
          state = api.setPreset(name)
        } else if (type === 'reset') {
          state = api.reset()
        } else if (type === 'getState' || type === 'get-state') {
          state = api.getState()
        } else if (type === 'marker-set') {
          const markerPayload = (payload ?? {}) as OrbMarkerOptions & { id?: string }
          markerAPI.set(String(markerPayload.id ?? ''), markerPayload)
          state = api.getState()
        } else if (type === 'marker-flash') {
          const markerPayload = (payload ?? {}) as { id?: string; intensity?: number; duration?: number }
          markerAPI.flash(String(markerPayload.id ?? ''), markerPayload)
          state = api.getState()
        } else if (type === 'marker-remove') {
          const id = typeof payload === 'string' ? payload : String((payload as { id?: unknown })?.id ?? '')
          markerAPI.remove(id)
          state = api.getState()
        } else if (type === 'debug-fire') {
          const debugPayload = (payload ?? {}) as { eventName?: string; data?: Record<string, unknown> }
          debugAPI.fire(String(debugPayload.eventName ?? ''), debugPayload.data)
          state = api.getState()
        } else {
          throw new Error(`Unsupported particle orb message: ${type}`)
        }
        replyToMessage(event, 'state', state, data.requestId)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown particle orb error'
        replyToMessage(event, 'error', { message }, data.requestId)
      }
    }

    window.particleOrb = api
    window.ParticleOrbAPI = api
    window.__orb = debugAPI
    window.addEventListener('message', handleMessage)
    emitState('ready', api.getState())

    const syncPointerUniforms = () => {
      for (const variable of [positionVariable, velocityVariable]) {
        variable.material.uniforms.uPointer.value.copy(pointer)
        variable.material.uniforms.uPointerActive.value = pointerActive ? 1 : 0
      }
    }

    const movePointer = (event: PointerEvent) => {
      const bounds = container.getBoundingClientRect()
      const normalizedX = ((event.clientX - bounds.left) / bounds.width) * 2 - 1
      const normalizedY = 1 - ((event.clientY - bounds.top) / bounds.height) * 2
      pointer.set(
        normalizedX * (camera.right - camera.left) * 0.5,
        normalizedY * (camera.top - camera.bottom) * 0.5,
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
      const aspect = width / height
      camera.left = -projectionHalfExtent * aspect
      camera.right = projectionHalfExtent * aspect
      camera.top = projectionHalfExtent
      camera.bottom = -projectionHalfExtent
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
      const targetControls = controlsRef.current
      const currentControls = renderedControlsRef.current
      const parameterSmoothing = 1 - Math.exp(-9 * delta)
      for (const key of Object.keys(CONTROL_LIMITS) as Array<keyof SimulationControls>) {
        currentControls[key] += (targetControls[key] - currentControls[key]) * parameterSmoothing
      }
      const audioSmoothing = 1 - Math.exp(-12 * delta)
      audioCurrentRef.current += (audioTargetRef.current - audioCurrentRef.current) * audioSmoothing
      const horizontalSmoothing = 1 - Math.exp(-10 * delta)
      horizontalCurrentRef.current +=
        (horizontalTargetRef.current - horizontalCurrentRef.current) * horizontalSmoothing
      const audioLevel = audioCurrentRef.current
      const effectiveLevelGamma = THREE.MathUtils.lerp(
        currentControls.levelGamma,
        LOUD_LEVEL_GAMMA,
        audioLevel,
      )
      const burstEnergy = burstRef.current.energy
      burstRef.current.energy = Math.max(0, burstEnergy - burstRef.current.decayPerSecond * delta)

      const persona = personaRef.current
      if (persona.elapsed < persona.duration) {
        persona.elapsed = Math.min(persona.duration, persona.elapsed + delta)
        const linearProgress = persona.elapsed / persona.duration
        const easedProgress = linearProgress * linearProgress * (3 - 2 * linearProgress)
        persona.current.lerpColors(persona.from, persona.target, easedProgress)
      }

      const effectiveMotionSpeed = currentControls.motionSpeed + burstEnergy * 0.9
      const effectiveNoiseAmplitude = Math.min(1.4, currentControls.noiseAmplitude + audioLevel * 0.5)
      const effectiveNoiseForce = Math.min(
        0.9,
        currentControls.noiseForce + audioLevel * 0.18 + burstEnergy * 0.24,
      )
      const frameScale = delta * 60 * effectiveMotionSpeed
      angle += 0.01 * frameScale + horizontalCurrentRef.current * delta * 0.85
      noiseTime += delta * (currentControls.noiseSpeed + burstEnergy * 0.45)

      if (!computeError) {
        for (const variable of [positionVariable, velocityVariable]) {
          variable.material.uniforms.uAngle.value = angle
          variable.material.uniforms.uNoiseTime.value = noiseTime
          variable.material.uniforms.uNoiseType.value = currentControls.noiseType
          variable.material.uniforms.uNoiseScale.value = currentControls.noiseScale
          variable.material.uniforms.uNoiseStrength.value = effectiveNoiseAmplitude
          variable.material.uniforms.uNoiseForce.value = effectiveNoiseForce
          variable.material.uniforms.uDiffusion.value = currentControls.diffusion
          variable.material.uniforms.uLifeSpeed.value = currentControls.lifeSpeed
          variable.material.uniforms.uAttraction.value = currentControls.attraction
          variable.material.uniforms.uFrameScale.value = frameScale
        }
        gpuCompute.compute()
        material.uniforms.uPosition.value = gpuCompute.getCurrentRenderTarget(positionVariable).texture
      }

      material.uniforms.uLifeColor.value = currentControls.lifeColor
      material.uniforms.uLevelGain.value = Math.min(3, currentControls.levelGain + burstEnergy * 0.22)
      material.uniforms.uLevelGamma.value = effectiveLevelGamma
      material.uniforms.uParticleOpacity.value = currentControls.particleOpacity
      material.uniforms.uPersonaColor.value = persona.current

      markerBrightness.fill(0)
      for (const marker of markersRef.current.values()) {
        const slot = marker.slot
        const orbitAngle = marker.phase * Math.PI * 2 + now * 0.001 * marker.speed
        const orbitDistance = radius * marker.orbitRadius
        const sinAngle = Math.sin(orbitAngle)
        markerPositions[slot * 3] = Math.cos(orbitAngle) * orbitDistance
        markerPositions[slot * 3 + 1] = sinAngle * orbitDistance * Math.cos(marker.tilt)
        markerPositions[slot * 3 + 2] = sinAngle * orbitDistance * Math.sin(marker.tilt)
        const flashEnergy = marker.flashEnergy
        marker.flashEnergy = Math.max(0, flashEnergy - marker.flashDecayPerSecond * delta)
        markerBrightness[slot] = marker.visible ? marker.brightness + flashEnergy * 1.8 : 0
        markerSizes[slot] = marker.size * (1 + flashEnergy * 0.3)
        marker.colorValue.toArray(markerColors, slot * 3)
      }
      markerGeometry.getAttribute('position').needsUpdate = true
      markerGeometry.getAttribute('aSize').needsUpdate = true
      markerGeometry.getAttribute('aBrightness').needsUpdate = true
      markerGeometry.getAttribute('aColor').needsUpdate = true

      bloomPass.strength =
        Math.min(2.5, currentControls.bloomStrength + audioLevel * 0.12 + burstEnergy * 1.1)
        * profile.bloomScale
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
      window.removeEventListener('message', handleMessage)
      if (window.particleOrb === api) delete window.particleOrb
      if (window.ParticleOrbAPI === api) delete window.ParticleOrbAPI
      if (window.__orb === debugAPI) delete window.__orb
      notifyRef.current = () => undefined
      geometry.dispose()
      material.dispose()
      markerGeometry.dispose()
      markerMaterial.dispose()
      bloomPass.dispose()
      composer.dispose()
      gpuCompute.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  useEffect(() => {
    const presetByMode: Record<OrbMode, string> = {
      idle: 'idle',
      dialogue: 'listening',
      recording: 'speaking',
      meeting: 'thinking',
      translate: 'listening',
    }
    const applyMode = () => {
      const api = window.particleOrb
      if (!api) return
      api.setPreset(presetByMode[mode])
    }
    applyMode()
    window.addEventListener('particle-orb:ready', applyMode)
    return () => window.removeEventListener('particle-orb:ready', applyMode)
  }, [mode])

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
    { key: 'particleOpacity', label: '粒子透明度', min: 0, max: 1, step: 0.01 },
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

  const addTestMarker = () => {
    const api = window.particleOrb
    if (!api || markerStates.length >= MAX_MARKERS) return
    const usedIds = new Set(markerStates.map((marker) => marker.id))
    const number = Array.from({ length: MAX_MARKERS }, (_, index) => index + 1).find(
      (candidate) => !usedIds.has(`task-${candidate}`),
    )
    if (!number) return
    const palette = ['#ffffff', '#79a7ff', '#6fffd4', '#ffdc7a', '#ff80b5', '#9b87ff', '#7ce7ff', '#ff9a72']
    api.markers.set(`task-${number}`, {
      phase: (number - 1) / MAX_MARKERS,
      tilt: number % 2 === 0 ? -0.32 : 0.34,
      color: palette[number - 1],
    })
  }

  const createThreeMarkerDemo = () => {
    const api = window.particleOrb
    if (!api) return
    api.markers.clear()
    const demo = [
      { id: 'task-1', phase: 0, tilt: 0.2, color: '#ffffff' },
      { id: 'task-2', phase: 1 / 3, tilt: -0.34, color: '#79a7ff' },
      { id: 'task-3', phase: 2 / 3, tilt: 0.42, color: '#6fffd4' },
    ]
    for (const marker of demo) {
      api.markers.set(marker.id, { ...marker, size: 15, brightness: 2, orbitRadius: 1.3, speed: 0.2 })
    }
    api.trigger('burst', { intensity: 0.55, duration: 0.7 })
  }

  return (
    <div className="particle-orb-shell">
      <div ref={containerRef} className="orb-canvas" role="img" aria-label="可交互的旋转白色粒子球">
        <div className="webgl-fallback">此设备暂不支持浮点纹理粒子模拟</div>
      </div>
      {showControls && <details className="noise-panel">
        <summary>噪声参数</summary>
        <div className="noise-panel__controls">
          <label className="noise-control noise-control--select">
            <span>噪声类型</span>
            <select
              value={controls.noiseType}
              onChange={(event) => updateControl('noiseType', Number(event.target.value))}
            >
              <option value={0}>Perlin</option>
              <option value={1}>FBM</option>
              <option value={2}>Turbulence</option>
              <option value={3}>Ridged</option>
            </select>
          </label>
          {renderControlRows(simulationRows)}
          <button
            className="noise-panel__reset"
            type="button"
            onClick={resetControls}
          >
            重置参数
          </button>
        </div>
      </details>}
      {showControls && <details className="noise-panel render-panel">
        <summary>渲染参数</summary>
        <div className="noise-panel__controls">
          <p className="device-profile">{deviceSummary}</p>
          <label className="noise-control noise-control--color">
            <span>人格颜色</span>
            <output>{personaColor.toUpperCase()}</output>
            <input
              type="color"
              value={personaColor}
              onChange={(event) => window.particleOrb?.setPersona({ color: event.target.value, transition: 1 })}
            />
          </label>
          {renderControlRows(renderRows)}
        </div>
      </details>}
      {showControls && <details className="noise-panel marker-panel" open>
        <summary>任务光点测试 · {markerStates.length}/{MAX_MARKERS}</summary>
        <div className="noise-panel__controls marker-panel__controls">
          <div className="marker-panel__actions">
            <button type="button" onClick={createThreeMarkerDemo}>生成 3 个任务</button>
            <button type="button" onClick={addTestMarker} disabled={markerStates.length >= MAX_MARKERS}>添加光点</button>
            <button type="button" onClick={() => window.particleOrb?.markers.clear()} disabled={!markerStates.length}>清空</button>
          </div>
          {markerStates.map((marker) => (
            <div className="marker-control" key={marker.id}>
              <span>{marker.id}</span>
              <input
                aria-label={`${marker.id} 颜色`}
                type="color"
                value={marker.color}
                onChange={(event) => window.particleOrb?.markers.set(marker.id, { color: event.target.value })}
              />
              <input
                aria-label={`${marker.id} 亮度`}
                type="range"
                min="0"
                max="4"
                step="0.1"
                value={marker.brightness}
                onChange={(event) => window.particleOrb?.markers.set(marker.id, { brightness: Number(event.target.value) })}
              />
              <button
                type="button"
                onClick={() => window.particleOrb?.markers.flash(marker.id, { intensity: 2.5, duration: 1 })}
              >
                闪一下
              </button>
              <button type="button" onClick={() => window.particleOrb?.markers.remove(marker.id)}>删除</button>
            </div>
          ))}
          {!markerStates.length && <p className="marker-panel__empty">点击“生成 3 个任务”观察外圈环绕与单点闪烁。</p>}
        </div>
      </details>}
    </div>
  )
}
