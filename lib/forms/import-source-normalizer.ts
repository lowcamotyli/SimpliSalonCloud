import { readFile } from 'fs/promises'
import * as path from 'path'

export interface NormalizedSource {
  fileName: string
  category: string
  serviceName: string
  language: 'pl' | 'en' | 'fr'
  headerText: string
  questionsText: string
  legalText: string
  hasRodoMarker: boolean
  warnings: string[]
}

const RODO_MARKER = '## Klauzula informacyjna RODO'
const TECHNICAL_HEADER_REGEX =
  /^(Podgl\u0105d gotowego dokumentu|Podgl\u0105d|Preview)\s*$/gim
const VERIFICATION_LINE_REGEX =
  /^Zweryfikuj zawarto\u015b\u0107 karty zabiegowej[^\n]*/gim
const TITLE_LINE_REGEX = /^#(?!#)\s*(.+)$/m
const LONG_LINE_LIMIT = 300

function stripBom(value: string): string {
  return value.replace(/^\uFEFF/, '')
}

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n?/g, '\n')
}

function normalizeBlankLines(value: string): string {
  return value.replace(/\n{3,}/g, '\n\n').trim()
}

function sanitizeTextBlock(value: string): string {
  return normalizeBlankLines(normalizeLineEndings(stripBom(value)))
}

function getLanguageAndBaseName(fileName: string): {
  language: 'pl' | 'en' | 'fr'
  baseName: string
} {
  if (fileName.startsWith('Angielski_')) {
    return {
      language: 'en',
      baseName: fileName.slice('Angielski_'.length),
    }
  }

  if (fileName.startsWith('Francuski_')) {
    return {
      language: 'fr',
      baseName: fileName.slice('Francuski_'.length),
    }
  }

  return {
    language: 'pl',
    baseName: fileName,
  }
}

function extractCategoryFromFileName(fileName: string): string {
  const parsedName = path.parse(fileName).name
  const { baseName } = getLanguageAndBaseName(parsedName)
  const separatorIndex = baseName.indexOf('_')

  if (separatorIndex === -1) {
    return ''
  }

  return baseName.slice(0, separatorIndex).trim()
}

function fallbackServiceNameFromFileName(fileName: string): string {
  const parsedName = path.parse(fileName).name
  const { baseName } = getLanguageAndBaseName(parsedName)
  const separatorIndex = baseName.indexOf('_')
  const nameWithoutCategory =
    separatorIndex >= 0 ? baseName.slice(separatorIndex + 1) : baseName

  return nameWithoutCategory.replace(/_/g, ' ').trim()
}

function decodeUtf8OrLatin1(buffer: Buffer): {
  raw: string
  encoding: 'utf-8' | 'latin1'
} {
  const utf8Text = buffer.toString('utf8')

  if (!utf8Text.includes('\uFFFD')) {
    return {
      raw: stripBom(utf8Text),
      encoding: 'utf-8',
    }
  }

  return {
    raw: stripBom(buffer.toString('latin1')),
    encoding: 'latin1',
  }
}

export async function readSourceFile(
  filePath: string
): Promise<{ raw: string; encoding: 'utf-8' | 'latin1' }> {
  const buffer = await readFile(filePath)
  return decodeUtf8OrLatin1(buffer)
}

export function normalizeSourceText(
  rawText: string,
  fileName: string
): NormalizedSource {
  const warnings: string[] = []
  const normalizedText = normalizeBlankLines(
    normalizeLineEndings(stripBom(rawText)).replace(TECHNICAL_HEADER_REGEX, '')
  )

  const titleMatch = normalizedText.match(TITLE_LINE_REGEX)
  const headerText = titleMatch?.[1]?.trim() ?? ''

  if (!headerText) {
    warnings.push('Brak linii tytulu rozpoczynajacej sie od #.')
  }

  const { language } = getLanguageAndBaseName(path.basename(fileName))
  const category = extractCategoryFromFileName(path.basename(fileName))

  if (!category) {
    warnings.push('Nie udalo sie wyodrebnic kategorii z nazwy pliku.')
  }

  const serviceName = (() => {
    if (!headerText) {
      return fallbackServiceNameFromFileName(fileName)
    }

    const colonIndex = headerText.indexOf(':')
    if (colonIndex === -1) {
      return fallbackServiceNameFromFileName(fileName)
    }

    const extracted = headerText.slice(colonIndex + 1).trim()
    return extracted || fallbackServiceNameFromFileName(fileName)
  })()

  const hasRodoMarker = normalizedText.includes(RODO_MARKER)
  if (!hasRodoMarker) {
    warnings.push('Brak markera sekcji RODO.')
  }

  const [questionsPart, ...legalParts] = normalizedText.split(RODO_MARKER)
  const questionsText = sanitizeTextBlock(
    questionsPart
      .replace(VERIFICATION_LINE_REGEX, '')
      .replace(TITLE_LINE_REGEX, '')
  )
  const legalText = sanitizeTextBlock(legalParts.join(RODO_MARKER))

  if (questionsText.length < 50) {
    warnings.push('Sekcja pytan ma mniej niz 50 znakow.')
  }

  const lines = normalizedText.split('\n')
  if (lines.some((line) => line.length > LONG_LINE_LIMIT)) {
    warnings.push(`Wykryto linie dluzsza niz ${LONG_LINE_LIMIT} znakow.`)
  }

  return {
    fileName: path.basename(fileName),
    category,
    serviceName,
    language,
    headerText,
    questionsText,
    legalText,
    hasRodoMarker,
    warnings,
  }
}
