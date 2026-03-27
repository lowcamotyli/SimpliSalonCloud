import { NextResponse } from 'next/server'
import { sendEmail } from '@/lib/email/router'
import { AppError } from '@/lib/errors'
import { getAuthContext } from '@/lib/supabase/get-auth-context'

interface SuccessResponse {
  success: true
}

interface ErrorResponse {
  error: string
}

export async function POST(): Promise<NextResponse<SuccessResponse | ErrorResponse>> {
  try {
    const { supabase, user, salonId } = await getAuthContext()
    void supabase

    if (!user.email) {
      throw new AppError('User email not found', 'VALIDATION_ERROR', 400)
    }

    await sendEmail({
      salonId,
      to: user.email,
      subject: 'Test email z Gmail — SimpliSalonCloud',
      html: '<p>Twoje konto Gmail zostało pomyślnie połączone z SimpliSalonCloud.</p>',
      text: 'Twoje konto Gmail zostało pomyślnie połączone z SimpliSalonCloud.',
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }

    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
