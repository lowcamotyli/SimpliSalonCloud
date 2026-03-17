// server-only

import { createAdminSupabaseClient } from '@/lib/supabase/admin'

type LogHealthDataAccessParams = {
  salonId: string
  accessedBy: string
  accessedByRole: string
  resourceType: 'form_response' | 'treatment_record' | 'treatment_photo'
  resourceId: string
  clientId?: string
  dataCategory: 'health' | 'sensitive_health'
  action: 'decrypt' | 'view' | 'export'
  ipAddress?: string
  userAgent?: string
}

export async function logHealthDataAccess(
  params: LogHealthDataAccessParams
): Promise<void> {
  try {
    const supabase = createAdminSupabaseClient()

    const { error } = await supabase.from('health_data_access_logs').insert({
      salon_id: params.salonId,
      accessed_by: params.accessedBy,
      accessed_by_role: params.accessedByRole,
      resource_type: params.resourceType,
      resource_id: params.resourceId,
      client_id: params.clientId,
      data_category: params.dataCategory,
      action: params.action,
      ip_address: params.ipAddress,
      user_agent: params.userAgent
    })

    if (error) {
      console.error('Failed to log health data access', error)
    }
  } catch (error) {
    console.error('Failed to log health data access', error)
  }
}
