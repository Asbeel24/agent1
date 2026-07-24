import { beforeEach, describe, expect, it } from 'vitest'
import {
  LOCAL_IDENTITY_STORAGE_KEY,
  clearLocalIdentity,
  createLocalIdentity,
  readLocalIdentity,
  saveLocalIdentity,
  scopedLocalStorageKey,
} from '../localIdentity'

describe('local identity', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('creates a stable local-only credential shape', () => {
    const identity = createLocalIdentity()

    expect(identity.schema_version).toBe(1)
    expect(identity.user_id).toMatch(/^local_/)
    expect(identity.email).toMatch(/^visitor-[a-f0-9]{12}@local\.agent1$/)
    expect(identity.password).toHaveLength(24)
    expect(Number.isNaN(Date.parse(identity.created_at))).toBe(false)
  })

  it('persists and restores the same identity across app mounts', () => {
    const identity = createLocalIdentity()
    saveLocalIdentity(identity)

    expect(readLocalIdentity()).toEqual(identity)
  })

  it('removes malformed local identity data', () => {
    window.localStorage.setItem(LOCAL_IDENTITY_STORAGE_KEY, '{"email":"broken"}')

    expect(readLocalIdentity()).toBeNull()
    expect(window.localStorage.getItem(LOCAL_IDENTITY_STORAGE_KEY)).toBeNull()
  })

  it('provides a stable namespace for future per-user data', () => {
    const identity = createLocalIdentity()

    expect(scopedLocalStorageKey(identity, 'meeting drafts')).toBe(
      `agent1.user.${identity.user_id}.meeting_drafts`,
    )
  })

  it('clears only the local identity record', () => {
    const identity = createLocalIdentity()
    saveLocalIdentity(identity)
    window.localStorage.setItem('unrelated', 'keep')

    clearLocalIdentity()

    expect(readLocalIdentity()).toBeNull()
    expect(window.localStorage.getItem('unrelated')).toBe('keep')
  })
})
