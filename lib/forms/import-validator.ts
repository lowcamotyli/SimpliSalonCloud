import { z } from 'zod'

import type {
  ImportArtifact,
} from './import-types.ts'

export const zDataCategory = z.enum(['general', 'health', 'sensitive_health'])

export const zImportStatus = z.enum([
  'draft',
  'review_required',
  'approved',
  'rejected',
])

export const zFormField = z.object({
  id: z.string(),
  type: z.string(),
  label: z.string(),
  required: z.boolean(),
  options: z.array(z.string()).optional(),
  helpText: z.string().optional(),
  placeholder: z.string().optional(),
  conditionalShowIf: z
    .object({
      fieldId: z.string(),
      value: z.string(),
    })
    .optional(),
})

export const zImportFormField = zFormField.extend({
  isHealthField: z.boolean().optional(),
  isSensitiveField: z.boolean().optional(),
  blockImport: z.boolean().optional(),
})

export const zComplianceInfo = z.object({
  dataCategory: zDataCategory,
  healthFieldCount: z.number(),
  sensitiveFieldCount: z.number(),
  requiresHealthConsent: z.boolean(),
  reviewRequired: z.boolean(),
  reviewNotes: z.array(z.string()),
})

export const zSourceInfo = z.object({
  preferredFile: z.string().optional(),
  fallbackFile: z.string().optional(),
  language: z.string(),
  category: z.string(),
  serviceName: z.string(),
})

export const zExtractionResult = z.object({
  title: z.string(),
  intro: z.string().optional(),
  questionBlocks: z.array(z.string()),
  legalBlocks: z.array(z.string()),
  warnings: z.array(z.string()),
})

export const zImportFormTemplate = z.object({
  id: z.string().optional(),
  name: z.string(),
  description: z.string().optional(),
  data_category: zDataCategory,
  requires_signature: z.boolean(),
  gdpr_consent_text: z.string().optional(),
  is_active: z.boolean().optional(),
  fields: z.array(zImportFormField),
})

const zFormSection = z.object({
  title: z.string(),
  fields: z.array(zImportFormField),
})

export const zFormStructure = z.object({
  sections: z.array(zFormSection),
  consents: z.array(z.string()),
  signatureRequired: z.boolean(),
})

export const zMappingInfo = z.object({
  serviceMatchers: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  needsManualReview: z.boolean(),
})

export const zImportArtifact = z.object({
  version: z.literal(1),
  source: zSourceInfo,
  extraction: zExtractionResult,
  structure: zFormStructure,
  compliance: zComplianceInfo,
  templateDraft: zImportFormTemplate,
  mapping: zMappingInfo,
})

export function validateArtifact(
  data: unknown
): { success: boolean; data?: ImportArtifact; errors?: string[] } {
  const result = zImportArtifact.safeParse(data)

  if (result.success) {
    return {
      success: true,
      data: result.data as ImportArtifact,
    }
  }

  return {
    success: false,
    errors: result.error.issues.map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : 'root'
      return `${path}: ${issue.message}`
    }),
  }
}
