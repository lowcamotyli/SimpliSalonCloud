import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'

const ENCRYPTION_VERSION = 'v1'
const IV_LENGTH = 12

function getEncryptionKey(): Buffer {
  const raw = process.env.MESSAGING_ENCRYPTION_KEY

  if (!raw) {
    throw new Error('MESSAGING_ENCRYPTION_KEY is required for messaging credential encryption')
  }

  const trimmed = raw.trim()

  // Prefer explicit binary-safe formats.
  if (/^[a-fA-F0-9]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, 'hex')
  }

  try {
    const b64 = Buffer.from(trimmed, 'base64')
    if (b64.length === 32) {
      return b64
    }
  } catch {
    // ignore, fallback below
  }

  if (Buffer.byteLength(trimmed, 'utf8') === 32) {
    return Buffer.from(trimmed, 'utf8')
  }

  // Last-resort deterministic derivation for operator convenience.
  // Keeps behavior stable while still enforcing a non-empty key.
  return createHash('sha256').update(trimmed).digest()
}

function validatePayload(payload: string): [string, string, string, string] {
  if (!payload || typeof payload !== 'string') {
    throw new Error('Encrypted payload must be a non-empty string')
  }

  const parts = payload.split(':')
  if (parts.length !== 4) {
    throw new Error('Invalid encrypted payload format')
  }

  const [version, ivB64, tagB64, dataB64] = parts
  if (version !== ENCRYPTION_VERSION) {
    throw new Error(`Unsupported encrypted payload version: ${version}`)
  }

  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Invalid encrypted payload components')
  }

  return [version, ivB64, tagB64, dataB64]
}

export function encryptSecret(plainText: string): string {
  if (typeof plainText !== 'string' || plainText.length === 0) {
    throw new Error('Secret to encrypt must be a non-empty string')
  }

  const key = getEncryptionKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv('aes-256-gcm', key, iv)

  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return `${ENCRYPTION_VERSION}:${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`
}

export function decryptSecret(payload: string): string {
  const [, ivB64, tagB64, dataB64] = validatePayload(payload)

  const iv = Buffer.from(ivB64, 'base64')
  const authTag = Buffer.from(tagB64, 'base64')
  const encrypted = Buffer.from(dataB64, 'base64')

  if (iv.length !== IV_LENGTH) {
    throw new Error('Invalid IV length in encrypted payload')
  }

  if (authTag.length !== 16) {
    throw new Error('Invalid auth tag length in encrypted payload')
  }

  const key = getEncryptionKey()
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)

  try {
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
    return decrypted.toString('utf8')
  } catch {
    throw new Error('Failed to decrypt secret: authentication failed')
  }
}

export function isEncryptedPayload(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(`${ENCRYPTION_VERSION}:`)
}

