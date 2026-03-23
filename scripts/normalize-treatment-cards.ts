/**
 * Usage:
 *   npx ts-node scripts/normalize-treatment-cards.ts [--output normalized.json]
 */

import { readdir, writeFile } from 'fs/promises'
import * as path from 'path'

import {
  readSourceFile,
  normalizeSourceText,
  NormalizedSource,
} from '../lib/forms/import-source-normalizer'

type CliOptions = {
  outputPath?: string
}

async function listMarkdownFiles(dirPath: string): Promise<string[]> {
  const entries = await readdir(dirPath, { withFileTypes: true })

  return entries
    .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === '.md')
    .map((entry) => path.join(dirPath, entry.name))
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {}

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--output') {
      const nextArg = argv[index + 1]

      if (!nextArg || nextArg.startsWith('--')) {
        throw new Error('Missing value for --output flag.')
      }

      options.outputPath = nextArg
      index += 1
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  return options
}

async function collectInputFiles(projectRoot: string): Promise<string[]> {
  const preferredDir = path.join(
    projectRoot,
    'karty_zabiegowe',
    'do_wysylki_klientom'
  )
  const fallbackDir = path.join(projectRoot, 'karty_zabiegowe')

  const preferredFiles = await listMarkdownFiles(preferredDir)
  const seenBaseNames = new Set(
    preferredFiles.map((filePath) => path.basename(filePath).toLowerCase())
  )
  const fallbackFiles = await listMarkdownFiles(fallbackDir)
  const dedupedFallbackFiles = fallbackFiles.filter(
    (filePath) => !seenBaseNames.has(path.basename(filePath).toLowerCase())
  )

  return [...preferredFiles, ...dedupedFallbackFiles]
}

function logNormalizedSource(source: NormalizedSource): void {
  console.error(
    `[${source.fileName}] category="${source.category}" serviceName="${source.serviceName}" warnings=${source.warnings.length}`
  )

  for (const warning of source.warnings) {
    console.error(`  warning: ${warning}`)
  }
}

function buildReadErrorResult(filePath: string, error: unknown): NormalizedSource {
  const fileName = path.basename(filePath)
  const message = error instanceof Error ? error.message : String(error)
  const warning = `Failed to read source file: ${message}`

  return {
    fileName,
    category: '',
    serviceName: path.parse(fileName).name,
    language: 'pl',
    headerText: '',
    questionsText: '',
    legalText: '',
    hasRodoMarker: false,
    warnings: [warning],
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const projectRoot = process.cwd()
  const files = await collectInputFiles(projectRoot)
  const normalizedSources: NormalizedSource[] = []

  for (const filePath of files) {
    try {
      const source = await readSourceFile(filePath)
      const normalized = normalizeSourceText(source.raw, filePath)
      normalizedSources.push(normalized)
      logNormalizedSource(normalized)
    } catch (error) {
      const fallbackResult = buildReadErrorResult(filePath, error)
      normalizedSources.push(fallbackResult)
      logNormalizedSource(fallbackResult)
    }
  }

  const output = `${JSON.stringify(normalizedSources, null, 2)}\n`

  if (options.outputPath) {
    const outputPath = path.resolve(projectRoot, options.outputPath)
    await writeFile(outputPath, output, 'utf8')
    return
  }

  process.stdout.write(output)
}

main().catch(console.error)
