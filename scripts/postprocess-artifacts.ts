/**
 * Usage:
 *   npx ts-node scripts/postprocess-artifacts.ts [--dry-run] [--verbose]
 */

import { readFile, readdir, writeFile } from 'fs/promises'
import * as path from 'path'
import { fileURLToPath } from 'url'

interface ExtractionResult {
  title: string
  intro?: string
  questionBlocks: string[]
  legalBlocks: string[]
  warnings: string[]
}

interface ImportFormField {
  id: string
  type: string
  label: string
  required: boolean
  isHealthField?: boolean
  isSensitiveField?: boolean
  options?: string[]
  conditionalShowIf?: string
}

interface ImportArtifact {
  version: 1
  source: {
    preferredFile?: string
    fallbackFile?: string
    language: string
    category: string
    serviceName: string
  }
  extraction: ExtractionResult
  structure: {
    sections: Array<{ title: string; fields: ImportFormField[] }>
    consents: string[]
    signatureRequired: boolean
  }
  compliance: {
    dataCategory: string
    healthFieldCount: number
    sensitiveFieldCount: number
    requiresHealthConsent: boolean
    reviewRequired: boolean
    reviewNotes: string[]
  }
  templateDraft: {
    id?: string
    name: string
    description?: string
    data_category: string
    requires_signature: boolean
    gdpr_consent_text?: string
    is_active?: boolean
    fields: ImportFormField[]
  }
  mapping: { serviceMatchers: string[]; confidence: number; needsManualReview: boolean }
  approved?: boolean
  rejected?: boolean
}

interface ReportJson {
  warning_counts?: { total: number; by_message: Record<string, number> }
  [key: string]: unknown
}

type CliOptions = {
  dryRun: boolean
  verbose: boolean
}

type StoredImportFormField = ImportFormField & {
  conditionalShowIf?: string | { fieldId: string; value: string }
}

type StoredImportArtifact = Omit<ImportArtifact, 'structure' | 'templateDraft'> & {
  structure: {
    sections: Array<{ title: string; fields: StoredImportFormField[] }>
    consents: string[]
    signatureRequired: boolean
  }
  templateDraft: Omit<ImportArtifact['templateDraft'], 'fields'> & {
    fields: StoredImportFormField[]
  }
}

type ArtifactChangeSummary = {
  slug: string
  warningRemoved: boolean
  optionsNormalized: number
}

