import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  createClientEvent,
  isAgent1ServerEvent,
  isAppWsEnvelope,
  type Agent1ClientEvent,
  type Agent1ServerEvent,
  type AppWsEnvelope,
  type ClientEventMap,
} from '../protocol/agent1'
import { agent1Runtime } from './runtime'
import { SessionTokenStore, type TokenStore } from './httpClient'

export type AppWsStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed'

type AppWsClientOptions = {
  url?: string
  tokens?: TokenStore
  heartbeatMs?: number
  maxReconnectDelayMs?: number
  webSocketFactory?: (url: string) => WebSocket
  onAuthRevoked?: (reason: string) => void
}

type EventListener = (event: Agent1ServerEvent | AppWsEnvelope) => void
type StatusListener = (status: AppWsStatus) => void

export function buildAppWsUrl(baseUrl: string, accessToken: string): string {
  const url = new URL(baseUrl)
  url.searchParams.set('access_token', accessToken)
  return url.toString()
}

export class Agent1AppWsClient {
  private socket: WebSocket | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private reconnectAttempt = 0
  private manuallyClosed = false
  private authRevoked = false
  private readonly eventListeners = new Set<EventListener>()
  private readonly statusListeners = new Set<StatusListener>()

  readonly url: string
  readonly tokens: TokenStore
  readonly heartbeatMs: number
  readonly maxReconnectDelayMs: number
  readonly webSocketFactory: (url: string) => WebSocket
  readonly onAuthRevoked?: (reason: string) => void
  status: AppWsStatus = 'idle'

  constructor(options: AppWsClientOptions = {}) {
    this.url = options.url ?? agent1Runtime.appWsUrl
    this.tokens = options.tokens ?? new SessionTokenStore()
    this.heartbeatMs = options.heartbeatMs ?? 30_000
    this.maxReconnectDelayMs = options.maxReconnectDelayMs ?? 8_000
    this.webSocketFactory = options.webSocketFactory ?? ((url) => new WebSocket(url))
    this.onAuthRevoked = options.onAuthRevoked
  }

  connect(): void {
    if (
      this.socket &&
      (this.socket.readyState === WebSocket.CONNECTING ||
        this.socket.readyState === WebSocket.OPEN)
    ) {
      return
    }
    const accessToken = this.tokens.getAccessToken()
    if (!accessToken) throw new Error('Agent1 AppWS requires an access token')

    this.manuallyClosed = false
    this.setStatus(this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting')
    const socket = this.webSocketFactory(buildAppWsUrl(this.url, accessToken))
    this.socket = socket

    socket.addEventListener('open', () => {
      if (socket !== this.socket) return
      this.reconnectAttempt = 0
      this.setStatus('open')
      this.startHeartbeat()
    })
    socket.addEventListener('message', (message) => this.handleMessage(message.data))
    socket.addEventListener('close', () => {
      if (socket !== this.socket) return
      this.stopHeartbeat()
      this.socket = null
      if (this.manuallyClosed || this.authRevoked) {
        this.setStatus('closed')
      } else {
        this.scheduleReconnect()
      }
    })
    socket.addEventListener('error', () => {
      // The close event owns retry scheduling and status transitions.
    })
  }

  disconnect(): void {
    this.manuallyClosed = true
    this.clearReconnectTimer()
    this.stopHeartbeat()
    this.socket?.close()
    this.socket = null
    this.setStatus('closed')
  }

  send<Name extends keyof ClientEventMap & string>(
    event: Name,
    data: ClientEventMap[Name],
    id = createMessageId(),
  ): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('Agent1 AppWS is not open')
    }
    const message = createClientEvent(event, data, id)
    this.socket.send(JSON.stringify(message satisfies Agent1ClientEvent))
  }

  subscribe(listener: EventListener): () => void {
    this.eventListeners.add(listener)
    return () => this.eventListeners.delete(listener)
  }

  subscribeStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener)
    listener(this.status)
    return () => this.statusListeners.delete(listener)
  }

  private handleMessage(raw: unknown): void {
    if (typeof raw !== 'string') return

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return
    }
    if (!isAppWsEnvelope(parsed)) return

    if (isAgent1ServerEvent(parsed) && parsed.event === SERVER_EVENTS.cloudEvent) {
      if (parsed.data?.type !== 'auth_session_revoked') {
        this.eventListeners.forEach((listener) => listener(parsed))
        return
      }
      const payload = parsed.data.payload
      const reason =
        payload && typeof payload.reason === 'string'
          ? payload.reason
          : 'auth_session_revoked'
      this.authRevoked = true
      this.tokens.clear()
      this.onAuthRevoked?.(reason)
      this.disconnect()
    }

    const event = isAgent1ServerEvent(parsed) ? parsed : parsed
    this.eventListeners.forEach((listener) => listener(event))
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.send(CLIENT_EVENTS.ping, undefined)
      }
    }, this.heartbeatMs)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    this.heartbeatTimer = null
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer()
    this.reconnectAttempt += 1
    this.setStatus('reconnecting')
    const baseDelay = Math.min(2 ** (this.reconnectAttempt - 1) * 1_000, this.maxReconnectDelayMs)
    const jitteredDelay = Math.round(baseDelay * (0.8 + Math.random() * 0.4))
    this.reconnectTimer = setTimeout(() => this.connect(), jitteredDelay)
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
  }

  private setStatus(status: AppWsStatus): void {
    this.status = status
    this.statusListeners.forEach((listener) => listener(status))
  }
}

function createMessageId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`
}
