import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://bxkxvrhspklpkkgmzcge.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

const SALON_ID = 'f5d0f479-5959-4cf8-8a3f-24f63a981f9b'

// Pobierz aktualne features
const { data: salon } = await admin.from('salons').select('features').eq('id', SALON_ID).single()
console.log('Aktualne features:', JSON.stringify(salon?.features))

const updated = { ...(salon?.features ?? {}), treatment_records: true }
const { error } = await admin.from('salons').update({ features: updated }).eq('id', SALON_ID)

if (error) { console.error('ERROR:', error.message); process.exit(1) }
console.log('✅ treatment_records włączony')
console.log('Nowe features:', JSON.stringify(updated))
