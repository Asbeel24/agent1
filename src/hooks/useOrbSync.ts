import { useEffect } from 'react'
import type { OrbPreset, VoiceState } from '../types'

declare global {
  interface WindowEventMap {
    'particle-orb:ready': Event
  }
}

export function useOrbSync(voiceState: VoiceState, preset: OrbPreset) {
  useEffect(() => {
    const syncOrbState = () => {
      const api = window.particleOrb
      if (!api) return

      api.setPersona({ color: '#ffffff', transition: 1.1 })
      api.setAudioLevel(voiceState === 'listening' ? 0.04 : 0)
      api.setPreset(voiceState === 'listening' ? 'listening' : preset)
    }

    syncOrbState()
    window.addEventListener('particle-orb:ready', syncOrbState)
    return () => window.removeEventListener('particle-orb:ready', syncOrbState)
  }, [voiceState, preset])
}