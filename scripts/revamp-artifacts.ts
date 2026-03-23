/**
 * Usage:
 *   npx ts-node scripts/revamp-artifacts.ts [--dry-run] [--verbose]
 */

import { readFile, readdir, writeFile } from 'fs/promises'
import * as path from 'path'
import { fileURLToPath } from 'url'
import {
  containsLegacyGdprData,
  DYNAMIC_GDPR_TEMPLATE,
} from '../lib/forms/gdpr.ts'

interface ImportArtifact {
  version: 1
  source: {
    preferredFile?: string
    fallbackFile?: string
    language: string
    category: string
    serviceName: string
  }
  extraction: {
    title: string
    questionBlocks: string[]
    legalBlocks: string[]
    warnings: string[]
  }
  structure: {
    sections: unknown[]
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
    fields: unknown[]
  }
  mapping: { serviceMatchers: string[]; confidence: number; needsManualReview: boolean }
  approved?: boolean
  rejected?: boolean
}

interface ReportFile {
  slug: string
  file: string
  displayName?: string
  status: string
  confidence: string | number
  dataCategory: string
  warningCount: number
  potentialHealthSensitiveFieldCount: number
  healthFieldCount: number
  sensitiveFieldCount: number
}

interface ReportJson {
  files?: ReportFile[]
  [key: string]: unknown
}

type CliOptions = {
  dryRun: boolean
  verbose: boolean
}

type NameChangeSummary = {
  slug: string
  oldName: string
  newName: string
}

const NAME_OVERRIDES: Record<string, string> = {
  'dr-n-med-izabela-za-eska-mezoterapia-z-publikacji-mezoterapia-w-praktyce': 'Mezoterapia',
  'dr-n-med-izabela-za-eska-stymulatory-z-publikacji-stymulatory-tkankowe-w-medycynie-estetycznej':
    'Stymulatory tkankowe',
  'kosmetologia-liralift': 'LiraLift',
  'kosmetologia-liralux': 'LiraLux',
  'kosmetologia-medestelle-autorski-zabieg': 'MedEstelle - autorski zabieg',
  'kosmetologia-medestelle-zabieg-z-mikro-i-nanonak-uwaniem':
    'MedEstelle - zabieg z mikro- i nanonakluwaniem',
  'kosmetologia-retinolift-dermaquest': 'RetinoLift Dermaquest',
}

const EXCLUDED_FILES = new Set(['report.json', 'compliance-review-summary.json'])
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

function deriveNameFromFile(preferredFile: string): string | null {
  const basename = preferredFile.replace(/\.md$/i, '')
  const [, ...nameParts] = basename.split('_')
  const derivedName = nameParts.join(' ').replace(/\s+/g, ' ').trim()

  if (derivedName.length < 3) {
    return null
  }

  return derivedName
}

function cleanName(currentName: string, slug: string, preferredFile: string | undefined): string {
  const overrideName = NAME_OVERRIDES[slug]

  if (overrideName) {
    return overrideName
  }

  const trimmedCurrentName = currentName.trim()

  if (trimmedCurrentName.length < 8 && preferredFile) {
    const derivedName = deriveNameFromFile(preferredFile)

    if (derivedName !== null) {
      return derivedName
    }
  }

  return trimmedCurrentName
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const artifactDir = path.resolve(SCRIPT_DIR, '../generated/form-templates')
  const reportPath = path.join(artifactDir, 'report.json')
  const artifactPaths = await listArtifactFiles(artifactDir)
  const slugToName = new Map<string, string>()
  const nameChanges: NameChangeSummary[] = []

  let totalProcessed = 0
  let namesFixed = 0
  let overridesUsed = 0
  let truncationFixes = 0
  let rodoReplaced = 0

  for (const artifactPath of artifactPaths) {
    const fileName = path.basename(artifactPath)
    const slug = path.basename(fileName, '.json')

    if (options.verbose) {
      console.log(`Processing ${fileName}`)
    }

    const rawArtifact = await readFile(artifactPath, 'utf8')
    const artifact = JSON.parse(rawArtifact) as ImportArtifact
    const originalTrimmedName = artifact.templateDraft.name.trim()
    const overrideName = NAME_OVERRIDES[slug]
    const shouldTryDerivedName = originalTrimmedName.length < 8 && !!artifact.source.preferredFile
    const derivedName = shouldTryDerivedName
      ? deriveNameFromFile(artifact.source.preferredFile as string)
      : null
    const cleanedName = cleanName(
      artifact.templateDraft.name,
      slug,
      artifact.source.preferredFile
    )
    const nameChanged = cleanedName !== originalTrimmedName

    artifact.templateDraft.name = cleanedName
    artifact.source.serviceName = cleanedName
    artifact.templateDraft.gdpr_consent_text = DYNAMIC_GDPR_TEMPLATE
    artifact.extraction.legalBlocks = artifact.extraction.legalBlocks.map((block) =>
      containsLegacyGdprData(block) ? DYNAMIC_GDPR_TEMPLATE : block
    )
    artifact.structure.consents = artifact.structure.consents.map((consent) =>
      containsLegacyGdprData(consent) ? DYNAMIC_GDPR_TEMPLATE : consent
    )

    slugToName.set(slug, cleanedName)
    totalProcessed += 1
    rodoReplaced += 1

    if (nameChanged) {
      namesFixed += 1
      nameChanges.push({
        slug,
        oldName: originalTrimmedName,
        newName: cleanedName,
      })

      if (overrideName) {
        overridesUsed += 1
      } else if (derivedName !== null) {
        truncationFixes += 1
      }
    }

    if (!options.dryRun) {
      await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8')
    }
  }

  const rawReport = await readFile(reportPath, 'utf8')
  const report = JSON.parse(rawReport) as ReportJson
  let reportDisplayNameAdded = 0

  if (Array.isArray(report.files)) {
    for (const entry of report.files) {
      const displayName = slugToName.get(entry.slug)

      if (!displayName) {
        continue
      }

      if (entry.displayName !== displayName) {
        reportDisplayNameAdded += 1
      }

      entry.displayName = displayName
    }
  }

  if (!options.dryRun) {
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  }

  console.log(`Total processed: ${totalProcessed}`)
  console.log(`Names fixed: ${namesFixed} (overrides: ${overridesUsed}, truncation fixes: ${truncationFixes})`)
  console.log(`RODO replaced: ${rodoReplaced}/${totalProcessed}`)
  console.log(`report.json displayName added: ${reportDisplayNameAdded}`)

  for (const change of nameChanges) {
    console.log(`  ${change.slug}: ${change.oldName} -> ${change.newName}`)
  }

  if (options.dryRun) {
    console.log('[dry-run] No files were written.')
  }

  console.log('Done. Run npx tsc --noEmit to verify.')
}

main().catch(console.error)
