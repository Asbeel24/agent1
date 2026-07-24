import type { ApiErrorPayload, AuthResult } from './contracts'
import { agent1Runtime } from './runtime'

const ACCESS_TOKEN_KEY = 'agent1.access_token'
const REFRESH_TOKEN_KEY = 'agent1.refresh_token'

export interface TokenStore {
  getAccessToken(): string | null
  getRefreshToken(): string | null
  setTokens(result: Pick<AuthResult, 'access_token' | 'refresh_token'>): void
  clear(): void
}

export class SessionTokenStore implements TokenStore {
  getAccessToken(): string | null {
    return (
      sessionStorage.getItem(ACCESS_TOKEN_KEY) ||
      import.meta.env.VITE_OPENTARS_ACCESS_TOKEN ||
      import.meta.env.VITE_AGENT1_ACCESS_TOKEN ||
      null
    )
  }

  getRefreshToken(): string | null {
    return (
      sessionStorage.getItem(REFRESH_TOKEN_KEY) ||
      import.meta.env.VITE_OPENTARS_REFRESH_TOKEN ||
      import.meta.env.VITE_AGENT1_REFRESH_TOKEN ||
      null
    )
  }

  setTokens(result: Pick<AuthResult, 'access_token' | 'refresh_token'>): void {
    sessionStorage.setItem(ACCESS_TOKEN_KEY, result.access_token)
    sessionStorage.setItem(REFRESH_TOKEN_KEY, result.refresh_token)
    window.dispatchEvent(new Event(TOKEN_CHANGE_EVENT))
  }

  clear(): void {
    sessionStorage.removeItem(ACCESS_TOKEN_KEY)
    sessionStorage.removeItem(REFRESH_TOKEN_KEY)
    window.dispatchEvent(new Event(TOKEN_CHANGE_EVENT))
  }

  subscribe(listener: () => void): () => void {
    window.addEventListener(TOKEN_CHANGE_EVENT, listener)
    return () => window.removeEventListener(TOKEN_CHANGE_EVENT, listener)
  }
}

const TOKEN_CHANGE_EVENT = 'opentars:tokens-changed'

export class Agent1ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'Agent1ApiError'
    this.status = status
    this.code = code
  }
}

type Agent1RequestOptions = RequestInit & {
  authenticated?: boolean
  retryAfterRefresh?: boolean
}

export class Agent1HttpClient {
  private refreshRequest: Promise<boolean> | null = null

  constructor(
    readonly baseUrl = agent1Runtime.httpBaseUrl,
    readonly tokens: TokenStore = new SessionTokenStore(),
    private readonly fetcher: typeof fetch = (...args) => fetch(...args),
  ) {}

  async request<T>(path: string, options: Agent1RequestOptions = {}): Promise<T> {
    const {
      authenticated = true,
      retryAfterRefresh = true,
      headers: inputHeaders,
      ...requestInit
    } = options
    const headers = new Headers(inputHeaders)
    headers.set('Accept', 'application/json')

    const accessToken = this.tokens.getAccessToken()
    if (authenticated && accessToken) {
      headers.set('Authorization', `Bearer ${accessToken}`)
    }

    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      ...requestInit,
      headers,
    })

    if (
      response.status === 401 &&
      authenticated &&
      retryAfterRefresh &&
      this.tokens.getRefreshToken() &&
      (await this.refreshTokens())
    ) {
      return this.request<T>(path, {
        ...options,
        retryAfterRefresh: false,
      })
    }

    if (!response.ok) throw await toApiError(response)
    if (response.status === 204) return undefined as T

    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.includes('application/json')) {
      return response.blob() as Promise<T>
    }
    return response.json() as Promise<T>
  }

  private async refreshTokens(): Promise<boolean> {
    if (this.refreshRequest) return this.refreshRequest
    const refreshToken = this.tokens.getRefreshToken()
    if (!refreshToken) return false

    this.refreshRequest = this.request<AuthResult>('/v1/auth/refresh', {
      method: 'POST',
      authenticated: false,
      retryAfterRefresh: false,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
      .then((result) => {
        this.tokens.setTokens(result)
        return true
      })
      .catch(() => {
        this.tokens.clear()
        return false
      })
      .finally(() => {
        this.refreshRequest = null
      })

    return this.refreshRequest
  }
}

async function toApiError(response: Response): Promise<Agent1ApiError> {
  let code = `http_${response.status}`
  let message = response.statusText || 'Agent1 API request failed'

  try {
    const payload = (await response.json()) as ApiErrorPayload
    if (typeof payload.error === 'string') {
      message = payload.error
    } else if (payload.error) {
      code = payload.error.code || code
      message = payload.error.message || message
    }
  } catch {
    // Preserve the HTTP fallback when the response is not JSON.
  }

  return new Agent1ApiError(response.status, code, message)
}

export const agent1Http = new Agent1HttpClient()
