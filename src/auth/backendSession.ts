import { Agent1ApiError, agent1Api, agent1Runtime, getDefaultDeviceInput } from '../api'
import type { Agent1Api } from '../api/agent1Api'
import type { AuthResult } from '../api/contracts'
import type { LocalIdentity } from './localIdentity'

const pendingSessions = new Map<string, Promise<AuthResult | null>>()

export function authenticateLocalIdentity(
  identity: LocalIdentity,
  api: Agent1Api = agent1Api,
  liveEnabled = agent1Runtime.liveApiEnabled,
): Promise<AuthResult | null> {
  if (!liveEnabled) return Promise.resolve(null)

  const pending = pendingSessions.get(identity.user_id)
  if (pending) return pending

  const request = restoreOrCreateSession(identity, api).finally(() => {
    pendingSessions.delete(identity.user_id)
  })
  pendingSessions.set(identity.user_id, request)
  return request
}

async function restoreOrCreateSession(
  identity: LocalIdentity,
  api: Agent1Api,
): Promise<AuthResult | null> {
  if (api.http.tokens.getAccessToken()) {
    try {
      await api.getMe()
      return null
    } catch (error) {
      if (!isAuthenticationError(error)) throw error
    }
  }

  try {
    return await api.login(identity.email, identity.password, getDefaultDeviceInput())
  } catch (error) {
    if (!isInvalidCredentials(error)) throw error
  }

  try {
    return await api.register(
      identity.email,
      identity.password,
      displayNameFor(identity),
      getDefaultDeviceInput(),
    )
  } catch (error) {
    if (!isDuplicateEmail(error)) throw error
    return api.login(identity.email, identity.password, getDefaultDeviceInput())
  }
}

function displayNameFor(identity: LocalIdentity): string {
  const token = identity.email.match(/^visitor-([a-f0-9]+)/)?.[1]?.slice(0, 6)
  return token ? `Visitor ${token.toUpperCase()}` : 'Agent1 Visitor'
}

function isAuthenticationError(error: unknown): boolean {
  return (
    error instanceof Agent1ApiError &&
    (error.status === 401 ||
      error.code === 'invalid_token' ||
      error.code === 'session_revoked')
  )
}

function isInvalidCredentials(error: unknown): boolean {
  return (
    error instanceof Agent1ApiError &&
    (error.status === 401 || error.code === 'invalid_credentials')
  )
}

function isDuplicateEmail(error: unknown): boolean {
  return (
    error instanceof Agent1ApiError &&
    (error.status === 409 || error.code === 'duplicate_email')
  )
}
