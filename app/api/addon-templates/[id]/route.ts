import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandling } from '@/lib/error-handler'
import { NotFoundError } from '@/lib/errors'
import { getAuthContext } from '@/lib/supabase/get-auth-context'

export const DELETE = withErrorHandling(async (
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> => {
  const { id } = await params
  const { supabase, salonId } = await getAuthContext()

  const { data: existingTemplate, error: existingTemplateError } = await supabase
    .from('addon_templates')
    .select('id')
    .eq('id', id)
    .eq('salon_id', salonId)
    .maybeSingle()

  if (existingTemplateError) throw existingTemplateError

  if (!existingTemplate) {
    throw new NotFoundError('Addon template', id)
  }

  const { error } = await supabase
    .from('addon_templates')
    .delete()
    .eq('id', id)
    .eq('salon_id', salonId)

  if (error) throw error

  return NextResponse.json({ success: true })
})
