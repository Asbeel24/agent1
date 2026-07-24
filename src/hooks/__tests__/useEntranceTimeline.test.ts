import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { gsapMock } = vi.hoisted(() => ({
  gsapMock: {
    context: vi.fn(),
    timeline: vi.fn(),
    killTweensOf: vi.fn(),
    set: vi.fn(),
    quickTo: vi.fn(),
  },
}))

vi.mock('gsap', () => ({
  gsap: gsapMock,
}))

import { useEntranceTimeline } from '../useEntranceTimeline'

type MatchMediaStub = {
  matches: boolean
  addEventListener: ReturnType<typeof vi.fn>
  removeEventListener: ReturnType<typeof vi.fn>
}

function stubMatchMedia(reduceMotion: boolean): MatchMediaStub {
  const compactStub: MatchMediaStub = {
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }
  const reduceStub: MatchMediaStub = {
    matches: reduceMotion,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }
  vi.spyOn(window, 'matchMedia').mockImplementation(
    ((query: string) => {
      if (query.includes('prefers-reduced-motion')) {
        return reduceStub as unknown as MediaQueryList
      }
      if (query.includes('max-width')) {
        return compactStub as unknown as MediaQueryList
      }
      return {
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      } as unknown as MediaQueryList
    }) as typeof window.matchMedia,
  )
  return compactStub
}

describe('useEntranceTimeline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const context = { revert: vi.fn() }
    const tl = { from: vi.fn().mockReturnThis(), to: vi.fn().mockReturnThis() }
    gsapMock.context.mockImplementation((cb: () => void) => {
      cb()
      return context
    })
    gsapMock.timeline.mockReturnValue(tl)
    gsapMock.quickTo.mockReturnValue(vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('skips timeline entirely under prefers-reduced-motion', () => {
    stubMatchMedia(true)
    const root = document.createElement('div')
    const ref = { current: root }

    renderHook(() => useEntranceTimeline(ref))

    expect(gsapMock.timeline).not.toHaveBeenCalled()
  })

  it('builds entrance timeline and listens for compact layout changes', () => {
    const stub = stubMatchMedia(false)
    const orb = document.createElement('div')
    orb.className = 'orb-stage'
    const root = document.createElement('div')
    root.appendChild(orb)
    const ref = { current: root }

    vi.spyOn(root, 'querySelector').mockImplementation((selector: string) => {
      if (selector === '.orb-stage') return orb
      return null
    })

    renderHook(() => useEntranceTimeline(ref))

    expect(gsapMock.timeline).toHaveBeenCalled()
    expect(stub.addEventListener).toHaveBeenCalledWith('change', expect.any(Function))
  })

  it('clears orb transform when compact layout changes', () => {
    const stub = stubMatchMedia(false)
    const orb = document.createElement('div')
    orb.className = 'orb-stage'
    const root = document.createElement('div')
    root.appendChild(orb)
    const ref = { current: root }

    vi.spyOn(root, 'querySelector').mockImplementation((selector: string) => {
      if (selector === '.orb-stage') return orb
      return null
    })

    renderHook(() => useEntranceTimeline(ref))

    const [, handler] = stub.addEventListener.mock.calls[0] ?? []
    ;(handler as () => void)()

    expect(gsapMock.killTweensOf).toHaveBeenCalledWith(orb)
    expect(gsapMock.set).toHaveBeenCalledWith(orb, { clearProps: 'transform,translate' })
  })
})