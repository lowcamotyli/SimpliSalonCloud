import { NextRequest, NextResponse } from 'next/server'

// Redirect /register → /signup (permanent, works in all environments)
export function GET(request: NextRequest) {
    const url = new URL('/signup', request.url)
    return NextResponse.redirect(url, { status: 308 })
}
