import type { FieldType, FormField } from '../../types/forms.ts'

export type DataCategory = 'general' | 'health' | 'sensitive_health'

export type ImportStatus = 'draft' | 'review_required' | 'approved' | 'rejected'

export type SupportedFieldType = FieldType

export interface ComplianceInfo {
  dataCategory: DataCategory
  healthFieldCount: number
  sensitiveFieldCount: number
  requiresHealthConsent: boolean
  reviewRequired: boolean
  reviewNotes: string[]
}

export interface ImportFormField extends FormField {
  isHealthField?: boolean
  isSensitiveField?: boolean
  blockImport?: boolean
}

export interface ImportFormTemplate {
  id?: string
  name: string
  description?: string
  data_category: DataCategory
  requires_signature: boolean
  gdpr_consent_text?: string
  is_active?: boolean
  fields: ImportFormField[]
}

export interface BuiltinFormTemplate extends ImportFormTemplate {}

export interface SourceInfo {
  preferredFile?: string
  fallbackFile?: string
  language: string
  category: string
  serviceName: string
}

export interface ExtractionResult {
  title: string
  intro?: string
  questionBlocks: string[]
  legalBlocks: string[]
  warnings: string[]
}

export interface FormStructure {
  sections: Array<{
    title: string
    fields: ImportFormField[]
  }>
  consents: string[]
  signatureRequired: boolean
}

export interface MappingInfo {
  serviceMatchers: string[]
  confidence: number
  needsManualReview: boolean
}

export interface ImportArtifact {
  version: 1
  source: SourceInfo
  extraction: ExtractionResult
  structure: FormStructure
  compliance: ComplianceInfo
  templateDraft: ImportFormTemplate
  mapping: MappingInfo
  approved?: boolean
  rejected?: boolean
}
