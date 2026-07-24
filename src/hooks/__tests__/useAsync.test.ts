import { describe, it, expect, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useAsync } from '../useAsync'

describe('useAsync', () => {
  it('starts in loading state with null data', () => {
    const fn = vi.fn(() => new Promise<string>(() => {}))
    const { result } = renderHook(() => useAsync(fn, []))
    expect(result.current.loading).toBe(true)
    expect(result.current.data).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('resolves to data when the promise succeeds', async () => {
    const fn = vi.fn(async () => 'hello')
    const { result } = renderHook(() => useAsync(fn, []))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toBe('hello')
    expect(result.current.error).toBeNull()
  })

  it('captures the error when the promise rejects', async () => {
    const fn = vi.fn(async () => {
      throw new Error('boom')
    })
    const { result } = renderHook(() => useAsync(fn, []))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toBeNull()
    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.error?.message).toBe('boom')
  })

  it('wraps a non-Error rejection in an Error', async () => {
    const fn = vi.fn(async () => {
      // eslint-disable-next-line @typescript-eslint/no-throw-literal
      throw 'plain string'
    })
    const { result } = renderHook(() => useAsync(fn, []))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.error?.message).toBe('plain string')
  })

  it('refetch() triggers a re-run', async () => {
    let count = 0
    const fn = vi.fn(async () => ++count)
    const { result } = renderHook(() => useAsync(fn, []))
    await waitFor(() => expect(result.current.data).toBe(1))
    act(() => {
      result.current.refetch()
    })
    await waitFor(() => expect(result.current.data).toBe(2))
    expect(fn).toHaveBeenCalledTimes(2)
  })
})