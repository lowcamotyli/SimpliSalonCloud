import { describe, expect, it } from 'vitest'

import { parseNormalizedSource } from '../../../lib/forms/import-parser'
import type { NormalizedSource } from '../../../lib/forms/import-source-normalizer'

function makeSource(
  overrides: Partial<NormalizedSource> = {}
): NormalizedSource {
  return {
    fileName: 'FRYZJERSTWO_Koloryzacja.md',
    category: 'FRYZJERSTWO',
    serviceName: 'Koloryzacja',
    language: 'pl',
    headerText: 'Karta: Koloryzacja',
    questionsText:
      'Imie i nazwisko\nNr telefonu\nCzy masz alergie?\nTak\nNie',
    legalText:
      'Administratorem danych jest salon. Dane przetwarzane sa w celu realizacji uslug.',
    hasRodoMarker: true,
    warnings: [],
    ...overrides,
  }
}

describe('parseNormalizedSource', () => {
  it('returns version 1 artifact with correct source info', () => {
    const artifact = parseNormalizedSource(makeSource())

    expect(artifact.version).toBe(1)
    expect(artifact.source.category).toBe('FRYZJERSTWO')
    expect(artifact.source.serviceName).toBe('Koloryzacja')
    expect(artifact.source.language).toBe('pl')
  })

  it('sets dataCategory to general for FRYZJERSTWO with 0 health fields', () => {
    const artifact = parseNormalizedSource(
      makeSource({
        questionsText: 'Imie i nazwisko\nNr telefonu',
      })
    )

    expect(artifact.compliance.dataCategory).toBe('general')
  })

  it('sets dataCategory to sensitive_health for MEDYCYNA category', () => {
    const artifact = parseNormalizedSource(
      makeSource({
        category: 'MEDYCYNA',
      })
    )

    expect(artifact.compliance.dataCategory).toBe('sensitive_health')
  })

  it('sets dataCategory to health for FRYZJERSTWO with a health-related question', () => {
    const artifact = parseNormalizedSource(
      makeSource({
        questionsText: 'Imie i nazwisko\nCzy przyjmujesz leki?\nTak\nNie',
      })
    )

    expect(artifact.compliance.dataCategory).toBe('health')
  })

  it('sets dataCategory to sensitive_health when sensitiveFieldCount is greater than 2', () => {
    const artifact = parseNormalizedSource(
      makeSource({
        category: 'FRYZJERSTWO',
        questionsText: [
          'Czy masz nowotwr?',
          'Tak',
          'Nie',
          'Czy masz rozrusznik serca?',
          'Tak',
          'Nie',
          'Czy przyjmujesz leki przeciwzakrzepowe?',
          'Tak',
          'Nie',
        ].join('\n'),
      })
    )

    expect(artifact.compliance.sensitiveFieldCount).toBe(3)
    expect(artifact.compliance.dataCategory).toBe('sensitive_health')
  })

  it('sets requiresHealthConsent based on data category', () => {
    const generalArtifact = parseNormalizedSource(
      makeSource({
        questionsText: 'Imie i nazwisko\nNr telefonu',
      })
    )
    const healthArtifact = parseNormalizedSource(
      makeSource({
        questionsText: 'Imie i nazwisko\nCzy przyjmujesz leki?\nTak\nNie',
      })
    )
    const sensitiveArtifact = parseNormalizedSource(
      makeSource({
        category: 'MEDYCYNA',
      })
    )

    expect(generalArtifact.compliance.requiresHealthConsent).toBe(false)
    expect(healthArtifact.compliance.requiresHealthConsent).toBe(true)
    expect(sensitiveArtifact.compliance.requiresHealthConsent).toBe(true)
  })

  it('detects a question ending with ? as a field', () => {
    const artifact = parseNormalizedSource(
      makeSource({
        questionsText: 'Czy masz alergie?',
      })
    )

    expect(artifact.structure.sections[0]?.fields).toHaveLength(1)
    expect(artifact.structure.sections[0]?.fields[0]?.label).toBe(
      'Czy masz alergie?'
    )
  })

  it('deduplicates identical field ids', () => {
    const artifact = parseNormalizedSource(
      makeSource({
        questionsText: 'Imie i nazwisko?\nImie i nazwisko?',
      })
    )

    expect(artifact.templateDraft.fields[0]?.id).toBe('full_name')
    expect(artifact.templateDraft.fields[1]?.id).toBe('full_name_2')
  })

  it('assigns conditionalShowIf for a question starting with Jesli tak', () => {
    const artifact = parseNormalizedSource(
      makeSource({
        questionsText: [
          'Czy masz alergie?',
          'Tak',
          'Nie',
          'Jesli tak, jakie alergie?',
        ].join('\n'),
      })
    )

    expect(artifact.templateDraft.fields[1]?.conditionalShowIf).toEqual({
      fieldId: 'allergies',
      value: 'Tak',
    })
  })

  it('does not swallow an English follow-up prompt into radio options', () => {
    const artifact = parseNormalizedSource(
      makeSource({
        questionsText: [
          'Do you have any allergies?',
          'Yes',
          'No',
          'If yes, please specify.',
        ].join('\n'),
      })
    )

    expect(artifact.templateDraft.fields[0]?.options).toEqual(['No', 'Yes'])
    expect(artifact.templateDraft.fields[1]?.label).toBe(
      'If yes, please specify.'
    )
    expect(artifact.templateDraft.fields[1]?.conditionalShowIf).toEqual({
      fieldId: 'do_you_have_any_allergies',
      value: 'Yes',
    })
  })

  it('splits glued option lines instead of treating them as separate fields', () => {
    const artifact = parseNormalizedSource(
      makeSource({
        questionsText: [
          'How much water do you drink daily?',
          'More than 1 liter1 to 1.5 liters1.5 to 2 liters2 to 2.5 liters',
          'Less than 2.5 liters',
        ].join('\n'),
      })
    )

    expect(artifact.templateDraft.fields).toHaveLength(1)
    expect(artifact.templateDraft.fields[0]?.label).toBe(
      'How much water do you drink daily?'
    )
    expect(artifact.templateDraft.fields[0]?.options).toEqual([
      'More than 1 liter',
      '1 to 1.5 liters',
      '1.5 to 2 liters',
      '2 to 2.5 liters',
      'Less than 2.5 liters',
    ])
  })

  it('extracts gdpr consent text from the first legal paragraph', () => {
    const legalText = [
      'Administratorem danych jest salon. Dane przetwarzane sa w celu realizacji uslug.',
      'Drugi akapit zgody.',
    ].join('\n\n')

    const artifact = parseNormalizedSource(
      makeSource({
        legalText,
      })
    )

    expect(artifact.structure.consents).toEqual([
      'Administratorem danych jest salon. Dane przetwarzane sa w celu realizacji uslug.',
    ])
    expect(artifact.templateDraft.gdpr_consent_text).toContain('[NAZWA SALONU]')
    expect(artifact.templateDraft.gdpr_consent_text).toContain('[EMAIL SALONU]')
  })

  it('throws in strict mode when questionsText is empty', () => {
    expect(() =>
      parseNormalizedSource(
        makeSource({
          questionsText: '',
        }),
        { strictMode: true }
      )
    ).toThrowError(/No importable fields/)
  })

  it('increases mapping confidence when hasRodoMarker is true', () => {
    const withoutRodo = parseNormalizedSource(
      makeSource({
        hasRodoMarker: false,
      })
    )
    const withRodo = parseNormalizedSource(
      makeSource({
        hasRodoMarker: true,
      })
    )

    expect(withRodo.mapping.confidence).toBeGreaterThan(
      withoutRodo.mapping.confidence
    )
  })

  it('increases mapping confidence with more field map matches', () => {
    const noMatches = parseNormalizedSource(
      makeSource({
        hasRodoMarker: false,
        questionsText: 'Ulubiony kolor\nUlubiona pora dnia',
      })
    )
    const twoMatches = parseNormalizedSource(
      makeSource({
        hasRodoMarker: false,
        questionsText: 'Imie i nazwisko\nNr telefonu',
      })
    )

    expect(twoMatches.mapping.confidence).toBeGreaterThan(
      noMatches.mapping.confidence
    )
  })

  it('caps mapping confidence at 0.95', () => {
    const artifact = parseNormalizedSource(
      makeSource({
        hasRodoMarker: true,
        questionsText: [
          'Imie i nazwisko?',
          'Nr telefonu?',
          'Data urodzenia?',
          'Email?',
          'Czy masz alergie?',
          'Tak',
          'Nie',
          'Czy przyjmujesz leki?',
          'Tak',
          'Nie',
          'Czy jest pani w ciazy?',
          'Tak',
          'Nie',
        ].join('\n'),
      })
    )

    expect(artifact.mapping.confidence).toBe(0.95)
  })

  it('sets needsManualReview to true when sensitiveFieldCount is greater than 0', () => {
    const artifact = parseNormalizedSource(
      makeSource({
        questionsText: 'Czy masz nowotwor?\nTak\nNie',
      })
    )

    expect(artifact.compliance.sensitiveFieldCount).toBeGreaterThan(0)
    expect(artifact.mapping.needsManualReview).toBe(true)
  })

  it('sets needsManualReview to false when confidence is at least 0.7 and there are no sensitive fields', () => {
    const artifact = parseNormalizedSource(
      makeSource({
        hasRodoMarker: true,
        questionsText: 'Imie i nazwisko\nNr telefonu',
      })
    )

    expect(artifact.compliance.sensitiveFieldCount).toBe(0)
    expect(artifact.mapping.confidence).toBeGreaterThanOrEqual(0.7)
    expect(artifact.mapping.needsManualReview).toBe(false)
  })

  it('propagates source warnings to extraction warnings', () => {
    const artifact = parseNormalizedSource(
      makeSource({
        warnings: ['Brak markera sekcji RODO.'],
      })
    )

    expect(artifact.extraction.warnings).toEqual([
      'Brak markera sekcji RODO.',
    ])
  })
})
