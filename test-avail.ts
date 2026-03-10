import { createAdminSupabaseClient } from './lib/supabase/admin'

async function check() {
    const supabase = createAdminSupabaseClient()
    const { data: emp, error: empErr } = await supabase.from('employees').select('id, name').eq('name', 'Lowca Motyli')
    console.log("Emp:", emp, empErr)
    if (emp && emp.length > 0) {
        const id = emp[0].id
        const { data: schedules } = await supabase.from('employee_schedules').select('*').eq('employee_id', id)
        const { data: exceptions } = await supabase.from('employee_schedule_exceptions').select('*').eq('employee_id', id)
        console.log("Schedules:", schedules)
        console.log("Exceptions:", exceptions)
    }
}
check()
