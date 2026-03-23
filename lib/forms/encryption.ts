import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { logHealthDataAccess } from '@/lib/audit/health-access-log'

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

// Single-field encryption: returns base64(iv[12] + tag[16] + ciphertext)
export function encryptField(plaintext: string): string {
  const key = getEncryptionKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted]).toString('base64')
}

export interface DecryptAuditContext {
  salonId: string
  userId: string
  role: string
  resourceType: 'form_response' | 'treatment_record'
  resourceId: string
  clientId?: string
  dataCategory: 'health' | 'sensitive_health'
}

export function decryptField(packed: string, auditContext?: DecryptAuditContext): string {
  const buf = Buffer.from(packed, 'base64')
  const iv = buf.subarray(0, IV_LENGTH)
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH)
  const ciphertext = buf.subarray(IV_LENGTH + TAG_LENGTH)
  const key = getEncryptionKey()
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  try {
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
    const result = decrypted.toString('utf8')
    if (auditContext) {
      // Fire-and-forget — log failure must not break the main request
      logHealthDataAccess({
        salonId: auditContext.salonId,
        accessedBy: auditContext.userId,
        accessedByRole: auditContext.role,
        resourceType: auditContext.resourceType,
        resourceId: auditContext.resourceId,
        clientId: auditContext.clientId,
        dataCategory: auditContext.dataCategory,
        action: 'decrypt',
      }).catch(console.error)
    }
    return result
  } catch {
    throw new Error('Failed to decrypt field: authentication failed')
  }
}