import { createClient } from '@supabase/supabase-js'
import { BooksyProcessor } from '../lib/booksy/booksy-processor'
import * as dotenv from 'dotenv'

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY // use service role to bypass RLS for setup

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function runTests() {
    console.log('--- Starting Booksy Integration Tests ---')

    // 1. Setup Data
    console.log('1. Setting up Test Salon, Employee, and Service')

    // Create Test Salon
    const { data: salon, error: salonError } = await supabase
        .from('salons')
        .insert({
            name: 'Booksy Test Salon',
            slug: 'booksy-test-' + Date.now(),
            owner_email: 'booksy-test@example.com'
        })
        .select()
        .single()

    if (salonError) throw salonError

    // Create Test Employee
    const { data: employee, error: empError } = await supabase
        .from('employees')
        .insert({
            salon_id: salon.id,
            first_name: 'Jan',
            last_name: 'Kowalski',
            employee_code: 'EMP-' + Date.now(),
            active: true
        })
        .select()
        .single()

    if (empError) throw empError

    // Create Test Service
    const { data: service, error: svcError } = await supabase
        .from('services')
        .insert({
            salon_id: salon.id,
            name: 'Strzyżenie Męskie',
            price: 150,
            duration: 45,
            active: true,
            category: 'Fryzjer',
            subcategory: 'Cięcie'
        })
        .select()
        .single()

    if (svcError) throw svcError

    console.log('✅ Setup Complete. Salon ID:', salon.id)

    const processor = new BooksyProcessor(supabase, salon.id)

    // 2. SCENARIO 1: New Booking (New Client)
    console.log('\n--- SCENARIO 1: New Booking (New Client) ---')
    const newEmailSubject = 'Janusz Nowak: nowa rezerwacja'
    const newEmailBody = `
Klient: Janusz Nowak
Telefon: 48 123 456 789
Email: janusz.nowak@example.com

Strzyżenie Męskie
150,00 zł

Kiedy:
25 października 2024, 14:00 - 14:45

Pracownik:
Jan Kowalski
`

    const result1 = await processor.processEmail(newEmailSubject, newEmailBody)
    console.log('Result 1:', result1.success ? 'SUCCESS' : 'FAILED', result1?.error || '')
    if (!result1.success) throw new Error('Scenario 1 Failed')

    const booking1 = result1.booking
    console.log('Created Booking ID:', booking1.id)

    // Verify DB structure
    const { data: verify1, error: verify1Error } = await supabase
        .from('bookings')
        .select('*, clients(*)')
        .eq('id', booking1.id)
        .single()

    if (verify1Error) throw verify1Error
    if (verify1.clients.phone !== '48123456789') throw new Error('Client phone mismatch')
    if (verify1.booking_date !== '2024-10-25') throw new Error('Date mismatch: ' + verify1.booking_date)
    if (verify1.booking_time !== '14:00:00' && verify1.booking_time !== '14:00') throw new Error('Time mismatch: ' + verify1.booking_time)
    if (verify1.employee_id !== employee.id) throw new Error('Employee mismatch')
    if (verify1.service_id !== service.id) throw new Error('Service mismatch')

    console.log('✅ Scenario 1 Passed')

    // 3. SCENARIO 2: Reschedule Booking
    console.log('\n--- SCENARIO 2: Reschedule ---')
    const resSubject = 'Janusz Nowak: zmienił rezerwację'
    const resBody = `
z dnia 25 października 2024 14:00
na 26 października 2024, 15:30 — 16:15
`

    const result2 = await processor.processEmail(resSubject, resBody)
    console.log('Result 2:', result2.success ? 'SUCCESS' : 'FAILED', result2?.error || '')
    if (!result2.success) throw new Error('Scenario 2 Failed')

    const { data: verify2, error: verify2Error } = await supabase
        .from('bookings')
        .select('*')
        .eq('id', booking1.id) // it should update the EXACT same booking
        .single()

    if (verify2Error) throw verify2Error
    if (verify2.booking_date !== '2024-10-26') throw new Error('Reschedule Date mismatch: ' + verify2.booking_date)
    if (verify2.booking_time !== '15:30:00' && verify2.booking_time !== '15:30') throw new Error('Reschedule Time mismatch: ' + verify2.booking_time)

    console.log('✅ Scenario 2 Passed')

    // 4. SCENARIO 3: Cancel Booking
    console.log('\n--- SCENARIO 3: Cancel ---')
    const cancelSubject = 'Janusz: odwołał wizytę' // Partial name to test loose matching
    const cancelBody = `
Janusz Nowak
odwołał wizytę

26 października 2024, 15:30 — 16:15
`

    const result3 = await processor.processEmail(cancelSubject, cancelBody)
    console.log('Result 3:', result3.success ? 'SUCCESS' : 'FAILED', result3?.error || '')
    if (!result3.success) throw new Error('Scenario 3 Failed: ' + result3.error)

    const { data: verify3, error: verify3Error } = await supabase
        .from('bookings')
        .select('*')
        .eq('id', booking1.id)
        .single()

    if (verify3Error) throw verify3Error
    if (verify3.status !== 'cancelled') throw new Error('Status should be cancelled')

    console.log('✅ Scenario 3 Passed')

    // 5. SCENARIO 4: New Booking (Existing Client)
    console.log('\n--- SCENARIO 4: New Booking (Existing Client) ---')
    // We reuse exactly the same phone number for "Janusz Nowak" to see if it links to the same client entity.
    const existSubject = 'Janusz Nowak: nowa rezerwacja'
    const existBody = `
Klient: Janusz Nowak
Telefon: 48 123 456 789
Email: janusz.nowak2@example.com

Strzyżenie Męskie
150,00 zł

Kiedy:
28 października 2024, 10:00 - 10:45

Pracownik:
Jan Kowalski
`
    const result4 = await processor.processEmail(existSubject, existBody)
    console.log('Result 4:', result4.success ? 'SUCCESS' : 'FAILED', result4?.error || '')
    if (!result4.success) throw new Error('Scenario 4 Failed')

    const { data: verify4, error: verify4Error } = await supabase
        .from('bookings')
        .select('*')
        .eq('id', result4.booking.id)
        .single()

    if (verify4Error) throw verify4Error
    if (verify4.client_id !== verify1.client_id) throw new Error('Failed to attach to EXISTING client. A duplicate client was likely created.')
    console.log('✅ Scenario 4 Passed')

    // 6. SCENARIO 5: Idempotency
    console.log('\n--- SCENARIO 5: Idempotency (Duplicated event) ---')
    // Simulating the same exact Books processor call but passing the exact same event ID string to options.
    const idempSubject = 'Nowa osoba: nowa rezerwacja'
    const idempBody = `
Klient: Nowa osoba
Telefon: 48 999 888 777
Email: nowa@example.com

Strzyżenie Męskie
150,00 zł

Kiedy:
29 października 2024, 10:00 - 10:45

Pracownik:
Jan Kowalski
`
    // First call (creates booking with event id)
    const idmpRes1 = await processor.processEmail(idempSubject, idempBody, { eventId: 'evt-booksy-idemp-1' })
    if (!idmpRes1.success) throw new Error('Scenario 5 Failed on first call')

    // Second call (should be idempotent and not create a new booking)
    const idmpRes2 = await processor.processEmail(idempSubject, idempBody, { eventId: 'evt-booksy-idemp-1' })

    // It should report success but deduplicated, and return the exact same booking.
    if (!idmpRes2.success) throw new Error('Scenario 5 Failed on duplicate call')
    if (!idmpRes2.deduplicated) throw new Error('Scenario 5 did not recognize duplicate eventId')
    if (idmpRes2.booking.id !== idmpRes1.booking.id) throw new Error('Scenario 5 created a new booking instead of returning the duplicated one.')

    console.log('✅ Scenario 5 Passed')


    // 7. SCENARIO 6: Missing Employee / Service Edge Case
    console.log('\n--- SCENARIO 6: Edge Case (Missing Employee/Service) ---')
    const badSubject = 'Bad Person: nowa rezerwacja'
    const badBody = `
Klient: Bad Person
Telefon: 48 111 222 333

Nieistniejąca Usługa
10,00 zł

Kiedy:
30 października 2024, 10:00 - 10:45

Pracownik:
Nieistniejący Pracownik
`
    const result6 = await processor.processEmail(badSubject, badBody)
    console.log('Result 6 (Expected to fail gracefully):', result6.success ? 'SUCCESS' : 'FAILED', result6?.error || '')
    if (result6.success) throw new Error('Scenario 6 should have failed because employee/service does not exist!')
    if (!result6.error?.includes('Employee not found')) throw new Error('Scenario 6 failed with unexpected error form: ' + result6.error)

    console.log('✅ Scenario 6 Passed')

    // 8. SCENARIO 7: Cancel logic edge case (missing booking)
    console.log('\n--- SCENARIO 7: Edge Case (Cancel non-existent booking) ---')
    const noCancelSubject = 'Ghost: odwołał wizytę'
    const noCancelBody = `
Ghost
odwołał wizytę

31 grudnia 2026, 15:30 — 16:15
`
    const result7 = await processor.processEmail(noCancelSubject, noCancelBody)
    console.log('Result 7 (Expected to fail gracefully):', result7.success ? 'SUCCESS' : 'FAILED', result7?.error || '')
    if (result7.success) throw new Error('Scenario 7 should have failed because booking does not exist')
    if (!result7.error?.includes('Original booking not found to cancel')) throw new Error('Scenario 7 failed with unexpected error form')

    console.log('✅ Scenario 7 Passed')

    console.log('\n--- All SCENARIOS PASSED ---')

    // Teardown
    console.log('\nCleaning up...')
    await supabase.from('bookings').delete().eq('salon_id', salon.id)
    await supabase.from('services').delete().eq('salon_id', salon.id)
    await supabase.from('employees').delete().eq('salon_id', salon.id)
    await supabase.from('clients').delete().eq('salon_id', salon.id)
    await supabase.from('salons').delete().eq('id', salon.id)
    console.log('Teardown complete.')
}

runTests().catch(async (e) => {
    require('fs').writeFileSync('db-error.json', JSON.stringify({ message: e.message, stack: e.stack, ...e }, null, 2))
    process.exit(1)
})
