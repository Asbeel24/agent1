import type { Message } from '../types/chat'
import { mockPersonas } from './mock'
import {
  MOCK_CHAT_LATENCY_MS,
  ServiceError,
  simulateLatency,
} from './types'

export type SendMessageInput = {
  personaId: string
  text: string
}

export async function sendMessage(input: SendMessageInput): Promise<Message> {
  if (!input.text.trim()) {
    throw new ServiceError('Empty message', 'EMPTY_INPUT')
  }

  await simulateLatency(MOCK_CHAT_LATENCY_MS)
  const persona = mockPersonas.find((p) => p.id === input.personaId)
  return {
    id:
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role: 'assistant',
    text: `[mock ${persona?.name ?? 'unknown'}] ${input.text}`,
    createdAt: Date.now(),
  }
}