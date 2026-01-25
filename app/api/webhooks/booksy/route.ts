import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// TODO: Implement Booksy email parsing
// This is a stub - full implementation requires:
// 1. Gmail API setup
// 2. Email parsing logic (parse subject/body for booking details)
// 3. Client matching/creation
// 4. Booking creation with source='booksy'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // TODO: Parse Booksy email format
    // Expected fields:
    // - clientName
    // - clientPhone
    // - serviceName
    // - bookingDate (parse Polish date format)
    // - bookingTime
    // - employeeName
    // - price

    // TODO: Match employee by name
    // TODO: Match/create client by phone
    // TODO: Match service by name
    // TODO: Create booking with source='booksy'

    return NextResponse.json({ 
      success: true,
      message: 'Booksy webhook received (stub)'
    })
  } catch (error: any) {
    console.error('Booksy webhook error:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}