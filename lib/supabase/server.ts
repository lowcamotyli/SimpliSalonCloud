import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/supabase'

function isSupabaseAuthCookieName(name: string): boolean {
  return /^sb-.+-auth-token(?:\.\d+)?$/i.test(name) || name === 'supabase-auth-token'
}

export async function hasSupabaseSessionCookie(): Promise<boolean> {
  const cookieStore = await cookies()
  return cookieStore.getAll().some(({ name }) => isSupabaseAuthCookieName(name))
}

export async function createServerSupabaseClient() {
  const cookieStore = await cookies()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is missing')
  if (!key) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is missing')

  return createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {
          // Called from Server Component — ignore
        }
      },
    },
  })
}

export const createClient = createServerSupabaseClient
