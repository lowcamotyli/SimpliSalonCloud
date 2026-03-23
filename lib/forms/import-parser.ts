import type { NormalizedSource } from './import-source-normalizer.ts'
import type {
  DataCategory,
  ImportArtifact,
  ImportFormField,
} from './import-types.ts'
import {
  detectFieldType,
  normalizeOptions,
  splitCollapsedOptionLine,
} from './import-option-normalizer.ts'
import { FIELD_MAP, type FieldMapEntry } from './import-field-map.ts'
import { DYNAMIC_GDPR_TEMPLATE } from './gdpr.ts'

const GENERAL_CATEGORIES = new Set([
  'FRYZJERSTWO',
  'PIELEGNACJA',
  'PIEL\u0118GNACJA',
  'OPALANIE',
  'MAKIJAZ',
  'MAKIJA\u017b',
  'OPRAWA',
])

const SENSITIVE_CATEGORIES = new Set([
  'MEDYCYNA',
  'HI-TECH',
  'TATUAZ',
  'TATUA\u017b',
  'PIERCING',
])

const POLISH_CHAR_MAP: Record<string, string> = {
  '\u0105': 'a',
  '\u0107': 'c',
  '\u0119': 'e',
  '\u0142': 'l',
  '\u0144': 'n',
  '\u00f3': 'o',
  '\u015b': 's',
  '\u017a': 'z',
  '\u017c': 'z',
}

function normalizeForMatching(value: string): string {
  return value
    .toLowerCase()
    .replace(
      /[\u0105\u0107\u0119\u0142\u0144\u00f3\u015b\u017a\u017c]/g,
      (char) => POLISH_CHAR_MAP[char] ?? char
    )
}

function matchFieldMapEntry(label: string): FieldMapEntry | undefined {
  const normalized = normalizeForMatching(label)
  return FIELD_MAP.find((entry) =>
    entry.labelPatterns.some((pattern) => normalized.includes(pattern))
  )
}

function slugifyLabel(label: string): string {
  const slug = normalizeForMatching(label)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
    .replace(/^_+|_+$/g, '')

  return slug || 'field'
}

function isQuestionLine(lines: string[], index: number): boolean {
  const line = lines[index]?.trim() ?? ''

  if (!line) {
    return false
  }

  if (line.endsWith('?')) {
    return true
  }

  if (isLikelyFollowUpField(line)) {
    return true
  }

  if (line.length >= 150) {
    return false
  }

  const nextLine = lines[index + 1]?.trim() ?? ''
  return Boolean(nextLine) && nextLine.length < 60 && !nextLine.endsWith('?')
}

function isConditionalPrompt(label: string): boolean {
  const normalized = normalizeForMatching(label.trim())
  return /^(jesli|jes)\s+tak|^if\s+(yes|no|none|so)\b|^if\s+you\b/.test(
    normalized
  )
}

function isLikelyFollowUpField(label: string): boolean {
  const normalized = normalizeForMatching(label.trim())
  return /^(jesli|jes)\b|^if\b|^pros\b|^please\b|^additional information|^dodatkowe informacje|^uwagi dodatkowe/.test(
    normalized
  )
}

function extractGdprConsent(legalText: string): string | undefined {
  const firstParagraph = legalText.split('\n\n')[0]?.trim() ?? ''

  if (!firstParagraph) {
    return undefined
  }

  return firstParagraph.slice(0, 800)
}

function getAffirmativeOptionValue(field: ImportFormField): string {
  const options = field.options ?? []
  const affirmativeOption = options.find((option) =>
    /^(tak|yes|oui|si|ja|true)$/i.test(option.trim())
  )

  return affirmativeOption ?? 'Tak'
}

function buildField(
  label: string,
  rawOptions: string[],
  previousField?: ImportFormField,
  usedIds?: Set<string>
): ImportFormField {
  const options = normalizeOptions(rawOptions)
  const normalizedLabel = normalizeForMatching(label)
  const mapEntry = matchFieldMapEntry(label)

  let baseId = mapEntry ? mapEntry.id : slugifyLabel(label)
  let fieldId = baseId
  if (usedIds) {
    let counter = 2
    while (usedIds.has(fieldId)) {
      fieldId = baseId + '_' + counter
      counter += 1
    }
    usedIds.add(fieldId)
  }

  const field: ImportFormField = {
    id: fieldId,
    type: mapEntry ? mapEntry.type : detectFieldType(label, options),
    label,
    required: mapEntry
      ? mapEntry.required
      : ['full_name', 'phone'].includes(fieldId) || /imie.*nazwisko|nr telefonu/i.test(normalizedLabel),
    isHealthField: mapEntry
      ? mapEntry.isHealthField
      : /alergi|uczu|lek[i ]|przyjmuje lek|ciaz|ciezarn|chorob|leczeni|hormon|tarczyc/i.test(normalizedLabel),
    isSensitiveField: mapEntry
      ? mapEntry.isSensitiveField
      : /nowotwor|rak\b|rozrusznik|krzepni|chemioter|hiv|wirusow|epilepsj/i.test(normalizedLabel),
  }

  if (options.length > 0) {
    field.options = options
  }

  if (previousField && isConditionalPrompt(normalizedLabel)) {
    field.conditionalShowIf = {
      fieldId: previousField.id,
      value: getAffirmativeOptionValue(previousField),
    }
  }

  return field
}

