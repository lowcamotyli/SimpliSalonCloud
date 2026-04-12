import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

const ENCRYPTION_VERSION = 'v1'
const KEY_HEX_LENGTH = 64
const KEY_BYTES = 32
const IV_BYTES = 12
const AUTH_TAG_BYTES = 16

function getEncryptionKey(): Buffer {
  const raw = process.env.BOOKSY_TOKEN_ENCRYPTION_KEY

  if (!raw) {
    throw new Error('BOOKSY_TOKEN_ENCRYPTION_KEY is required and must be a 32-byte hex key')
  }

  const normalized = raw.trim()

  if (normalized.length !== KEY_HEX_LENGTH || !/^[a-fA-F0-9]{64}$/.test(normalized)) {
    throw new Error('BOOKSY_TOKEN_ENCRYPTION_KEY is malformed: expected exactly 64 hex characters (32 bytes)')
  }

  const key = Buffer.from(normalized, 'hex')

  if (key.length !== KEY_BYTES) {
    throw new Error('BOOKSY_TOKEN_ENCRYPTION_KEY is malformed: decoded key length must be exactly 32 bytes')
  }

  return key
}

function parseEncryptedPayload(encrypted: string): [string, string, string, string] {
  if (!encrypted || typeof encrypted !== 'string') {
    throw new Error('Encrypted Booksy token must be a non-empty string')
  }

  const parts = encrypted.split(':')

  if (parts.length !== 4) {
    throw new Error('Invalid encrypted Booksy token format')
  }

  const [version, ivBase64, authTagBase64, ciphertextBase64] = parts

  if (version !== ENCRYPTION_VERSION) {
    throw new Error(`Unsupported encrypted Booksy token version: ${version}`)
  }

  if (!ivBase64 || !authTagBase64 || !ciphertextBase64) {
    throw new Error('Invalid encrypted Booksy token payload components')
  }

  return [version, ivBase64, authTagBase64, ciphertextBase64]
}

export function encrypt(token: string): string {
  if (typeof token !== 'string' || token.length === 0) {
    throw new Error('Booksy token to encrypt must be a non-empty string')
  }

  const key = getEncryptionKey()
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const tokenBuffer = Buffer.from(token, 'utf8')

  try {
    const ciphertext = Buffer.concat([cipher.update(tokenBuffer), cipher.final()])
    const authTag = cipher.getAuthTag()

    return `${ENCRYPTION_VERSION}:${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext.toString('base64')}`
  } finally {
    tokenBuffer.fill(0)
    key.fill(0)
  }
}

export function decrypt(encrypted: string): string {
  const [, ivBase64, authTagBase64, ciphertextBase64] = parseEncryptedPayload(encrypted)

  const iv = Buffer.from(ivBase64, 'base64')
  const authTag = Buffer.from(authTagBase64, 'base64')
  const ciphertext = Buffer.from(ciphertextBase64, 'base64')

  if (iv.length !== IV_BYTES) {
    throw new Error('Invalid IV length in encrypted Booksy token')
  }

  if (authTag.length !== AUTH_TAG_BYTES) {
    throw new Error('Invalid auth tag length in encrypted Booksy token')
  }

  const key = getEncryptionKey()
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)

  let decryptedBuffer: Buffer | undefined

  try {
    decryptedBuffer = Buffer.concat([decipher.update(ciphertext), decipher.final()])
    return decryptedBuffer.toString('utf8')
  } catch {
    throw new Error('Failed to decrypt Booksy token: authentication failed')
  } finally {
    key.fill(0)
    iv.fill(0)
    authTag.fill(0)
    ciphertext.fill(0)
    decryptedBuffer?.fill(0)
  }
}

export async function getDecryptedTokens(accountId: string, supabase: SupabaseClient): Promise<{ accessToken: string; refreshToken: string }> {
  if (!accountId || typeof accountId !== 'string') {
    throw new Error('accountId is required to load Booksy Gmail tokens')
  }

  const { data, error } = await (supabase
    .from('booksy_gmail_accounts') as any)
    .select('encrypted_access_token, encrypted_refresh_token')
    .eq('id', accountId)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to load Booksy Gmail tokens: ${error.message}`)
  }

  if (!data) {
    throw new Error(`Booksy Gmail account not found: ${accountId}`)
  }

  const accessToken = decrypt(data.encrypted_access_token)
  const refreshToken = decrypt(data.encrypted_refresh_token)

  return { accessToken, refreshToken }
}
