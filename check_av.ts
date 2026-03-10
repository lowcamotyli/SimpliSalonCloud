import { createAdminSupabaseClient } from './lib/supabase/admin'

async function check() {
    const supabase = createAdminSupabaseClient()

    // 1. Fetch the employee
    const { data: emp } = await supabase.from('employees').select('id, name').eq('name', 'Lowca Motyli').single()
    if (!emp) {
        console.log("No lowca motyli")
        return
    }

    const { data: services } = await supabase.from('services').select('id, name').eq('salon_id', 'lowca-motyli').limit(1)
    if (!services || services.length === 0) return

    const { data: settings } = await supabase.from('salon_settings').select('operating_hours').eq('salon_id', 'lowca-motyli').single()

    const { data: schedules } = await supabase.from('employee_schedules').select('*').eq('employee_id', emp.id)
    const { data: exceptions } = await supabase.from('employee_schedule_exceptions').select('*').eq('employee_id', emp.id)

    console.log("Schedules:")
    console.log(schedules)

    console.log("Exceptions:")
    console.log(exceptions)

    console.log("Settings:")
    console.log(settings)
}

check()
