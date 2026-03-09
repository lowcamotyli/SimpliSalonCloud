import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { withErrorHandling } from '@/lib/error-handler'
import { NotFoundError, UnauthorizedError } from '@/lib/errors'

export type ServiceSurveyConfig = {
  id: string
  name: string
  category: string
  subcategory: string
  survey_enabled: boolean
  survey_custom_message: string | null
}

// GET /api/settings/surveys - List active services with survey configuration
export const GET = withErrorHandling(async () => {
  const supabase = await createServerSupabaseClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new UnauthorizedError()
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('salon_id')
    .eq('user_id', user.id)
    .single()

  if (!profile) {
    throw new NotFoundError('Profile')
  }

  const typedProfile = profile as { salon_id: string }

  const { data: services, error } = await (supabase as any)
    .from('services')
    .select('id, name, category, subcategory, survey_enabled, survey_custom_message')
    .eq('salon_id', typedProfile.salon_id)
    .eq('active', true)
    .is('deleted_at', null)
    .order('category')
    .order('subcategory')
    .order('name')

  if (error) throw error

  return NextResponse.json({ services: (services ?? []) as ServiceSurveyConfig[] })
})
