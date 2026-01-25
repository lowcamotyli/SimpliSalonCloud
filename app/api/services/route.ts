import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// GET /api/services - List all services
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
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

    // Fetch services grouped by category
    const { data: services, error } = await supabase
      .from('services')
      .select('*')
      .eq('salon_id', profile.salon_id)
      .eq('active', true)
      .order('category')
      .order('subcategory')
      .order('name')

    if (error) throw error

    // Group services by category and subcategory
    const grouped: any = {}

    services?.forEach((service) => {
      if (!grouped[service.category]) {
        grouped[service.category] = {
          category: service.category,
          subcategories: {},
        }
      }

      if (!grouped[service.category].subcategories[service.subcategory]) {
        grouped[service.category].subcategories[service.subcategory] = {
          name: service.subcategory,
          services: [],
        }
      }

      grouped[service.category].subcategories[service.subcategory].services.push({
        id: service.id,
        name: service.name,
        price: service.price,
        duration: service.duration,
        surchargeAllowed: service.surcharge_allowed,
      })
    })

    // Convert to array format
    const servicesTree = Object.values(grouped).map((cat: any) => ({
      category: cat.category,
      subcategories: Object.values(cat.subcategories),
    }))

    return NextResponse.json({ services: servicesTree })
  } catch (error: any) {
    console.error('GET /api/services error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}