import { SignJWT, jwtVerify } from 'jose'

export type BookingConfirmTokenPayload = {
  bookingId: string
  salonId: string
  typ: 'booking-confirm'
}

function getSecret() {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET is required')
  return new TextEncoder().encode(secret)
}

export async function generateBookingConfirmToken(
  payload: Omit<BookingConfirmTokenPayload, 'typ'>,
  expiresIn: string = '7d'
): Promise<string> {
  return new SignJWT({ ...payload, typ: 'booking-confirm' } as unknown as import('jose').JWTPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(getSecret())
}

export async function verifyBookingConfirmToken(token: string): Promise<BookingConfirmTokenPayload> {
  const { payload } = await jwtVerify(token, getSecret())
  if ((payload as unknown as BookingConfirmTokenPayload).typ !== 'booking-confirm') {
    throw new Error('Invalid token type')
  }
  return payload as unknown as BookingConfirmTokenPayload
}
