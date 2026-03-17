import type { FieldType } from '../../types/forms.ts'

const OPTION_SPLIT_SENTINEL = '\n'

function splitLeadingNumericChoices(value: string): string[] | null {
  const trimmed = value.trim()
  const match = trimmed.match(
    /^(\d{2,})(>\d+)?(?=[A-Za-z\u00C0-\u024F\u0104\u0106\u0118\u0141\u0143\u00D3\u015A\u0179\u017B])/
  )

  if (!match) {
    return null
  }

  const segments = match[1].split('')
  if (match[2]) {
    segments.push(match[2])
  }

  const rest = trimmed.slice(match[0].length).trim()
  return rest ? [...segments, rest] : segments
}

export function splitCollapsedOptionLine(value: string): string[] {
  const normalized = value.trim()
  if (!normalized) {
    return []
  }

  const whitespaceSeparated = normalized
    .split(/\s{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)

  if (
    whitespaceSeparated.length > 1 &&
    whitespaceSeparated.every(
      (part) => part.length <= 50 && !/[?:]$/.test(part)
    )
  ) {
    return whitespaceSeparated.flatMap((part) => splitCollapsedOptionLine(part))
  }

  const numericChoices = splitLeadingNumericChoices(normalized)
  if (numericChoices) {
    return numericChoices
  }

  const withSentinels = normalized
    .replace(
      /(?<=[a-z\u00DF-\u00FF\u0105\u0107\u0119\u0142\u0144\u00F3\u015B\u017A\u017C0-9%”')>])(?=[A-Z\u00C0-\u00DE\u0104\u0106\u0118\u0141\u0143\u00D3\u015A\u0179\u017B])/g,
      OPTION_SPLIT_SENTINEL
    )
    .replace(
      /(?<=[A-Z\u00C0-\u00DE\u0104\u0106\u0118\u0141\u0143\u00D3\u015A\u0179\u017B])(?=[A-Z\u00C0-\u00DE\u0104\u0106\u0118\u0141\u0143\u00D3\u015A\u0179\u017B][a-z\u00DF-\u00FF\u0105\u0107\u0119\u0142\u0144\u00F3\u015B\u017A\u017C])/g,
      OPTION_SPLIT_SENTINEL
    )
    .replace(
      /(?<=\b(?:Vitamin|Witamina)\s[A-Z])(?=(?:B vitamins|Witaminy z grupy B))/g,
      OPTION_SPLIT_SENTINEL
    )
    .replace(
      /(?<=[a-z\u00DF-\u00FF\u0105\u0107\u0119\u0142\u0144\u00F3\u015B\u017A\u017C])(?=\d(?:\s|[.,x>\-–]))/g,
      OPTION_SPLIT_SENTINEL
    )

  return withSentinels
    .split(OPTION_SPLIT_SENTINEL)
    .map((part) => part.trim())
    .filter(Boolean)
}

export function normalizeOptions(rawOptions: string[]): string[] {
  const normalized = rawOptions
    .flatMap((opt) => splitCollapsedOptionLine(opt))
    .map((opt) => opt.trim())
    .filter(Boolean) // Removes empty strings
    .map((opt) => {
      const lower = opt.toLowerCase()
      if (lower === 'tak') return 'Tak'
      if (lower === 'nie') return 'Nie'
      if (lower === 'nie dotyczy') return 'Nie dotyczy'
      return opt
    })

  const seen = new Set<string>()
  const deduplicated: string[] = []
  for (const opt of normalized) {
    const lowerOpt = opt.toLowerCase()
    if (!seen.has(lowerOpt)) {
      seen.add(lowerOpt)
      deduplicated.push(opt)
    }
  }

  const allSingleWords = deduplicated.every((opt) => !opt.includes(' '))
  if (allSingleWords) {
    deduplicated.sort((a, b) => a.localeCompare(b, 'pl'))
  }

  return deduplicated
}

export function detectFieldType(
  labelText: string,
  options: string[]
): FieldType {
  if (
    options.length === 2 &&
    options.includes('Tak') &&
    options.includes('Nie')
  ) {
    return 'radio'
  }

  if (options.length >= 2 && options.length <= 5) {
    return 'radio'
  }

  if (options.length > 5) {
    return 'select'
  }

  if (/data|urodzin|birth/i.test(labelText)) {
    return 'date'
  }

  if (/uwagi|komentarz|opis|prosz.*opisa|szczeg|opisz|wymie/i.test(labelText)) {
    return 'textarea'
  }

  return 'text'
}
