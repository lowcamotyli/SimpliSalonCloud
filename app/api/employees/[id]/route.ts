import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { updateEmployeeSchema } from '@/lib/validators/employee.validators'
import { Role, RBAC_ROLES } from '@/lib/rbac/role-maps'
import { z } from 'zod'

const updateRoleSchema = z.object({
  role: z.enum([RBAC_ROLES.OWNER, RBAC_ROLES.MANAGER, RBAC_ROLES.EMPLOYEE]),
})

const linkUserSchema = z.object({
  email: z.string().email(),
})

// GET /api/employees/[id] - Get single employee
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: employee, error } = await (supabase as any)
      .from('employees')
      .select('*')
      .eq('id', params.id)
      .single()

    if (error) throw error
    if (!employee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
    }

    return NextResponse.json({ employee })
  } catch (error: any) {
    console.error('GET /api/employees/[id] error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT /api/employees/[id] - Update employee
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const validatedData = updateEmployeeSchema.parse(body)

    // Get current version
    const { data: existingEmployee, error: existingError } = await (supabase as any)
      .from('employees')
      .select('version')
      .eq('id', params.id)
      .single()

    if (existingError || !existingEmployee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
    }

    const { data: employee, error } = await (supabase as any)
      .from('employees')
      .update({
        version: existingEmployee.version, // Required by check_version() trigger
        ...(validatedData.firstName !== undefined && { first_name: validatedData.firstName }),
        ...(validatedData.lastName !== undefined && { last_name: validatedData.lastName || null }),
        ...(validatedData.email !== undefined && { email: validatedData.email || null }),
        ...(validatedData.phone !== undefined && { phone: validatedData.phone || null }),
        ...(validatedData.baseThreshold !== undefined && { base_threshold: validatedData.baseThreshold }),
        ...(validatedData.baseSalary !== undefined && { base_salary: validatedData.baseSalary }),
        ...(validatedData.commissionRate !== undefined && { commission_rate: validatedData.commissionRate }),
        ...(validatedData.avatarUrl !== undefined && { avatar_url: validatedData.avatarUrl || null }),
        ...(validatedData.active !== undefined && { active: validatedData.active }),
      })
      .eq('id', params.id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ employee })
  } catch (error: any) {
    console.error('PUT /api/employees/[id] error:', error)

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

// PATCH /api/employees/[id] - Update employee role
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const adminSupabase = createAdminClient()

    const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser()
    if (authError || !currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const currentRole = currentUser.app_metadata.role as Role | undefined
    const currentSalonId = currentUser.app_metadata.salon_id

    if (currentRole !== RBAC_ROLES.OWNER && currentRole !== RBAC_ROLES.MANAGER) {
      return NextResponse.json({ error: 'Forbidden. Requires OWNER or MANAGER role.' }, { status: 403 })
    }

    const employeeId = params.id
    const body = await request.json()

    if (body?.email) {
      const { email } = linkUserSchema.parse(body)

      const { data: linkResult, error: linkError } = await adminSupabase
        .rpc('link_employee_to_user_by_email', {
          employee_uuid: employeeId,
          user_email: email,
        })

      if (linkError) {
        return NextResponse.json({ error: linkError.message }, { status: 400 })
      }

      return NextResponse.json({ success: true, link: linkResult })
    }

    const { role: newRole } = updateRoleSchema.parse(body)

    if (newRole === RBAC_ROLES.OWNER && currentRole !== RBAC_ROLES.OWNER) {
      return NextResponse.json({ error: 'Forbidden. Only an existing OWNER can assign the OWNER role.' }, { status: 403 })
    }

    const { data: employeeRecord, error: employeeError } = await (adminSupabase as any)
      .from('employees')
      .select('id, user_id, salon_id, first_name, last_name')
      .eq('id', employeeId)
      .single()

    if (employeeError || !employeeRecord) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
    }

    if (!employeeRecord.user_id) {
      return NextResponse.json({ error: 'Employee is not linked to a user account' }, { status: 400 })
    }

    const { data: employeeProfile, error: profileError } = await adminSupabase
      .from('profiles')
      .select('salon_id, user_id, role')
      .eq('user_id', employeeRecord.user_id)
      .maybeSingle()

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 400 })
    }

    let ensuredProfile = employeeProfile

    if (!ensuredProfile) {
      const fullName = `${employeeRecord.first_name || ''} ${employeeRecord.last_name || ''}`.trim()
      const { data: createdProfile, error: createProfileError } = await adminSupabase
        .from('profiles')
        .insert({
          user_id: employeeRecord.user_id,
          salon_id: employeeRecord.salon_id,
          role: RBAC_ROLES.EMPLOYEE,
          full_name: fullName.length > 0 ? fullName : 'Employee',
        })
        .select('salon_id, user_id, role')
        .single()

      if (createProfileError || !createdProfile) {
        return NextResponse.json({ error: createProfileError?.message || 'Employee profile not found' }, { status: 400 })
      }

      ensuredProfile = createdProfile
    }

    if (ensuredProfile.salon_id !== currentSalonId) {
      return NextResponse.json({ error: 'Forbidden. Employee belongs to a different salon.' }, { status: 403 })
    }

    if (ensuredProfile.user_id === currentUser.id) {
      return NextResponse.json({ error: 'Forbidden. Cannot change your own role via this endpoint.' }, { status: 403 })
    }

    if (currentRole === RBAC_ROLES.MANAGER && ensuredProfile.role === RBAC_ROLES.OWNER) {
      return NextResponse.json({ error: 'Forbidden. MANAGER cannot modify an OWNER role.' }, { status: 403 })
    }

    if (ensuredProfile.role === RBAC_ROLES.OWNER && newRole !== RBAC_ROLES.OWNER) {
      const { count, error: countError } = await adminSupabase
        .from('profiles')
        .select('user_id', { count: 'exact' })
        .eq('salon_id', currentSalonId)
        .eq('role', RBAC_ROLES.OWNER)
        .neq('user_id', ensuredProfile.user_id)

      if (countError) throw countError

      if (count !== null && count < 1) {
        return NextResponse.json({ error: 'Forbidden. Cannot demote the only OWNER of the salon.' }, { status: 403 })
      }
    }

    const { data: updatedProfile, error: updateRoleError } = await adminSupabase
      .from('profiles')
      .update({ role: newRole })
      .eq('user_id', employeeRecord.user_id)
      .select('role')
      .single()

    if (updateRoleError) throw updateRoleError

    return NextResponse.json({ success: true, newRole: updatedProfile.role })
  } catch (error: any) {
    console.error('PATCH /api/employees/[id] error:', error)

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

// DELETE /api/employees/[id] - Soft delete employee
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Delete will trigger soft_delete_employee trigger (sets deleted_at and deleted_by)
    const { error } = await (supabase as any)
      .from('employees')
      .delete()
      .eq('id', params.id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('DELETE /api/employees/[id] error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
