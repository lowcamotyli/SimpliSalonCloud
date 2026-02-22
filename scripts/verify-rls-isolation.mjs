import { readFileSync } from 'node:fs'

function readEnvFile(path) {
  const content = readFileSync(path, 'utf8')
  const env = {}

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const eq = line.indexOf('=')
    if (eq === -1) continue

    const key = line.slice(0, eq).trim()
    const value = line.slice(eq + 1).trim()
    env[key] = value
  }

  return env
}

async function requestJson(url, options = {}) {
  const res = await fetch(url, options)
  const text = await res.text()
  let body

  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }

  return { ok: res.ok, status: res.status, body }
}

async function main() {
  const env = readEnvFile('.env.local')
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    throw new Error('Brak wymaganych zmiennych Supabase w .env.local')
  }

  const nonce = Date.now()
  const password = 'Qa!Test1234'
  const emailA = `rls.qa.a.${nonce}@example.com`
  const emailB = `rls.qa.b.${nonce}@example.com`
  const salonSlugA = `rls-qa-a-${nonce}`
  const salonSlugB = `rls-qa-b-${nonce}`

  const created = {
    users: [],
    salons: [],
    profiles: [],
    clients: [],
  }

  try {
    // 1) Admin create users (confirmed)
    const createUser = async (email) => {
      const out = await requestJson(`${supabaseUrl}/auth/v1/admin/users`, {
        method: 'POST',
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
          email_confirm: true,
        }),
      })

      if (!out.ok) {
        throw new Error(`Nie udało się utworzyć usera ${email}: ${out.status} ${JSON.stringify(out.body)}`)
      }

      const user = out.body?.user ?? out.body
      created.users.push(user.id)
      return user
    }

    const userA = await createUser(emailA)
    const userB = await createUser(emailB)

    // 2) Sign in as both users to get real JWT (anon key)
    const signIn = async (email) => {
      const out = await requestJson(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      })

      if (!out.ok) {
        throw new Error(`Nie udało się zalogować ${email}: ${out.status} ${JSON.stringify(out.body)}`)
      }

      return out.body.access_token
    }

    const tokenA = await signIn(emailA)
    const tokenB = await signIn(emailB)

    // 3) Create two salons with service role
    const salonsOut = await requestJson(`${supabaseUrl}/rest/v1/salons`, {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify([
        {
          name: 'RLS QA Salon A',
          slug: salonSlugA,
          owner_email: emailA,
        },
        {
          name: 'RLS QA Salon B',
          slug: salonSlugB,
          owner_email: emailB,
        },
      ]),
    })

    if (!salonsOut.ok || !Array.isArray(salonsOut.body) || salonsOut.body.length !== 2) {
      throw new Error(`Nie udało się utworzyć salonów: ${salonsOut.status} ${JSON.stringify(salonsOut.body)}`)
    }

    const salonA = salonsOut.body.find((s) => s.slug === salonSlugA)
    const salonB = salonsOut.body.find((s) => s.slug === salonSlugB)
    if (!salonA || !salonB) {
      throw new Error(`Brak utworzonych salonów A/B: ${JSON.stringify(salonsOut.body)}`)
    }

    created.salons.push(salonA.id, salonB.id)

    // 4) Create profile owner for both users
    const profilesOut = await requestJson(`${supabaseUrl}/rest/v1/profiles`, {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify([
        {
          user_id: userA.id,
          salon_id: salonA.id,
          full_name: 'RLS QA User A',
          role: 'owner',
        },
        {
          user_id: userB.id,
          salon_id: salonB.id,
          full_name: 'RLS QA User B',
          role: 'owner',
        },
      ]),
    })

    if (!profilesOut.ok || !Array.isArray(profilesOut.body) || profilesOut.body.length !== 2) {
      throw new Error(`Nie udało się utworzyć profili: ${profilesOut.status} ${JSON.stringify(profilesOut.body)}`)
    }
    created.profiles.push(...profilesOut.body.map((p) => p.id))

    // 5) Create one client in salon A
    const clientOut = await requestJson(`${supabaseUrl}/rest/v1/clients`, {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        salon_id: salonA.id,
        full_name: 'RLS Secret Client A',
        phone: `+48${String(nonce).slice(-9)}`,
        client_code: `RLS-${String(nonce).slice(-6)}`,
      }),
    })

    if (!clientOut.ok || !Array.isArray(clientOut.body) || clientOut.body.length !== 1) {
      throw new Error(`Nie udało się utworzyć klienta: ${clientOut.status} ${JSON.stringify(clientOut.body)}`)
    }
    const clientA = clientOut.body[0]
    created.clients.push(clientA.id)

    // 6) Validate helper function for both users
    const rpcSalon = async (token) => {
      const out = await requestJson(`${supabaseUrl}/rest/v1/rpc/get_user_salon_id`, {
        method: 'POST',
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      })
      return out
    }

    const rpcA = await rpcSalon(tokenA)
    const rpcB = await rpcSalon(tokenB)

    // 7) Attempt cross-tenant read as user B
    const leakOut = await requestJson(
      `${supabaseUrl}/rest/v1/clients?select=id,salon_id,full_name&salon_id=eq.${salonA.id}`,
      {
        method: 'GET',
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${tokenB}`,
        },
      }
    )

    const leakCount = Array.isArray(leakOut.body) ? leakOut.body.length : -1
    const leakDetected = leakOut.ok && leakCount > 0

    const summary = {
      emails: { emailA, emailB },
      salonA: salonA.id,
      salonB: salonB.id,
      rpcSalonA: rpcA.body,
      rpcSalonB: rpcB.body,
      crossTenantReadStatus: leakOut.status,
      crossTenantReadCount: leakCount,
      crossTenantReadBody: leakOut.body,
      leakDetected,
    }

    console.log(JSON.stringify(summary, null, 2))

    if (leakDetected) {
      process.exitCode = 2
    }
  } finally {
    // Best-effort cleanup using service role
    const authHeaders = {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    }

    for (const id of created.clients) {
      await fetch(`${supabaseUrl}/rest/v1/clients?id=eq.${id}`, { method: 'DELETE', headers: authHeaders })
    }

    for (const id of created.profiles) {
      await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${id}`, { method: 'DELETE', headers: authHeaders })
    }

    for (const id of created.salons) {
      await fetch(`${supabaseUrl}/rest/v1/salons?id=eq.${id}`, { method: 'DELETE', headers: authHeaders })
    }

    for (const id of created.users) {
      await fetch(`${supabaseUrl}/auth/v1/admin/users/${id}`, {
        method: 'DELETE',
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      })
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
