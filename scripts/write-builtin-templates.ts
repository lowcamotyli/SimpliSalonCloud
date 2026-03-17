import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

import type {
  DataCategory,
  ImportArtifact,
  ImportFormField,
  ImportFormTemplate,
} from '../lib/forms/import-types.ts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PROJECT_ROOT = path.resolve(__dirname, '..')
const TEMPLATES_DIR = path.join(PROJECT_ROOT, 'generated', 'form-templates')
const BUILTIN_FILE = path.join(PROJECT_ROOT, 'lib', 'forms', 'builtin-templates.ts')
const SKIP_FILES = ['report.json', 'compliance-review-summary.json']
const CATEGORY_ORDER: DataCategory[] = ['general', 'health', 'sensitive_health']
const GENERATED_DESCRIPTION = 'Karta zabiegowa zaimportowana z biblioteki SimpliSalon.'
const SENSITIVE_COMMENT = [
  '// SENSITIVE_HEALTH: Wymaga review prawno-produktowego przed aktywacja przez salon.',
  '// Salon musi ustawic klauzule informacyjna Art. 9 GDPR przed wlaczeniem.',
].join('\n')

type BuiltinTemplateEntry = Omit<ImportFormTemplate, 'description' | 'fields'> & {
  description: string
  fields: Array<Record<string, unknown>>
}

function escapeString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t')
}

function serializeValue(value: unknown, indentLevel = 0): string {
  const indent = '  '.repeat(indentLevel)
  const nextIndent = '  '.repeat(indentLevel + 1)

  if (value === null) {
    return 'null'
  }

  if (typeof value === 'string') {
    return `'${escapeString(value)}'`
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '[]'
    }

    const items = value
      .map((item) => `${nextIndent}${serializeValue(item, indentLevel + 1)}`)
      .join(',\n')

    return `[\n${items}\n${indent}]`
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, entryValue]) => entryValue !== undefined
    )

    if (entries.length === 0) {
      return '{}'
    }

    const lines = entries
      .map(
        ([key, entryValue]) =>
          `${nextIndent}${key}: ${serializeValue(entryValue, indentLevel + 1)}`
      )
      .join(',\n')

    return `{\n${lines}\n${indent}}`
  }

  throw new Error(`Unsupported value type: ${typeof value}`)
}

function stripImportOnlyFieldProps(field: ImportFormField): Record<string, unknown> {
  const {
    isHealthField: _isHealthField,
    isSensitiveField: _isSensitiveField,
    blockImport: _blockImport,
    ...rest
  } = field

  return rest
}

function normalizeTemplate(templateDraft: ImportFormTemplate): BuiltinTemplateEntry {
  return {
    name: templateDraft.name,
    description: GENERATED_DESCRIPTION,
    data_category: templateDraft.data_category,
    requires_signature: templateDraft.requires_signature,
    gdpr_consent_text: templateDraft.gdpr_consent_text,
    fields: templateDraft.fields.map(stripImportOnlyFieldProps),
  }
}

function renderTemplateEntry(templateDraft: ImportFormTemplate): string {
  const entry = normalizeTemplate(templateDraft)
  const lines: string[] = ['  {']

  lines.push(`    name: ${serializeValue(entry.name)},`)
  lines.push(`    description: ${serializeValue(entry.description)},`)
  lines.push(`    data_category: ${serializeValue(entry.data_category)},`)
  lines.push(`    requires_signature: ${serializeValue(entry.requires_signature)},`)

  if (entry.gdpr_consent_text) {
    lines.push(`    gdpr_consent_text: ${serializeValue(entry.gdpr_consent_text)},`)
  }

  lines.push(`    fields: ${serializeValue(entry.fields, 2)},`)
  lines.push('  },')

  const rendered = lines.join('\n')

  if (templateDraft.data_category === 'sensitive_health') {
    return `${SENSITIVE_COMMENT}\n${rendered}`
  }

  return rendered
}

function readApprovedTemplates(): ImportFormTemplate[] {
  const files = fs
    .readdirSync(TEMPLATES_DIR)
    .filter((fileName) => fileName.endsWith('.json'))
    .filter((fileName) => !SKIP_FILES.includes(fileName))
    .sort((left, right) => left.localeCompare(right))

  const approvedTemplates: ImportFormTemplate[] = []

  for (const fileName of files) {
    const filePath = path.join(TEMPLATES_DIR, fileName)
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as ImportArtifact

    if (parsed.approved !== true) {
      continue
    }

    approvedTemplates.push(parsed.templateDraft)
  }

  // Deduplicate by name (keep first occurrence)
  const seenNames = new Set<string>()
  const deduplicated = approvedTemplates.filter((t) => {
    if (seenNames.has(t.name)) {
      console.warn(`Skipping duplicate name: '${t.name}'`)
      return false
    }
    seenNames.add(t.name)
    return true
  })

  return deduplicated.sort((left, right) => {
    const categoryDiff =
      CATEGORY_ORDER.indexOf(left.data_category) - CATEGORY_ORDER.indexOf(right.data_category)

    if (categoryDiff !== 0) {
      return categoryDiff
    }

    return left.name.localeCompare(right.name)
  })
}

function insertEntries(entries: string): void {
  const builtinSource = fs.readFileSync(BUILTIN_FILE, 'utf-8')
  const dedupeBlockIndex = builtinSource.indexOf('\nconst seenBuiltinTemplateNames')

  if (dedupeBlockIndex < 0) {
    throw new Error('Could not find builtin template dedupe block.')
  }

  const arrayCloseIndex = builtinSource.lastIndexOf('\n];', dedupeBlockIndex)

  if (arrayCloseIndex < 0) {
    throw new Error('Could not find builtin templates array closing bracket.')
  }

  const prefix = builtinSource.slice(0, arrayCloseIndex)
  const suffix = builtinSource.slice(arrayCloseIndex)
  const separator = prefix.endsWith('\n') ? '\n' : '\n\n'

  fs.writeFileSync(BUILTIN_FILE, `${prefix}${separator}${entries}${suffix}`, 'utf-8')
}

function printSummary(templates: ImportFormTemplate[]): void {
  const counts: Record<DataCategory, number> = {
    general: 0,
    health: 0,
    sensitive_health: 0,
  }

  for (const template of templates) {
    counts[template.data_category] += 1
  }

  console.log(`Total approved: ${templates.length}`)
  console.log(
    `By category: general=${counts.general}, health=${counts.health}, sensitive_health=${counts.sensitive_health}`
  )
  console.log(`Inserted: ${templates.length}`)
}

function main(): void {
  const templates = readApprovedTemplates()
  const renderedEntries = templates.map(renderTemplateEntry).join('\n\n')

  if (renderedEntries.length === 0) {
    console.log('Total approved: 0')
    console.log('By category: general=0, health=0, sensitive_health=0')
    console.log('Inserted: 0')
    return
  }

  insertEntries(renderedEntries)
  printSummary(templates)
}

main()
