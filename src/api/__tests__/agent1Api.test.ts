import { describe, expect, it, vi } from 'vitest'
import { Agent1Api } from '../agent1Api'
import type { Agent1HttpClient } from '../httpClient'

function createApi() {
  const request = vi.fn().mockResolvedValue({})
  const http = { request, tokens: {} } as unknown as Agent1HttpClient
  return { api: new Agent1Api(http), request }
}

describe('Agent1Api OpenTars contract', () => {
  it('uses the current authenticated session endpoint', async () => {
    const { api, request } = createApi()
    await api.getMe()
    expect(request).toHaveBeenCalledWith('/v1/me')
  })

  it('uses OpenTars meeting upload idempotency headers', async () => {
    const { api, request } = createApi()
    const input = {
      channels: 1,
      content_type: 'audio/wav',
      duration_ms: 12_000,
      file_sha256: 'sha256',
      file_size: 32_000,
      format: 'wav',
      sample_rate: 16_000,
    }
    await api.initializeMeetingUpload(input, 'upload-key')
    expect(request).toHaveBeenCalledWith('/v1/meeting-uploads', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'upload-key',
      },
      body: JSON.stringify(input),
    })
  })

  it('registers verified uploads with a checksum idempotency key', async () => {
    const { api, request } = createApi()
    const input = { asset_ref: 'meeting/uploads/recording.wav', file_sha256: 'checksum' }
    await api.createMeeting(input)
    expect(request).toHaveBeenCalledWith('/v1/meetings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'checksum',
      },
      body: JSON.stringify(input),
    })
  })

  it('keeps public meeting shares unauthenticated', async () => {
    const { api, request } = createApi()
    await api.getPublicMeetingShare('share / token')
    expect(request).toHaveBeenCalledWith(
      '/v1/public/meeting-shares/share%20%2F%20token',
      { authenticated: false },
    )
  })

  it('uses v1 routes for persona publication and speaker aliases', async () => {
    const { api, request } = createApi()
    await api.publishPersonaTwin()
    await api.unpublishPersonaTwin()
    await api.updateMeetingSpeakerAliases('meeting/1', { speaker_1: 'Ada' })

    expect(request).toHaveBeenNthCalledWith(1, '/v1/persona-twin/publish', { method: 'POST' })
    expect(request).toHaveBeenNthCalledWith(2, '/v1/persona-twin/unpublish', { method: 'POST' })
    expect(request).toHaveBeenNthCalledWith(
      3,
      '/v1/meetings/meeting%2F1/speaker-aliases',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aliases: { speaker_1: 'Ada' } }),
      },
    )
  })
})