function parseFields(questionsText: string): ImportFormField[] {
  const lines = questionsText.split('\n')
  const fields: ImportFormField[] = []
  const usedIds = new Set<string>()

  for (let index = 0; index < lines.length; index += 1) {
    const label = lines[index]?.trim() ?? ''

    if (!isQuestionLine(lines, index)) {
      continue
    }

    const rawOptions: string[] = []
    let nextIndex = index + 1

    while (nextIndex < lines.length) {
      const optionLine = lines[nextIndex]?.trim() ?? ''

      if (!optionLine) {
        break
      }

      const splitOptions = splitCollapsedOptionLine(optionLine)
      const shouldTreatAsOptionLine =
        splitOptions.length > 1 ||
        (splitOptions.length === 1 &&
          optionLine.length < 60 &&
          !optionLine.endsWith('?') &&
          !isLikelyFollowUpField(optionLine))

      if (!shouldTreatAsOptionLine) {
        break
      }

      rawOptions.push(...splitOptions)
      nextIndex += 1
    }

    const previousField = fields[fields.length - 1]
    fields.push(buildField(label, rawOptions, previousField, usedIds))
    index = nextIndex - 1
  }

  return fields
}

function determineDataCategory(
  category: string,
  healthFieldCount: number,
  sensitiveFieldCount: number
): DataCategory {
  const normalizedCategory = category.toUpperCase()

  if (
    SENSITIVE_CATEGORIES.has(normalizedCategory) ||
    sensitiveFieldCount > 2
  ) {
    return 'sensitive_health'
  }

  if (
    GENERAL_CATEGORIES.has(normalizedCategory) &&
    healthFieldCount === 0
  ) {
    return 'general'
  }

  return 'health'
}

function calculateConfidence(
  fields: ImportFormField[],
  hasRodoMarker: boolean
): number {
  let fieldMapMatchCount = 0
  for (const field of fields) {
    if (matchFieldMapEntry(field.label)) {
      fieldMapMatchCount += 1
    }
  }
  let confidence = Math.min(0.95, 0.5 + fieldMapMatchCount * 0.1)

  if (hasRodoMarker) {
    confidence += 0.1
  }

  if (fields.length > 5) {
    confidence += 0.1
  }

  return Math.min(confidence, 0.95)
}

export function parseNormalizedSource(
  normalized: NormalizedSource,
  opts?: { strictMode?: boolean }
): ImportArtifact {
  const fields = parseFields(normalized.questionsText)
  const gdprConsent = extractGdprConsent(normalized.legalText)
  const healthFieldCount = fields.filter((field) => field.isHealthField).length
  const sensitiveFieldCount = fields.filter(
    (field) => field.isSensitiveField
  ).length
  const dataCategory = determineDataCategory(
    normalized.category,
    healthFieldCount,
    sensitiveFieldCount
  )
  const confidence = calculateConfidence(fields, normalized.hasRodoMarker)
  const needsManualReview = confidence < 0.7 || sensitiveFieldCount > 0
  const serviceMatchers = [
    normalized.category.toLowerCase(),
    normalized.serviceName,
  ].filter((value): value is string => Boolean(value))

  if (opts?.strictMode && fields.length === 0) {
    throw new Error('No importable fields detected in normalized source.')
  }

  return {
    version: 1,
    source: {
      preferredFile: normalized.fileName,
      language: normalized.language,
      category: normalized.category,
      serviceName: normalized.serviceName,
    },
    extraction: {
      title: normalized.headerText || normalized.serviceName,
      questionBlocks: [normalized.questionsText],
      legalBlocks: normalized.legalText ? [normalized.legalText] : [],
      warnings: normalized.warnings,
    },
    structure: {
      sections: [{ title: 'Pytania', fields }],
      consents: gdprConsent ? [gdprConsent] : [],
      signatureRequired: true,
    },
    compliance: {
      dataCategory,
      healthFieldCount,
      sensitiveFieldCount,
      requiresHealthConsent: dataCategory !== 'general',
      reviewRequired: needsManualReview,
      reviewNotes: [],
    },
    templateDraft: {
      name: normalized.serviceName || normalized.category,
      description: 'Zaimportowane z biblioteki kart zabiegowych',
      data_category: dataCategory,
      requires_signature: true,
      gdpr_consent_text: gdprConsent ? DYNAMIC_GDPR_TEMPLATE : undefined,
      is_active: false,
      fields,
    },
    mapping: {
      serviceMatchers,
      confidence,
      needsManualReview,
    },
  }
}
