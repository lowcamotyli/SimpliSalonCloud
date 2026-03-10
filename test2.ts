import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'
import * as fs from 'fs'

dotenv.config({ path: path.resolve(__dirname, '.env') })
dotenv.config({ path: path.resolve(__dirname, '.env.local') })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const supabase = createClient(url, key)

async function check() {
    const { data: emps } = await supabase.from('employees').select('id, name')
    if (!emps || !emps.length) return;

    // Pick Lowca Motyli
    const emp = emps.find(e => e.name === 'Michał ' || e.name === 'Lowca Motyli' || e.name === 'Łowca Motyli') || emps[0];
    const { data: schedules } = await supabase.from('employee_schedules').select('*').eq('employee_id', emp.id)
    const { data: exceptions } = await supabase.from('employee_schedule_exceptions').select('*').eq('employee_id', emp.id)

    const out = {
        emp,
        schedules,
        exceptions
    }
    fs.writeFileSync('test-output.json', JSON.stringify(out, null, 2))
}
check()
