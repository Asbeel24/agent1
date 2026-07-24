import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { gsapMock } = vi.hoisted(() => ({
  gsapMock: {
    quickTo: vi.fn(),
    context: vi.fn(),
    timeline: vi.fn(),
  },
}))

vi.mock('gsap', () => ({
  gsap: gsapMock,
}))

import { useCustomCursor } from '../useCustomCursor'

function stubPointerCoarse(matches: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    ((query: string) => {
      if (query.includes('pointer: coarse')) {
        return {
          matches,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        } as unknown as MediaQueryList
      }
      return {
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      } as unknown as MediaQueryList
    }) as typeof window.matchMedia,
  )
}

describe('useCustomCursor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    gsapMock.quickTo.mockReturnValue(vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('bails on coarse pointer devices (touch)', () => {
    stubPointerCoarse(true)
    const root = document.createElement('div')
    const ref = { current: root }

    renderHook(() => useCustomCursor(ref))

    expect(gsapMock.quickTo).not.toHaveBeenCalled()
  })

  it('attaches pointermove listener when cursor and grid are present', () => {
    stubPointerCoarse(false)
    const cursor = document.createElement('div')
    cursor.className = 'field-cursor'
    const grid = document.createElement('div')
    grid.className = 'orb-grid'
    const root = document.createElement('div')
    root.append(cursor, grid)
    const ref = { current: root }

    const addSpy = vi.spyOn(window, 'addEventListener')

    renderHook(() => useCustomCursor(ref))

    expect(gsapMock.quickTo).toHaveBeenCalled()
    expect(addSpy).toHaveBeenCalledWith('pointermove', expect.any(Function))
  })

  it('still attaches listener when orb-grid is missing', () => {
    stubPointerCoarse(false)
    const cursor = document.createElement('div')
    cursor.className = 'field-cursor'
    const root = document.createElement('div')
    root.appendChild(cursor)
    const ref = { current: root }

    const addSpy = vi.spyOn(window, 'addEventListener')

    renderHook(() => useCustomCursor(ref))

    expect(addSpy).toHaveBeenCalledWith('pointermove', expect.any(Function))
  })
})