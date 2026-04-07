import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://bxkxvrhspklpkkgmzcge.supabase.co'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ4a3h2cmhzcGtscGtrZ216Y2dlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4MjYyMzIsImV4cCI6MjA4OTQwMjIzMn0.F5XvYhXVut9zsy3GzwJoL0Rql1bh5EQuGk-JWGNFsG0'
const BASE = 'http://localhost:3000'
const PROJECT_REF = 'bxkxvrhspklpkkgmzcge'

const supabase = createClient(SUPABASE_URL, ANON_KEY)
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'bartosz.rogala@yahoo.pl',
  password: 'staging-temp-pass'
})
if (error) { console.error('AUTH ERROR:', error.message); process.exit(1) }

const session = data.session
const role = data.user.app_metadata?.role
console.log(`✅ Auth OK — role: ${role}`)

// Supabase SSR cookie format
const sessionJson = JSON.stringify(session)
const cookieName = `sb-${PROJECT_REF}-auth-token`
// SSR splits into chunks of 3180 bytes
const chunks = []
for (let i = 0; i < sessionJson.length; i += 3180) {
  chunks.push(sessionJson.slice(i, i + 3180))
}
let cookieHeader
if (chunks.length === 1) {
  cookieHeader = `${cookieName}=${encodeURIComponent(chunks[0])}`
} else {
  cookieHeader = chunks.map((c, i) => `${cookieName}.${i}=${encodeURIComponent(c)}`).join('; ')
}

async function test(label, url, expectedStatus = 200) {
  const r = await fetch(url, { headers: { Cookie: cookieHeader } })
  const text = await r.text()
  const ok = r.status === expectedStatus
  console.log(`${ok ? '✅' : '🔴'} [${r.status}${ok ? '' : ` ≠ ${expectedStatus}`}] ${label}`)
  if (!ok) console.log('   →', text.slice(0, 200))
  return { status: r.status, text }
}

console.log('\n--- Testy API (owner) ---')
const treatR = await test('6.5 GET /api/treatment-plans (owner → 200)', `${BASE}/api/treatment-plans`)
await test('1.4 GET /api/employees', `${BASE}/api/employees`)
await test('5.6 GET /api/payments/booking/history', `${BASE}/api/payments/booking/history`)
await test('2.4 GET /api/payroll (owner → 200)', `${BASE}/api/payroll`)

// Pobierz employee ID do testu 1.4 services
const empR = await fetch(`${BASE}/api/employees`, { headers: { Cookie: cookieHeader } })
const empData = await empR.json().catch(() => ({}))
const firstEmp = empData?.employees?.[0] ?? empData?.[0]
if (firstEmp?.id) {
  await test(`1.4 GET /api/employees/${firstEmp.id}/services`, `${BASE}/api/employees/${firstEmp.id}/services`)
} else {
  console.log('⚠️  Brak employee ID — pomijam test 1.4 services')
  console.log('   employees response:', JSON.stringify(empData).slice(0, 200))
}

// Sprawdź strukturę odpowiedzi dla kluczowych endpointów
console.log('\n--- Struktura odpowiedzi ---')
const payrollR = await fetch(`${BASE}/api/payroll`, { headers: { Cookie: cookieHeader } })
const payroll = await payrollR.json()
console.log('Payroll keys:', Object.keys(payroll))

const empServR = await fetch(`${BASE}/api/employees/${firstEmp?.id}/services`, { headers: { Cookie: cookieHeader } })
const empServ = await empServR.json()
console.log('Employee services:', JSON.stringify(empServ).slice(0, 300))

const histR = await fetch(`${BASE}/api/payments/booking/history`, { headers: { Cookie: cookieHeader } })
const hist = await histR.json()
console.log('Payment history keys:', Object.keys(hist))
