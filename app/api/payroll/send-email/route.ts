import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
    try {
        const supabase = await createServerSupabaseClient()

        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const body = await request.json()
        const { employeeId, employeeName, month, totalPayout } = body

        if (!employeeId || !month) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
        }

        // Mocking email send logic
        console.log(`[MOCK EMAIL] Sending payroll for ${month} to ${employeeName} (ID: ${employeeId}). Amount: ${totalPayout} zł`)

        // In a real implementation, you would use Resend or Nodemailer here:
        // const { data, error } = await resend.emails.send({
        //   from: 'SimpliSalon <salon@simplisalon.com>',
        //   to: [employeeEmail],
        //   subject: `Rozliczenie wynagrodzenia - ${month}`,
        //   react: PayrollEmailTemplate({ ... }),
        // })

        return NextResponse.json({ message: 'Email sent successfully (mocked)' }, { status: 200 })
    } catch (error: any) {
        console.error('POST /api/payroll/send-email error:', error)
        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: 500 }
        )
    }
}
