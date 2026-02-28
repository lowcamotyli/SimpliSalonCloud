import { NextRequest, NextResponse } from 'next/server'
import { POST as postSmsSettingsTest } from '@/app/api/settings/sms/test/route'

export async function POST(request: NextRequest) {
  return postSmsSettingsTest(request)
}

