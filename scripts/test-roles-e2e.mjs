import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing environment variables in .env.local')
  process.exit(1)
}

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const ROLES_TO_TEST = [
  {
    role: 'owner',
    permissions: ['*']
  },
  {
    role: 'manager',
    permissions: [
      'calendar:view',
      'calendar:manage_all',
      'clients:view',
      'clients:manage',
      'employees:manage',
      'services:manage',
      'finance:view',
      'reports:view',
      'settings:view'
    ]
  },
  {
    role: 'employee',
    permissions: [
      'calendar:view',
      'calendar:manage_own',
      'clients:view',
      'services:view'
    ]
  }
]

async function runTests() {
  console.log('🔄 Starting RBAC E2E validation script...')

  const { data: salons, error: salonError } = await adminClient
    .from('salons')
    .select('id, slug')
    .limit(1)

  if (salonError || !salons || salons.length === 0) {
    console.error('❌ Error: Could not find a test salon to associate users with.')
    process.exit(1)
  }

  const salon = salons[0]
  console.log(`✅ Found test salon: ${salon.slug} (${salon.id})`)

  const createdUserIds = []
  let passedCount = 0
  let failedCount = 0

  for (const test of ROLES_TO_TEST) {
    const roleName = test.role
    const email = `test-${roleName}-${Math.random().toString(36).slice(2, 7)}@rbac-e2e-test.simplisalon.pl`
    const password = 'TestPassword123!'

    console.log(`\n🔄 Testing role: ${roleName.toUpperCase()}`)

    try {
      // 1. Create auth user via Admin API
      const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true
      })

      if (authError) throw new Error(`Auth creation failed: ${authError.message}`)
      const userId = authData.user.id
      createdUserIds.push(userId)
      console.log(`✅ Auth user created: ${userId}`)

      // 2. Create profile (triggers sync_user_claims)
      const { error: profileError } = await adminClient
        .from('profiles')
        .insert({
          user_id: userId,
          salon_id: salon.id,
          role: roleName,
          full_name: `Test ${roleName}`
        })

      if (profileError) throw new Error(`Profile creation failed: ${profileError.message}`)
      console.log(`✅ Profile created for ${roleName}`)

      // Wait for trigger to populate app_metadata
      await new Promise(resolve => setTimeout(resolve, 2000))

      // 3. Sign in as the new user
      const { data: signInData, error: signInError } = await anonClient.auth.signInWithPassword({
        email,
        password
      })

      if (signInError) throw new Error(`Sign in failed: ${signInError.message}`)
      console.log('✅ Signed in successfully')

      // 4. Verify app_metadata in JWT
      const { app_metadata } = signInData.user
      
      if (!app_metadata || app_metadata.role !== roleName) {
        // If metadata is missing, try a quick update to re-trigger and check again
        console.log('🔄 Claims missing, re-triggering via profile update...')
        await adminClient.from('profiles').update({ updated_at: new Date().toISOString() }).eq('user_id', userId)
        await new Promise(resolve => setTimeout(resolve, 2000))
        
        const { data: refreshData, error: refreshError } = await anonClient.auth.refreshSession()
        if (refreshError) throw new Error(`Refresh failed: ${refreshError.message}`)
        
        const updatedMetadata = refreshData.user?.app_metadata || {}
        if (updatedMetadata.role !== roleName) {
          throw new Error(`Role mismatch after retry: expected ${roleName}, got ${updatedMetadata.role}`)
        }
        console.log(`✅ JWT role verified (after retry): ${updatedMetadata.role}`)
      } else {
        console.log(`✅ JWT app_metadata.role verified: ${app_metadata.role}`)
      }

      // 5. Verify permissions
      const finalMetadata = (await anonClient.auth.getUser()).data.user.app_metadata
      const userPermissions = finalMetadata.permissions || []
      const missing = test.permissions.filter(p => !userPermissions.includes(p))

      if (missing.length > 0) {
        throw new Error(`Missing permissions: ${missing.join(', ')}`)
      }
      console.log('✅ JWT app_metadata.permissions verified')

      await anonClient.auth.signOut()
      passedCount++
    } catch (err) {
      console.error(`❌ Test failed for ${roleName}: ${err.message}`)
      failedCount++
    }
  }

  // Cleanup: Delete test users
  console.log('\n🔄 Cleaning up test users...')
  for (const userId of createdUserIds) {
    const { error: delError } = await adminClient.auth.admin.deleteUser(userId)
    if (delError) {
      console.error(`❌ Failed to delete user ${userId}: ${delError.message}`)
    } else {
      console.log(`✅ Deleted: ${userId}`)
    }
  }

  console.log('\n' + '='.repeat(30))
  console.log('📊 FINAL SUMMARY')
  console.log(`✅ Passed: ${passedCount}`)
  console.log(`❌ Failed: ${failedCount}`)
  console.log('='.repeat(30))

  if (failedCount > 0) process.exit(1)
}

runTests().catch(err => {
  console.error('\n💥 Fatal Error:', err)
  process.exit(1)
})
