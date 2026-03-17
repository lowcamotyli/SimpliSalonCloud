import { mkdir, readFile, readdir, writeFile } from 'fs/promises'
import * as path from 'path'

import { parseNormalizedSource } from '../lib/forms/import-parser.ts'
import {
  normalizeSourceText,
  readSourceFile,
} from '../lib/forms/import-source-normalizer.ts'
import type { ImportArtifact } from '../lib/forms/import-types.ts'
import { validateArtifact } from '../lib/forms/import-validator.ts'

const ROOT = path.resolve(process.cwd())
const PRIMARY_SOURCE = path.join(ROOT, 'karty_zabiegowe', 'do_wysylki_klientom')
const FALLBACK_SOURCE = path.join(ROOT, 'karty_zabiegowe')
const OUTPUT_DIR = path.join(ROOT, 'generated', 'form-templates')

type Status = 'success' | 'review_required' | 'failed'

interface FileResult {
  slug: string
  file: string
  status: Status
  confidence: 'high' | 'medium' | 'low'
  dataCategory: string
  warningCount: number
  potentialHealthSensitiveFieldCount: number
  healthFieldCount: number
  sensitiveFieldCount: number
  errors?: string[]
}

interface ExistingArtifactMetadata {
  approved?: boolean
  rejected?: boolean
}

function toSlug(fileName: string): string {
  return path
    .basename(fileName, '.md')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function confidenceLabel(value: number): 'high' | 'medium' | 'low' {
  if (value >= 0.8) return 'high'
  if (value >= 0.6) return 'medium'
  return 'low'
}

async function resolveSourceDir(): Promise<string> {
  try {
    const files = await readdir(PRIMARY_SOURCE)
    if (files.some((file) => file.endsWith('.md'))) {
      return PRIMARY_SOURCE
    }
  } catch {
    // Primary source missing or unreadable, fall back to the top-level directory.
  }

  return FALLBACK_SOURCE
}

async function main(): Promise<void> {
  const sourceDir = await resolveSourceDir()
  const mdFiles = (await readdir(sourceDir)).filter((file) => file.endsWith('.md')).sort()

  if (mdFiles.length === 0) {
    console.log('No .md files found in', sourceDir)
    return
  }

  await mkdir(OUTPUT_DIR, { recursive: true })

  const results: FileResult[] = []
  const warningCounts: Record<string, number> = {}
  const confidenceDistribution: Record<'high' | 'medium' | 'low', number> = {
    high: 0,
    medium: 0,
    low: 0,
  }

  let successCount = 0
  let reviewCount = 0
  let failedCount = 0
  let totalWarnings = 0
  let totalHealthFieldCount = 0
  let totalSensitiveFieldCount = 0
  let templatesWithPotentialHealthSensitiveFields = 0
  const existingMetadata = new Map<string, ExistingArtifactMetadata>()

  try {
    const existingFiles = (await readdir(OUTPUT_DIR)).filter((file) =>
      file.endsWith('.json')
    )

    for (const fileName of existingFiles) {
      if (fileName === 'report.json' || fileName === 'compliance-review-summary.json') {
        continue
      }

      const filePath = path.join(OUTPUT_DIR, fileName)
      try {
        const parsed = JSON.parse(
          await readFile(filePath, 'utf-8')
        ) as ExistingArtifactMetadata
        existingMetadata.set(fileName, {
          approved: parsed.approved,
          rejected: parsed.rejected,
        })
      } catch {
        // Ignore unreadable artifacts and rebuild them from source.
      }
    }
  } catch {
    // Output directory may not exist on first run.
  }

  for (const fileName of mdFiles) {
    const filePath = path.join(sourceDir, fileName)
    const slug = toSlug(fileName)

    try {
      const { raw } = await readSourceFile(filePath)
      const normalized = normalizeSourceText(raw, fileName)
      const artifact: ImportArtifact = parseNormalizedSource(normalized)
      const existing = existingMetadata.get(`${slug}.json`)
      if (existing?.approved === true) {
        artifact.approved = true
      }
      if (existing?.rejected === true) {
        artifact.rejected = true
      }
      const validation = validateArtifact(artifact)
      const confidence = confidenceLabel(artifact.mapping.confidence)
      const healthFieldCount = artifact.compliance.healthFieldCount
      const sensitiveFieldCount = artifact.compliance.sensitiveFieldCount
      const warningCount = artifact.extraction.warnings.length
      const potentialHealthSensitiveFieldCount =
        healthFieldCount + sensitiveFieldCount

      confidenceDistribution[confidence] += 1
      totalWarnings += warningCount
      totalHealthFieldCount += healthFieldCount
      totalSensitiveFieldCount += sensitiveFieldCount

      if (potentialHealthSensitiveFieldCount > 0) {
        templatesWithPotentialHealthSensitiveFields += 1
      }

      for (const warning of artifact.extraction.warnings) {
        warningCounts[warning] = (warningCounts[warning] ?? 0) + 1
      }

      if (!validation.success) {
        failedCount += 1
        results.push({
          slug,
          file: fileName,
          status: 'failed',
          confidence,
          dataCategory: artifact.compliance.dataCategory,
          warningCount,
          potentialHealthSensitiveFieldCount,
          healthFieldCount,
          sensitiveFieldCount,
          errors: validation.errors,
        })
        console.log(`FAIL  ${slug}`)
        continue
      }

      await writeFile(
        path.join(OUTPUT_DIR, `${slug}.json`),
        JSON.stringify(artifact, null, 2),
        'utf-8'
      )

      const status: Status = artifact.compliance.reviewRequired
        ? 'review_required'
        : 'success'

      if (status === 'review_required') {
        reviewCount += 1
      } else {
        successCount += 1
      }

      results.push({
        slug,
        file: fileName,
        status,
        confidence,
        dataCategory: artifact.compliance.dataCategory,
        warningCount,
        potentialHealthSensitiveFieldCount,
        healthFieldCount,
        sensitiveFieldCount,
      })
      console.log(`${status === 'review_required' ? 'REVIEW' : 'OK   '}  ${slug}`)
    } catch (error) {
      failedCount += 1
      results.push({
        slug,
        file: fileName,
        status: 'failed',
        confidence: 'low',
        dataCategory: 'unknown',
        warningCount: 0,
        potentialHealthSensitiveFieldCount: 0,
        healthFieldCount: 0,
        sensitiveFieldCount: 0,
        errors: [error instanceof Error ? error.message : String(error)],
      })
      confidenceDistribution.low += 1
      console.log(`FAIL  ${slug}`)
    }
  }

  const report = {
    source_dir: path.relative(ROOT, sourceDir).replace(/\\/g, '/'),
    total: mdFiles.length,
    success: successCount,
    review_required: reviewCount,
    failed: failedCount,
    warning_counts: {
      total: totalWarnings,
      by_message: warningCounts,
    },
    confidence_distribution: confidenceDistribution,
    potential_health_sensitive_field_counts: {
      total: totalHealthFieldCount + totalSensitiveFieldCount,
      health_fields: totalHealthFieldCount,
      sensitive_fields: totalSensitiveFieldCount,
      templates_with_potential_health_sensitive_fields:
        templatesWithPotentialHealthSensitiveFields,
    },
    files: results.sort((left, right) => left.slug.localeCompare(right.slug)),
  }

  await writeFile(
    path.join(OUTPUT_DIR, 'report.json'),
    JSON.stringify(report, null, 2),
    'utf-8'
  )

  console.log(
    `Done: ${successCount} OK, ${reviewCount} REVIEW, ${failedCount} FAIL`
  )
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
