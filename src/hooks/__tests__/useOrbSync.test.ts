import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useOrbSync } from '../useOrbSync'

type OrbAPI = {
  setPersona: ReturnType<typeof vi.fn>
  setAudioLevel: ReturnType<typeof vi.fn>
  setPreset: ReturnType<typeof vi.fn>
}

function installOrbMock(api: OrbAPI) {
  ;(window as unknown as { particleOrb?: OrbAPI }).particleOrb = api
  return () => {
    delete (window as unknown as { particleOrb?: OrbAPI }).particleOrb
  }
}

describe('useOrbSync', () => {
  let api: OrbAPI
  let uninstall: () => void

  beforeEach(() => {
    api = {
      setPersona: vi.fn(),
      setAudioLevel: vi.fn(),
      setPreset: vi.fn(),
    }
    uninstall = installOrbMock(api)
  })

  afterEach(() => {
    uninstall()
    vi.restoreAllMocks()
  })

  it('applies idle state on initial render', () => {
    renderHook(() => useOrbSync('idle', 'idle'))

    expect(api.setPersona).toHaveBeenCalledWith({ color: '#ffffff', transition: 1.1 })
    expect(api.setAudioLevel).toHaveBeenCalledWith(0)
    expect(api.setPreset).toHaveBeenCalledWith('idle')
  })

  it('applies listening state when voiceState is listening', () => {
    renderHook(() => useOrbSync('listening', 'idle'))

    expect(api.setAudioLevel).toHaveBeenLastCalledWith(0.04)
    expect(api.setPreset).toHaveBeenLastCalledWith('listening')
  })

  it('updates orb when preset prop changes', () => {
    const { rerender } = renderHook(
      ({ preset }: { preset: 'idle' | 'thinking' }) => useOrbSync('idle', preset),
      { initialProps: { preset: 'idle' as 'idle' | 'thinking' } },
    )

    expect(api.setPreset).toHaveBeenLastCalledWith('idle')

    rerender({ preset: 'thinking' })

    expect(api.setPreset).toHaveBeenLastCalledWith('thinking')
  })

  it('re-applies state when the orb fires particle-orb:ready after mount', () => {
    renderHook(() => useOrbSync('idle', 'thinking'))

    api.setPersona.mockClear()
    api.setPreset.mockClear()

    act(() => {
      window.dispatchEvent(new Event('particle-orb:ready'))
    })

    expect(api.setPersona).toHaveBeenCalledWith({ color: '#ffffff', transition: 1.1 })
    expect(api.setPreset).toHaveBeenCalledWith('thinking')
  })

  it('is a no-op when particleOrb API is unavailable', () => {
    uninstall()

    expect(() => {
      renderHook(() => useOrbSync('idle', 'idle'))
    }).not.toThrow()
  })
})