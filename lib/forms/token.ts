import { SignJWT, jwtVerify } from 'jose'

export interface FormTokenPayload {
  formTemplateId: string
  clientId: string
  bookingId?: string
  salonId: string
}

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET is required')
  return new TextEncoder().encode(secret)
}

export async function generateFormToken(
  payload: FormTokenPayload,
  expiresIn = '72h'
): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(getJwtSecret())
}

export async function verifyFormToken(token: string): Promise<FormTokenPayload> {
  const { payload } = await jwtVerify(token, getJwtSecret())
  return payload as unknown as FormTokenPayload
}