import { useCallback, useEffect, useState } from 'react'

export type AsyncState<T> = {
  data: T | null
  error: Error | null
  loading: boolean
}

export type UseAsyncResult<T> = AsyncState<T> & {
  refetch: () => void
}

export function useAsync<T>(
  fn: () => Promise<T>,
  deps: ReadonlyArray<unknown> = [],
): UseAsyncResult<T> {
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    error: null,
    loading: true,
  })

  const run = useCallback(() => {
    let cancelled = false
    setState((prev) => ({ ...prev, loading: true }))
    fn()
      .then((data) => {
        if (!cancelled) {
          setState({ data, error: null, loading: false })
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          const err =
            error instanceof Error ? error : new Error(String(error))
          setState({ data: null, error: err, loading: false })
        }
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    return run()
  }, [run])

  return { ...state, refetch: run }
}