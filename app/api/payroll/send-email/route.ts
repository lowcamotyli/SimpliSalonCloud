import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Resend } from 'resend';
import { ZodError } from 'zod';
import { sendPayrollEmailSchema } from '@/lib/validators/payroll.validators';
import { canSendPayrollEmails } from '@/lib/payroll/access';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Brak autoryzacji' }, { status: 401 });
    }

    const { data: profile } = (await supabase
      .from('profiles')
      .select('role, salon_id')
      .eq('user_id', user.id)
      .single()) as any;

    if (!profile || !canSendPayrollEmails(profile.role)) {
      return NextResponse.json({ error: 'Brak uprawnien' }, { status: 403 });
    }

    const body = await request.json();
    const { employeeId, employeeName, month, totalPayout } = sendPayrollEmailSchema.parse(body);

    const { data: employee, error: empError } = (await (supabase.from('employees') as any)
      .select('email')
      .eq('id', employeeId)
      .eq('salon_id', profile.salon_id)
      .single()) as any;

    if (empError || !employee?.email) {
      return NextResponse.json(
        { error: 'Nie znaleziono adresu email pracownika' },
        { status: 404 }
      );
    }

    const { data: settings } = (await (supabase.from('salon_settings') as any)
      .select('resend_api_key,resend_from_email,resend_from_name,business_name')
      .eq('salon_id', profile.salon_id)
      .maybeSingle()) as any;

    const apiKey = settings?.resend_api_key?.trim() || process.env.RESEND_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Serwis email nie jest skonfigurowany' },
        { status: 503 }
      );
    }

    const fromEmail = settings?.resend_from_email || process.env.RESEND_FROM_EMAIL;
    if (!fromEmail) {
      return NextResponse.json(
        { error: 'Adres nadawcy nie jest skonfigurowany' },
        { status: 503 }
      );
    }

    const salonName = settings?.business_name || 'SimpliSalon';
    const fromName = settings?.resend_from_name || '';
    const from = fromName ? fromName + ' <' + fromEmail + '>' : fromEmail;

    const formattedPayout = totalPayout.toLocaleString('pl-PL', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    const resend = new Resend(apiKey);
    const result: any = await resend.emails.send({
      from,
      to: [employee.email],
      subject: 'Rozliczenie wynagrodzenia - ' + month + ' | ' + salonName,
      html:
        '<p>Drogi ' +
        employeeName +
        ', kwota do wyplaty za ' +
        month +
        ': <strong>' +
        formattedPayout +
        ' zl</strong></p>',
    });

    if (result?.error) {
      throw new Error(result.error.message || 'Wyslanie email nie powiodlo sie');
    }

    return NextResponse.json({ message: 'Email wyslany pomyslnie' }, { status: 200 });
  } catch (error: any) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: 'Blad walidacji', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Wewnetrzny blad serwera' },
      { status: 500 }
    );
  }
}
