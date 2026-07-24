import { describe, expect, it } from 'vitest'
import { buildAppWsUrl } from '../appWsClient'

describe('buildAppWsUrl', () => {
  it('URL-encodes browser WebSocket access tokens', () => {
    expect(buildAppWsUrl('wss://api.example.test/ws', 'token +/=?')).toBe(
      'wss://api.example.test/ws?access_token=token+%2B%2F%3D%3F',
    )
  })

  it('preserves existing query parameters', () => {
    expect(buildAppWsUrl('wss://api.example.test/ws?region=cn', 'token')).toBe(
      'wss://api.example.test/ws?region=cn&access_token=token',
    )
  })
})
