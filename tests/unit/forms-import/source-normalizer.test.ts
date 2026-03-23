import { describe, expect, it } from 'vitest'

import { normalizeSourceText } from '../../../lib/forms/import-source-normalizer'

const RODO_BLOCK = '\n\n## Klauzula informacyjna RODO\n\nTreść klauzuli RODO.'

function makeRaw(
  questions: string,
  title = '# Karta: Koloryzacja'
): string {
  return `${title}\n\n${questions}${RODO_BLOCK}`
}

describe('normalizeSourceText', () => {
  const longQuestion =
    'Pytanie pierwsze dotyczące zabiegu koloryzacji włosów klienta salonu piękności.'

  it('detects language from file name prefixes', () => {
    const raw = makeRaw(longQuestion)

    expect(
      normalizeSourceText(raw, 'FRYZJERSTWO_Koloryzacja.md').language
    ).toBe('pl')
    expect(
      normalizeSourceText(raw, 'Angielski_FRYZJERSTWO_Koloryzacja.md').language
    ).toBe('en')
    expect(
      normalizeSourceText(raw, 'Francuski_MEDYCYNA_Botoks.md').language
    ).toBe('fr')
  })

  it('extracts category from the file name', () => {
    const raw = makeRaw(longQuestion)

    expect(
      normalizeSourceText(raw, 'FRYZJERSTWO_Koloryzacja.md').category
    ).toBe('FRYZJERSTWO')
    expect(
      normalizeSourceText(raw, 'Francuski_MEDYCYNA_Botoks.md').category
    ).toBe('MEDYCYNA')
  })

  it('reads headerText and serviceName, with filename fallback when title has no colon', () => {
    const rawWithColon = makeRaw(longQuestion)
    const withColon = normalizeSourceText(
      rawWithColon,
      'FRYZJERSTWO_Koloryzacja.md'
    )

    expect(withColon.headerText).toBe('Karta: Koloryzacja')
    expect(withColon.serviceName).toBe('Koloryzacja')

    const rawWithoutColon = makeRaw(longQuestion, '# Koloryzacja')
    const withoutColon = normalizeSourceText(
      rawWithoutColon,
      'FRYZJERSTWO_Koloryzacja.md'
    )

    expect(withoutColon.serviceName).toBe('Koloryzacja')
  })

  it('strips a BOM before extracting the title and does not emit the missing-title warning', () => {
    const raw = `\uFEFF${makeRaw(longQuestion)}`
    const result = normalizeSourceText(raw, 'FRYZJERSTWO_Koloryzacja.md')

    expect(result.headerText).toBe('Karta: Koloryzacja')
    expect(
      result.warnings.some((warning) => warning.includes('Brak linii tytulu'))
    ).toBe(false)
  })

  it('detects the RODO marker and warns when it is missing', () => {
    const withMarker = normalizeSourceText(
      makeRaw(longQuestion),
      'FRYZJERSTWO_Koloryzacja.md'
    )

    expect(withMarker.hasRodoMarker).toBe(true)
    expect(withMarker.legalText.length).toBeGreaterThan(0)

    const withoutMarker = normalizeSourceText(
      `# Karta: Koloryzacja\n\n${longQuestion}`,
      'FRYZJERSTWO_Koloryzacja.md'
    )

    expect(withoutMarker.hasRodoMarker).toBe(false)
    expect(
      withoutMarker.warnings.some((warning) => warning.includes('Brak markera'))
    ).toBe(true)
  })

  it('collapses excessive blank lines in the questions section', () => {
    const raw = makeRaw(`${longQuestion}\n\n\n\nDrugie pytanie dotyczące wizyty.`)
    const result = normalizeSourceText(raw, 'FRYZJERSTWO_Koloryzacja.md')

    expect(result.questionsText).not.toMatch(/\n{3,}/)
  })

  it('removes technical preview headers from the questions section', () => {
    const raw = makeRaw(
      `${longQuestion}\n\nPodgląd gotowego dokumentu\n\nDrugie pytanie dotyczące wizyty.`
    )
    const result = normalizeSourceText(raw, 'FRYZJERSTWO_Koloryzacja.md')

    expect(result.questionsText).not.toContain('Podgląd gotowego dokumentu')
  })

  it('emits warnings for missing title, short questions, and overly long lines, but not when lines stay within the limit', () => {
    const missingTitle = normalizeSourceText(
      `${longQuestion}${RODO_BLOCK}`,
      'FRYZJERSTWO_Koloryzacja.md'
    )
    expect(
      missingTitle.warnings.some((warning) =>
        warning.includes('Brak linii tytulu')
      )
    ).toBe(true)

    const shortQuestions = normalizeSourceText(
      makeRaw('Krótka treść pytania.'),
      'FRYZJERSTWO_Koloryzacja.md'
    )
    expect(
      shortQuestions.warnings.some((warning) => warning.includes('50'))
    ).toBe(true)

    const longLine = normalizeSourceText(
      makeRaw(`P${'a'.repeat(301)}`),
      'FRYZJERSTWO_Koloryzacja.md'
    )
    expect(longLine.warnings.some((warning) => warning.includes('300'))).toBe(
      true
    )

    const safeLines = normalizeSourceText(
      makeRaw(`${longQuestion}\n${'b'.repeat(300)}`),
      'FRYZJERSTWO_Koloryzacja.md'
    )
    expect(safeLines.warnings.some((warning) => warning.includes('300'))).toBe(
      false
    )
  })

  it('normalizes CRLF line endings', () => {
    const raw = [
      '# Karta: Koloryzacja',
      '',
      longQuestion,
      '',
      '## Klauzula informacyjna RODO',
      '',
      'Treść klauzuli RODO.',
    ].join('\r\n')
    const result = normalizeSourceText(raw, 'FRYZJERSTWO_Koloryzacja.md')

    expect(result.headerText).toBe('Karta: Koloryzacja')
    expect(result.questionsText).not.toContain('\r')
  })
})
