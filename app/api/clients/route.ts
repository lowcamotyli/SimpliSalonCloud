import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// Fuzzy search helper - toleruje literówki
function fuzzyMatch(text: string, pattern: string): number {
  const textLower = text.toLowerCase()
  const patternLower = pattern.toLowerCase()
  
  if (textLower.includes(patternLower)) return 100 // Dokładne dopasowanie
  
  let score = 0
  let patternIdx = 0
  
  for (let i = 0; i < textLower.length && patternIdx < patternLower.length; i++) {
    if (textLower[i] === patternLower[patternIdx]) {
      score += 10
      patternIdx++
    }
  }
  
  return patternIdx === patternLower.length ? score : 0
}

// GET /api/clients - List all clients with fuzzy search
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('salon_id')
      .eq('user_id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Get query params
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')
    const limit = parseInt(searchParams.get('limit') || '200')

    let query = supabase
      .from('clients')
      .select('*')
      .eq('salon_id', profile.salon_id)
      .order('created_at', { ascending: false })
      .limit(limit)

    const { data: clients, error } = await query

    if (error) throw error

    // Apply fuzzy search if provided
    let results = clients || []
    if (search && search.trim()) {
      results = results
        .map(client => ({
          ...client,
          score: Math.max(
            fuzzyMatch(client.full_name, search),
            fuzzyMatch(client.phone || '', search),
            fuzzyMatch(client.email || '', search)
          )
        }))
        .filter(client => client.score > 0)
        .sort((a, b) => b.score - a.score)
        .map(({ score, ...client }) => client)
    }

    return NextResponse.json({ clients: results })
  } catch (error: any) {
    console.error('GET /api/clients error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST /api/clients - Create new client
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('salon_id')
      .eq('user_id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    const body = await request.json()
    const { full_name, phone, email, notes } = body

    if (!full_name) {
      return NextResponse.json({ error: 'Full name is required' }, { status: 400 })
    }

    const { data: client, error } = await supabase
      .from('clients')
      .insert([
        {
          salon_id: profile.salon_id,
          full_name: full_name.trim(),
          phone: phone?.trim() || null,
          email: email?.trim() || null,
          notes: notes?.trim() || null,
        }
      ])
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ client }, { status: 201 })
  } catch (error: any) {
    console.error('POST /api/clients error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
