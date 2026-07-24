import { describe, it, expect } from 'vitest'
import { sendMessage, type SendMessageInput } from '../chat'
import { ServiceError } from '../types'

describe('sendMessage', () => {
  it('echoes the input text with persona label', async () => {
    const input: SendMessageInput = { personaId: 'joi', text: 'hello' }
    const message = await sendMessage(input)
    expect(message.role).toBe('assistant')
    expect(message.text).toBe('[mock Joi] hello')
    expect(message.id).toBeTruthy()
    expect(typeof message.createdAt).toBe('number')
  })

  it('throws ServiceError for empty input', async () => {
    await expect(sendMessage({ personaId: 'joi', text: '' })).rejects.toBeInstanceOf(
      ServiceError,
    )
  })

  it('simulates latency (≥180ms)', async () => {
    const start = Date.now()
    await sendMessage({ personaId: 'joi', text: 'ping' })
    const elapsed = Date.now() - start
    expect(elapsed).toBeGreaterThanOrEqual(180)
  })
})