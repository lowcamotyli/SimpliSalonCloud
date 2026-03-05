import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const TAG_LENGTH = 16

function getEncryptionKey(): Buffer {
  const raw = process.env.FORMS_ENCRYPTION_KEY

  if (!raw) {
    throw new Error('FORMS_ENCRYPTION_KEY is required for medical form encryption')
  }

  const trimmed = raw.trim()

  if (/^[a-fA-F0-9]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, 'hex')
  }

  try {
    const b64 = Buffer.from(trimmed, 'base64')
    if (b64.length === 32) return b64
  } catch {
    // ignore
  }

  if (Buffer.byteLength(trimmed, 'utf8') === 32) {
    return Buffer.from(trimmed, 'utf8')
  }

  throw new Error('FORMS_ENCRYPTION_KEY must be a 64-char hex string, 32-byte base64, or exactly 32-byte UTF-8 string')
}

export interface EncryptedAnswers {
  encrypted: Buffer
  iv: Buffer
  tag: Buffer
}

export function encryptAnswers(plaintext: object): EncryptedAnswers {
  const key = getEncryptionKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  const json = JSON.stringify(plaintext)
  const encrypted = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return { encrypted, iv, tag }
}

export function decryptAnswers(encrypted: Buffer, iv: Buffer, tag: Buffer): object {
  if (iv.length !== IV_LENGTH) {
    throw new Error('Invalid IV length')
  }

  if (tag.length !== TAG_LENGTH) {
    throw new Error('Invalid auth tag length')
  }

  const key = getEncryptionKey()
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)

  try {
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
    return JSON.parse(decrypted.toString('utf8'))
  } catch {
    throw new Error('Failed to decrypt form answers: authentication failed')
  }
}