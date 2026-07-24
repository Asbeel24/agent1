import { describe, expect, it, vi } from 'vitest'
import { Agent1ApiError, Agent1HttpClient, type TokenStore } from '../httpClient'

class MemoryTokenStore implements TokenStore {
  accessToken: string | null = 'expired'
  refreshToken: string | null = 'refresh-1'

  getAccessToken() {
    return this.accessToken
  }

  getRefreshToken() {
    return this.refreshToken
  }

  setTokens(result: { access_token: string; refresh_token: string }) {
    this.accessToken = result.access_token
    this.refreshToken = result.refresh_token
  }

  clear() {
    this.accessToken = null
    this.refreshToken = null
  }
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('Agent1HttpClient', () => {
  it('refreshes both tokens and retries one unauthorized request', async () => {
    const tokens = new MemoryTokenStore()
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ error: { code: 'unauthorized', message: 'expired' } }, 401))
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: 'access-2',
          refresh_token: 'refresh-2',
          user: {},
          device: {},
          auth_session: {},
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
    const client = new Agent1HttpClient('https://api.example.test', tokens, fetcher)

    await expect(client.request('/v1/me')).resolves.toEqual({ ok: true })
    expect(tokens.accessToken).toBe('access-2')
    expect(tokens.refreshToken).toBe('refresh-2')
    expect(fetcher).toHaveBeenCalledTimes(3)

    const retryHeaders = new Headers(fetcher.mock.calls[2][1]?.headers)
    expect(retryHeaders.get('Authorization')).toBe('Bearer access-2')
  })

  it('supports the legacy string error payload', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ error: 'invalid meeting settings request' }, 400))
    const client = new Agent1HttpClient('https://api.example.test', new MemoryTokenStore(), fetcher)

    await expect(client.request('/v1/meeting-settings')).rejects.toEqual(
      new Agent1ApiError(400, 'http_400', 'invalid meeting settings request'),
    )
  })

  it('does not send authorization for public endpoints', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ status: 'ok' }))
    const client = new Agent1HttpClient('https://api.example.test', new MemoryTokenStore(), fetcher)

    await client.request('/healthz', { authenticated: false })
    const headers = new Headers(fetcher.mock.calls[0][1]?.headers)
    expect(headers.has('Authorization')).toBe(false)
  })
})
