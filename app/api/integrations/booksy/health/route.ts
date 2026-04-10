import { NextRequest, NextResponse } from 'next/server'

import { getSalonHealth } from '@/lib/booksy/health-check'
import { UnauthorizedError } from '@/lib/errors'
import { getAuthContext } from '@/lib/supabase/get-auth-context'

export async function GET(request: NextRequest) {
  void request

  try {
    const { supabase, salonId } = await getAuthContext()
    const result = await getSalonHealth(salonId, supabase)

    return NextResponse.json(result, { status: 200 })
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }

    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
