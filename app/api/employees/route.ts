import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { z } from 'zod'

const createEmployeeSchema = z.object({
  firstName: z.string().min(2, 'Imię musi mieć minimum 2 znaki'),
  lastName: z.string().optional(),
  email: z.string().email('Nieprawidłowy email').optional().or(z.literal('')),
  phone: z.string().regex(/^\d{9}$/, 'Telefon: 9 cyfr').optional().or(z.literal('')),
  baseThreshold: z.number().min(0).default(0),
  baseSalary: z.number().min(0).default(0),
  commissionRate: z.number().min(0).max(1).default(0),
})

// GET /api/employees - List all employees
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    // Check auth
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's salon
    const { data: profile } = await supabase
      .from('profiles')
      .select('salon_id')
      .eq('user_id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Fetch employees
    const { data: employees, error } = await supabase
      .from('employees')
      .select('*')
      .eq('salon_id', profile.salon_id)
      .eq('active', true)
      .order('first_name')

    if (error) throw error

    return NextResponse.json({ employees })
  } catch (error: any) {
    console.error('GET /api/employees error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST /api/employees - Create new employee
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    // Check auth
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's salon
    const { data: profile } = await supabase
      .from('profiles')
      .select('salon_id, role')
      .eq('user_id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Check permission (only owner can create employees)
    if (profile.role !== 'owner') {
      return NextResponse.json(
        { error: 'Permission denied' },
        { status: 403 }
      )
    }

    // Parse and validate body
    const body = await request.json()
    const validatedData = createEmployeeSchema.parse(body)

    // Generate employee code
    const { data: codeData, error: codeError } = await supabase
      .rpc('generate_employee_code', { salon_uuid: profile.salon_id })

    if (codeError) throw codeError

    // Insert employee
    const { data: employee, error: insertError } = await supabase
      .from('employees')
      .insert({
        salon_id: profile.salon_id,
        employee_code: codeData,
        first_name: validatedData.firstName,
        last_name: validatedData.lastName || null,
        email: validatedData.email || null,
        phone: validatedData.phone || null,
        base_threshold: validatedData.baseThreshold,
        base_salary: validatedData.baseSalary,
        commission_rate: validatedData.commissionRate,
      })
      .select()
      .single()

    if (insertError) throw insertError

    return NextResponse.json({ employee }, { status: 201 })
  } catch (error: any) {
    console.error('POST /api/employees error:', error)

    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}