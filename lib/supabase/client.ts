import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database'

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is missing')
  if (!key) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is missing')

  return createBrowserClient<Database>(url, key)
}