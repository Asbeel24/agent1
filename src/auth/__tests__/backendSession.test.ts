import { describe, expect, it, vi } from 'vitest'
import type { Agent1Api } from '../../api/agent1Api'
import { Agent1ApiError } from '../../api/httpClient'
import type { AuthResult } from '../../api/contracts'
import { authenticateLocalIdentity } from '../backendSession'
import { createLocalIdentity } from '../localIdentity'

function authResult(): AuthResult {
  return {
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    user: {
      id: 'user-1',
      display_name: 'Visitor',
      locale: 'zh-CN',
      timezone: 'Asia/Shanghai',
    },
    device: {
      id: 'device-1',
      platform_family: 'web',
      platform: 'web',
      installation_id: 'installation-1',
      device_name: 'test',
      app_version: '1.0.0-b',
    },
    auth_session: {
      id: 'session-1',
      platform_family: 'web',
      status: 'active',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    },
  }
}

function createApi(options: {
  accessToken?: string | null
  login?: ReturnType<typeof vi.fn>
  register?: ReturnType<typeof vi.fn>
  getMe?: ReturnType<typeof vi.fn>
}) {
  return {
    http: {
      tokens: {
        getAccessToken: vi.fn(() => options.accessToken ?? null),
      },
    },
    login: options.login ?? vi.fn(),
    register: options.register ?? vi.fn(),
    getMe: options.getMe ?? vi.fn(),
  } as unknown as Agent1Api
}

describe('authenticateLocalIdentity', () => {
  it('keeps a valid existing backend session', async () => {
    const getMe = vi.fn().mockResolvedValue({})
    const login = vi.fn()
    const api = createApi({ accessToken: 'existing-token', getMe, login })

    await authenticateLocalIdentity(createLocalIdentity(), api, true)

    expect(getMe).toHaveBeenCalledOnce()
    expect(login).not.toHaveBeenCalled()
  })

  it('logs in a previously registered local identity', async () => {
    const result = authResult()
    const login = vi.fn().mockResolvedValue(result)
    const register = vi.fn()
    const api = createApi({ login, register })

    await expect(
      authenticateLocalIdentity(createLocalIdentity(), api, true),
    ).resolves.toBe(result)

    expect(login).toHaveBeenCalledOnce()
    expect(register).not.toHaveBeenCalled()
  })

  it('registers a new local identity after invalid credentials', async () => {
    const result = authResult()
    const login = vi
      .fn()
      .mockRejectedValue(new Agent1ApiError(401, 'invalid_credentials', 'invalid'))
    const register = vi.fn().mockResolvedValue(result)
    const api = createApi({ login, register })
    const identity = createLocalIdentity()

    await expect(
      authenticateLocalIdentity(identity, api, true),
    ).resolves.toBe(result)

    expect(register).toHaveBeenCalledWith(
      identity.email,
      identity.password,
      expect.stringMatching(/^Visitor /),
      expect.objectContaining({
        platform_family: 'web',
        installation_id: expect.any(String),
      }),
    )
  })

  it('recovers a duplicate registration race by logging in again', async () => {
    const result = authResult()
    const login = vi
      .fn()
      .mockRejectedValueOnce(
        new Agent1ApiError(401, 'invalid_credentials', 'invalid'),
      )
      .mockResolvedValueOnce(result)
    const register = vi
      .fn()
      .mockRejectedValue(
        new Agent1ApiError(409, 'duplicate_email', 'already registered'),
      )
    const api = createApi({ login, register })

    await expect(
      authenticateLocalIdentity(createLocalIdentity(), api, true),
    ).resolves.toBe(result)

    expect(login).toHaveBeenCalledTimes(2)
  })
})
