import { SignJWT, jwtVerify } from 'jose'
import type { JWTPayload } from 'jose'

export interface SurveyTokenPayload {
  bookingId: string
  salonId: string
  typ: 'survey'
}

function getSecret() {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET is required')
  return new TextEncoder().encode(secret)
}

export async function generateSurveyToken(
  payload: Omit<SurveyTokenPayload, 'typ'>,
  expiresIn: string = '48h'
): Promise<string> {
  return new SignJWT({ ...payload, typ: 'survey' } as unknown as JWTPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(getSecret())
}

export async function verifySurveyToken(token: string): Promise<SurveyTokenPayload> {
  const { payload } = await jwtVerify(token, getSecret())
  if ((payload as unknown as SurveyTokenPayload).typ !== 'survey') {
    throw new Error('Invalid token type')
  }
  return payload as unknown as SurveyTokenPayload
}

