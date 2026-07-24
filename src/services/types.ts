export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  meta?: {
    total?: number
    page?: number
    limit?: number
  }
}

export class ServiceError extends Error {
  readonly code: string

  constructor(message: string, code: string) {
    super(message)
    this.name = 'ServiceError'
    this.code = code
  }
}

const MOCK_LATENCY_MS = 150
export const MOCK_CHAT_LATENCY_MS = 200

export function simulateLatency(ms: number = MOCK_LATENCY_MS): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}