export const LOCAL_IDENTITY_STORAGE_KEY = 'agent1.local_identity.v1'

const PASSWORD_ALPHABET =
  'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'

export type LocalIdentity = {
  schema_version: 1
  user_id: string
  email: string
  password: string
  created_at: string
}

export function createLocalIdentity(): LocalIdentity {
  const emailToken = randomHex(6)
  return {
    schema_version: 1,
    user_id: `local_${randomUuid()}`,
    email: `visitor-${emailToken}@local.agent1`,
    password: randomString(24),
    created_at: new Date().toISOString(),
  }
}

export function readLocalIdentity(storage: Storage = window.localStorage): LocalIdentity | null {
  const raw = storage.getItem(LOCAL_IDENTITY_STORAGE_KEY)
  if (!raw) return null

  try {
    const identity = JSON.parse(raw) as unknown
    if (isLocalIdentity(identity)) return identity
  } catch {
    // Invalid local data is treated as an empty identity slot.
  }

  storage.removeItem(LOCAL_IDENTITY_STORAGE_KEY)
  return null
}

export function saveLocalIdentity(
  identity: LocalIdentity,
  storage: Storage = window.localStorage,
): void {
  storage.setItem(LOCAL_IDENTITY_STORAGE_KEY, JSON.stringify(identity))
}

export function clearLocalIdentity(storage: Storage = window.localStorage): void {
  storage.removeItem(LOCAL_IDENTITY_STORAGE_KEY)
}

export function scopedLocalStorageKey(identity: Pick<LocalIdentity, 'user_id'>, key: string): string {
  const normalizedKey = key.trim().replace(/\s+/g, '_')
  if (!normalizedKey) throw new Error('A local identity storage key is required')
  return `agent1.user.${identity.user_id}.${normalizedKey}`
}

function isLocalIdentity(value: unknown): value is LocalIdentity {
  if (!value || typeof value !== 'object') return false
  const identity = value as Record<string, unknown>
  return (
    identity.schema_version === 1 &&
    typeof identity.user_id === 'string' &&
    identity.user_id.startsWith('local_') &&
    typeof identity.email === 'string' &&
    identity.email.endsWith('@local.agent1') &&
    typeof identity.password === 'string' &&
    identity.password.length >= 20 &&
    typeof identity.created_at === 'string'
  )
}

function randomUuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `${randomHex(8)}-${randomHex(4)}-${randomHex(4)}-${randomHex(4)}-${randomHex(12)}`
}

function randomHex(byteLength: number): string {
  return Array.from(randomBytes(byteLength), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function randomString(length: number): string {
  const bytes = randomBytes(length)
  return Array.from(bytes, (byte) => PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length]).join('')
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  if (typeof crypto.getRandomValues === 'function') return crypto.getRandomValues(bytes)

  for (let index = 0; index < length; index += 1) {
    bytes[index] = Math.floor(Math.random() * 256)
  }
  return bytes
}
