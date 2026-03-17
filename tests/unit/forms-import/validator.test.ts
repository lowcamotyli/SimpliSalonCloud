import { describe, expect, it } from 'vitest'

import { validateArtifact } from '../../../lib/forms/import-validator'
import type { ImportArtifact } from '../../../lib/forms/import-types'

describe('validateArtifact', () => {
  const minimalArtifact: ImportArtifact = {
    version: 1,
    source: {
      language: 'pl',
      category: 'FRYZJERSTWO',
      serviceName: 'Koloryzacja',
    },
    extraction: {
      title: 'Karta: Koloryzacja',
      questionBlocks: [],
      legalBlocks: [],
      warnings: [],
    },
    structure: {
      sections: [],
      consents: [],
      signatureRequired: false,
    },
    compliance: {
      dataCategory: 'general',
      healthFieldCount: 0,
      sensitiveFieldCount: 0,
      requiresHealthConsent: false,
      reviewRequired: false,
      reviewNotes: [],
    },
    templateDraft: {
      name: 'Koloryzacja',
      data_category: 'general',
      requires_signature: false,
      fields: [],
    },
    mapping: {
      serviceMatchers: ['koloryzacja'],
      confidence: 0.9,
      needsManualReview: false,
    },
  }

  it('returns success for a valid minimal artifact', () => {
    const result = validateArtifact(minimalArtifact)

    expect(result.success).toBe(true)
    expect(result.data).toBeDefined()
  })

  it('returns errors when version is missing', () => {
    const { version: _version, ...artifactWithoutVersion } = minimalArtifact

    const result = validateArtifact(artifactWithoutVersion)

    expect(result.success).toBe(false)
    expect(result.errors && result.errors.length > 0).toBe(true)
  })

  it('returns failure for an invalid compliance data category', () => {
    const invalidArtifact = {
      ...minimalArtifact,
      compliance: {
        ...minimalArtifact.compliance,
        dataCategory: 'unknown',
      },
    }

    const result = validateArtifact(invalidArtifact)

    expect(result.success).toBe(false)
  })

  it('returns failure when confidence is outside the 0-1 range', () => {
    const invalidArtifact = {
      ...minimalArtifact,
      mapping: {
        ...minimalArtifact.mapping,
        confidence: 1.5,
      },
    }

    const result = validateArtifact(invalidArtifact)

    expect(result.success).toBe(false)
  })

  it('returns parsed data structurally equal to the input for a valid artifact', () => {
    const result = validateArtifact(minimalArtifact)

    expect(result.success).toBe(true)
    expect(result.data).toEqual(minimalArtifact)
  })

  it('accepts templateDraft fields with optional blockImport', () => {
    const artifactWithBlockImport: ImportArtifact = {
      ...minimalArtifact,
      templateDraft: {
        ...minimalArtifact.templateDraft,
        fields: [
          {
            id: 'field-1',
            type: 'text',
            label: 'Uwagi',
            required: false,
            blockImport: true,
          },
        ],
      },
    }

    const result = validateArtifact(artifactWithBlockImport)

    expect(result.success).toBe(true)
  })

  it('accepts an empty templateDraft fields array', () => {
    const result = validateArtifact({
      ...minimalArtifact,
      templateDraft: {
        ...minimalArtifact.templateDraft,
        fields: [],
      },
    })

    expect(result.success).toBe(true)
  })
})