const WARNING_LONG_LINE = 'Wykryto linie dluzsza niz 300 znakow.'
const EXCLUDED_FILES = new Set(['report.json', 'compliance-review-summary.json'])
const OPTION_NORMALIZATIONS = new Map<string, string>([
  ['tak', 'Tak'],
  ['nie', 'Nie'],
  ['nie dotyczy', 'Nie dotyczy'],
])
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    dryRun: false,
    verbose: false,
  }

  for (const arg of argv) {
    if (arg === '--dry-run') {
      options.dryRun = true
      continue
    }

    if (arg === '--verbose') {
      options.verbose = true
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  return options
}

async function listArtifactFiles(artifactDir: string): Promise<string[]> {
  const entries = await readdir(artifactDir, { withFileTypes: true })

  return entries
    .filter(
      (entry) =>
        entry.isFile() &&
        path.extname(entry.name).toLowerCase() === '.json' &&
        !EXCLUDED_FILES.has(entry.name)
    )
    .map((entry) => path.join(artifactDir, entry.name))
    .sort((left, right) => left.localeCompare(right))
}

function hasLongQuestionLine(extraction: ExtractionResult): boolean {
  const joined = extraction.questionBlocks.join('\n')

  return joined.split(/\r?\n/).some((line) => line.length > 300)
}

function removeFalsePositiveWarning(artifact: StoredImportArtifact): boolean {
  if (!artifact.extraction.warnings.includes(WARNING_LONG_LINE)) {
    return false
  }

  if (hasLongQuestionLine(artifact.extraction)) {
    return false
  }

  const nextWarnings = artifact.extraction.warnings.filter(
    (warning) => warning !== WARNING_LONG_LINE
  )

  if (nextWarnings.length === artifact.extraction.warnings.length) {
    return false
  }

  artifact.extraction.warnings = nextWarnings
  return true
}

function normalizeOption(option: string): string {
  const trimmed = option.trim()
  const normalized = OPTION_NORMALIZATIONS.get(trimmed.toLowerCase())

  return normalized ?? trimmed
}

function normalizeFieldOptions(field: StoredImportFormField): number {
  if (!field.options || field.options.length === 0) {
    return 0
  }

  const seen = new Set<string>()
  const normalizedOptions: string[] = []
  let changes = 0

  for (const originalOption of field.options) {
    const normalizedOption = normalizeOption(originalOption)

    if (normalizedOption !== originalOption) {
      changes += 1
    }

    const dedupeKey = normalizedOption.toLowerCase()

    if (seen.has(dedupeKey)) {
      changes += 1
      continue
    }

    seen.add(dedupeKey)
    normalizedOptions.push(normalizedOption)
  }

  if (changes > 0) {
    field.options = normalizedOptions
  }

  return changes
}

function normalizeArtifactOptions(artifact: StoredImportArtifact): number {
  let changes = 0

  for (const field of artifact.templateDraft.fields) {
    changes += normalizeFieldOptions(field)
  }

  return changes
}

function buildWarningCounts(artifacts: StoredImportArtifact[]): ReportJson['warning_counts'] {
  const byMessage: Record<string, number> = {}
  let total = 0

  for (const artifact of artifacts) {
    for (const warning of artifact.extraction.warnings) {
      byMessage[warning] = (byMessage[warning] ?? 0) + 1
      total += 1
    }
  }

  return { total, by_message: byMessage }
}

function describeChanges(change: ArtifactChangeSummary): string {
  const parts: string[] = []

  if (change.warningRemoved) {
    parts.push('warning removed')
  }

  if (change.optionsNormalized > 0) {
    parts.push(`options normalized: ${change.optionsNormalized}`)
  }

  return parts.join('; ')
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const artifactDir = path.resolve(SCRIPT_DIR, '../generated/form-templates')
  const reportPath = path.join(artifactDir, 'report.json')
  const artifactPaths = await listArtifactFiles(artifactDir)
  const processedArtifacts: StoredImportArtifact[] = []
  const changes: ArtifactChangeSummary[] = []
  const mediumConfidenceCards: Array<{
    slug: string
    confidence: number
    language: string
    fieldCount: number
  }> = []

  let warningRemovedCount = 0
  let artifactsWithOptionsNormalized = 0
  let totalOptionsChanged = 0

  for (const artifactPath of artifactPaths) {
    const fileName = path.basename(artifactPath)
    const slug = path.basename(fileName, '.json')

    if (options.verbose) {
      console.log(`Processing ${fileName}`)
    }

    const rawArtifact = await readFile(artifactPath, 'utf8')
    const artifact = JSON.parse(rawArtifact) as StoredImportArtifact
    const warningRemoved = removeFalsePositiveWarning(artifact)
    const optionsNormalized = normalizeArtifactOptions(artifact)

    processedArtifacts.push(artifact)

    if (artifact.mapping.confidence < 0.7) {
      mediumConfidenceCards.push({
        slug,
        confidence: artifact.mapping.confidence,
        language: artifact.source.language,
        fieldCount: artifact.templateDraft.fields.length,
      })
    }

    if (warningRemoved) {
      warningRemovedCount += 1
    }

    if (optionsNormalized > 0) {
      artifactsWithOptionsNormalized += 1
      totalOptionsChanged += optionsNormalized
    }

    if (warningRemoved || optionsNormalized > 0) {
      changes.push({
        slug,
        warningRemoved,
        optionsNormalized,
      })
    }

    if (!options.dryRun && (warningRemoved || optionsNormalized > 0)) {
      await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8')
    }
  }

  const rawReport = await readFile(reportPath, 'utf8')
  const report = JSON.parse(rawReport) as ReportJson
  const nextWarningCounts = buildWarningCounts(processedArtifacts)
  const reportChanged =
    JSON.stringify(report.warning_counts ?? null) !== JSON.stringify(nextWarningCounts)

  report.warning_counts = nextWarningCounts

  if (!options.dryRun && reportChanged) {
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  }

  console.log(`Total artifacts processed: ${artifactPaths.length}`)
  console.log(`Artifacts with warning removed: ${warningRemovedCount}`)
  console.log(
    `Artifacts with options normalized: ${artifactsWithOptionsNormalized} (total options changed: ${totalOptionsChanged})`
  )

  console.log('MEDIUM CONFIDENCE CARDS (confidence < 0.7):')
  if (mediumConfidenceCards.length === 0) {
    console.log('(none)')
  } else {
    for (const card of mediumConfidenceCards) {
      console.log(
        `- ${card.slug} | confidence=${card.confidence.toFixed(2)} | language=${card.language} | fieldCount=${card.fieldCount}`
      )
    }
  }

  console.log('CHANGES SUMMARY:')
  if (changes.length === 0) {
    console.log('(none)')
  } else {
    for (const change of changes) {
      console.log(`- ${change.slug}: ${describeChanges(change)}`)
    }
  }

  if (options.dryRun && reportChanged) {
    console.log('Dry run: report.json warning_counts would be updated.')
  }

  console.log('Done. Run npx tsc --noEmit to verify types.')
}

main().catch(console.error)
