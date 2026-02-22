import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createEmployeeSchema } from '@/lib/validators/employee.validators'
import { z } from 'zod'

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
    const { data: profile } = await (supabase as any)
      .from('profiles')
      .select('salon_id')
      .eq('user_id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Fetch employees
    const { data: employees, error } = await (supabase as any)
      .from('employees')
      .select('*')
      .eq('salon_id', profile.salon_id)
      .eq('active', true)
      .is('deleted_at', null)
      .order('first_name')

    if (error) throw error

    const employeeList = (employees || []) as Array<{ user_id: string | null }>
    const userIds = employeeList
      .map((employee) => employee.user_id)
      .filter((userId): userId is string => Boolean(userId))

    let rolesByUserId = new Map<string, string>()

    if (userIds.length > 0) {
      const { data: profiles, error: profilesError } = await (supabase as any)
        .from('profiles')
        .select('user_id, role')
        .in('user_id', userIds)

      if (profilesError) throw profilesError

      rolesByUserId = new Map(
        (profiles as Array<{ user_id: string; role: string }>).map((profile) => [profile.user_id, profile.role])
      )
    }

    const employeesWithRoles = employeeList.map((employee: any) => ({
      ...employee,
      role: employee.user_id ? rolesByUserId.get(employee.user_id) ?? null : null,
    }))

    return NextResponse.json({ employees: employeesWithRoles })
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
    const adminSupabase = createAdminClient()

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
    if ((profile as any).role !== 'owner') {
      return NextResponse.json(
        { error: 'Permission denied' },
        { status: 403 }
      )
    }

    // Parse and validate body
    const body = await request.json()

    console.log('Employee body received:', body)

    const validatedData = createEmployeeSchema.parse(body)

    // Generate employee code
    const { data: codeData, error: codeError } = await (supabase as any)
      .rpc('generate_employee_code', { salon_uuid: (profile as any).salon_id })

    const employeeCode = codeData || `E${Date.now().toString().slice(-6)}`

    if (codeError) {
      console.warn('Failed to generate employee code, using fallback:', codeError)
    }

    const normalizedEmail = validatedData.email.trim().toLowerCase()

    const findUserByEmail = async (email: string) => {
      const perPage = 200
      let page = 1

      while (true) {
        const { data, error } = await adminSupabase.auth.admin.listUsers({ page, perPage })

        if (error) {
          return { user: null, error }
        }

        const user = data.users.find((candidate: any) => candidate.email?.toLowerCase() === email)

        if (user) {
          return { user, error: null }
        }

        if (data.users.length < perPage) {
          return { user: null, error: null }
        }

        page += 1
      }
    }

    const { user: existingUser, error: existingUserError } = await findUserByEmail(normalizedEmail)

    if (existingUserError) {
      return NextResponse.json({ error: existingUserError.message }, { status: 400 })
    }

    let authUser = existingUser

    if (!authUser) {
      const { data: inviteData, error: inviteError } = await adminSupabase.auth.admin.inviteUserByEmail(
        normalizedEmail,
        {
          data: {
            salon_id: (profile as any).salon_id,
            role: 'employee',
          },
          redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/invite`,
        }
      )

      if (inviteError || !inviteData?.user) {
        return NextResponse.json({ error: inviteError?.message || 'Failed to invite user' }, { status: 400 })
      }

      authUser = inviteData.user
    }

    if (!authUser?.id) {
      return NextResponse.json({ error: 'User account unavailable' }, { status: 400 })
    }

    const { data: existingEmployee, error: existingEmployeeError } = await adminSupabase
      .from('employees')
      .select('id, salon_id')
      .eq('user_id', authUser.id)
      .maybeSingle()

    if (existingEmployeeError) {
      return NextResponse.json({ error: existingEmployeeError.message }, { status: 400 })
    }

    if (existingEmployee) {
      if (existingEmployee.salon_id !== (profile as any).salon_id) {
        return NextResponse.json({ error: 'User belongs to a different salon' }, { status: 409 })
      }

      return NextResponse.json(
        { employee: existingEmployee, invited: false, alreadyLinked: true },
        { status: 200 }
      )
    }

    const { data: employee, error: insertError } = await adminSupabase
      .from('employees')
      .insert({
        salon_id: (profile as any).salon_id,
        user_id: authUser.id,
        employee_code: employeeCode,
        first_name: validatedData.firstName,
        last_name: validatedData.lastName || null,
        email: normalizedEmail,
        phone: validatedData.phone || null,
        base_threshold: validatedData.baseThreshold,
        base_salary: validatedData.baseSalary,
        commission_rate: validatedData.commissionRate,
        avatar_url: validatedData.avatarUrl || null,
        active: validatedData.active ?? true,
      })
      .select()
      .single()

    if (insertError || !employee) {
      if (authUser?.id && !existingUser) {
        await adminSupabase.auth.admin.deleteUser(authUser.id)
      }
      return NextResponse.json({ error: insertError?.message || 'Failed to insert employee' }, { status: 400 })
    }

    const { data: profileRecord, error: profileError } = await adminSupabase
      .from('profiles')
      .select('id, salon_id')
      .eq('user_id', authUser.id)
      .maybeSingle()

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 400 })
    }

    if (profileRecord && profileRecord.salon_id !== (profile as any).salon_id) {
      return NextResponse.json({ error: 'User belongs to a different salon' }, { status: 409 })
    }

    if (!profileRecord) {
      const fullName = `${validatedData.firstName} ${validatedData.lastName || ''}`.trim()
      const { error: insertProfileError } = await adminSupabase
        .from('profiles')
        .insert({
          user_id: authUser.id,
          salon_id: (profile as any).salon_id,
          role: 'employee',
          full_name: fullName.length > 0 ? fullName : normalizedEmail,
        })

      if (insertProfileError) {
        return NextResponse.json({ error: insertProfileError.message }, { status: 400 })
      }
    }

    return NextResponse.json({ employee, invited: !existingUser }, { status: 201 })
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
