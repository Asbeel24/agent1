import { describe, expect, it } from 'vitest'
import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  createClientEvent,
  isAgent1ServerEvent,
  isAppWsEnvelope,
} from '../agent1'

describe('Agent1 AppWS protocol', () => {
  it('creates the documented event envelope and omits empty data', () => {
    expect(createClientEvent(CLIENT_EVENTS.ping, undefined, 'message-1')).toEqual({
      id: 'message-1',
      event: 'client.ping',
    })
  })

  it('accepts unknown events as envelopes without treating them as known events', () => {
    const futureEvent = {
      id: 'server-message',
      event: 'server.future.event',
      data: { added_later: true },
    }
    expect(isAppWsEnvelope(futureEvent)).toBe(true)
    expect(isAgent1ServerEvent(futureEvent)).toBe(false)
  })

  it('validates known event payloads', () => {
    expect(
      isAgent1ServerEvent({
        event: SERVER_EVENTS.connected,
        data: { session_id: 'session-1' },
      }),
    ).toBe(true)
    expect(
      isAgent1ServerEvent({
        event: SERVER_EVENTS.responseAudio,
        data: { format: 'pcm', sample_rate: 24_000, data: 'AA==' },
      }),
    ).toBe(true)
    expect(
      isAgent1ServerEvent({
        event: SERVER_EVENTS.responseAudio,
        data: { format: 'pcm', data: 'AA==' },
      }),
    ).toBe(false)
  })

  it('requires null payloads for speech boundary events', () => {
    expect(
      isAgent1ServerEvent({
        event: SERVER_EVENTS.speechStarted,
        data: null,
      }),
    ).toBe(true)
    expect(
      isAgent1ServerEvent({
        event: SERVER_EVENTS.speechStarted,
        data: {},
      }),
    ).toBe(false)
  })
})
