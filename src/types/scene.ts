import type { OrbMode } from '../components/ParticleOrb'

export type SceneId = 'translate' | 'home' | 'meeting' | 'personas'

export type OrbPreset = 'idle' | 'listening' | 'thinking'

export type Scene = {
  id: SceneId
  order: string
  label: string
  description: string
  signal: string
  color: string
  orbMode: OrbMode
  preset: OrbPreset
}