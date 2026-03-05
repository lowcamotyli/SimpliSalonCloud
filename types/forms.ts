export type FieldType =
  | 'text'
  | 'textarea'
  | 'checkbox'
  | 'radio'
  | 'select'
  | 'date'
  | 'signature'
  | 'photo_upload'
  | 'section_header'

export interface FormField {
  id: string
  type: FieldType
  label: string
  placeholder?: string
  required: boolean
  options?: string[]
  helpText?: string
  conditionalShowIf?: {
    fieldId: string
    value: string
  }
}

export interface FormTemplate {
  id: string
  salon_id: string
  name: string
  description?: string
  fields: FormField[]
  requires_signature: boolean
  gdpr_consent_text?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ClientForm {
  id: string
  client_id: string
  booking_id?: string | null
  form_template_id: string
  signature_url?: string | null
  signed_at?: string | null
  submitted_at?: string | null
  fill_token?: string | null
  fill_token_exp?: string | null
  created_at: string
}

export interface BeautyPlan {
  id: string
  client_id: string
  created_by?: string | null
  title: string
  description?: string | null
  status: 'active' | 'completed' | 'abandoned'
  created_at: string
  updated_at: string
}

export interface BeautyPlanStep {
  id: string
  plan_id: string
  service_id?: string | null
  booking_id?: string | null
  planned_date?: string | null
  notes?: string | null
  step_order: number
  is_completed: boolean
  created_at: string
}
