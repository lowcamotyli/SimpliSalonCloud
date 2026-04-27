const dotenv = require('dotenv')
const { createClient } = require('@supabase/supabase-js')

async function main() {
  const salonId = process.argv[2]
  const clientName = process.argv[3]
  const envFile = process.argv[4] || '.env.prod'

  if (!salonId || !clientName) {
    console.error('Usage: node scripts/query-client-bookings.cjs <salon_id> <client_name_like> [env_file]')
    process.exit(1)
  }

  dotenv.config({ path: envFile })
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: clients, error: clientsError } = await db
    .from('clients')
    .select('id,full_name,phone')
    .eq('salon_id', salonId)
    .ilike('full_name', `%${clientName}%`)
    .limit(5)

  if (clientsError) throw clientsError
  console.log('clients', clients)
  if (!clients || clients.length === 0) return

  const clientIds = clients.map((c) => c.id)
  const { data: bookings, error: bookingsError } = await db
    .from('bookings')
    .select('id,booking_date,booking_time,status,employee_id,service_id,client_id')
    .eq('salon_id', salonId)
    .in('client_id', clientIds)
    .order('booking_date', { ascending: false })
    .order('booking_time', { ascending: false })
    .limit(30)

  if (bookingsError) throw bookingsError

  const employeeIds = [...new Set((bookings || []).map((b) => b.employee_id).filter(Boolean))]
  const serviceIds = [...new Set((bookings || []).map((b) => b.service_id).filter(Boolean))]

  const { data: employees, error: employeesError } = employeeIds.length
    ? await db.from('employees').select('id,first_name,last_name').in('id', employeeIds)
    : { data: [], error: null }
  if (employeesError) throw employeesError

  const { data: services, error: servicesError } = serviceIds.length
    ? await db.from('services').select('id,name').in('id', serviceIds)
    : { data: [], error: null }
  if (servicesError) throw servicesError

  const employeeMap = Object.fromEntries((employees || []).map((e) => [e.id, `${e.first_name} ${e.last_name || ''}`.trim()]))
  const serviceMap = Object.fromEntries((services || []).map((s) => [s.id, s.name]))

  const output = (bookings || []).map((b) => ({
    id: b.id,
    date: b.booking_date,
    time: b.booking_time,
    status: b.status,
    employee: employeeMap[b.employee_id] || b.employee_id,
    service: serviceMap[b.service_id] || b.service_id,
  }))

  console.log(JSON.stringify(output, null, 2))
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})

