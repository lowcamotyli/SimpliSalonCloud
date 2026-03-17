import { describe, expect, it } from 'vitest'

import {
  DYNAMIC_GDPR_TEMPLATE,
  containsLegacyGdprData,
  resolveGdprConsentText,
} from '../../../lib/forms/gdpr'

describe('gdpr helpers', () => {
  it('replaces legacy embedded salon data with the dynamic template', () => {
    const result = resolveGdprConsentText(
      'Administratorem jest BRAVE EDUCATION. Kontakt: redsxiii@gmail.com',
      {
        salonName: 'Studio Test',
        salonEmail: 'kontakt@studiotest.pl',
        address: {
          street: 'ul. Testowa 1',
          postalCode: '00-001',
          city: 'Warszawa',
        },
      }
    )

    expect(result).toContain('Studio Test')
    expect(result).toContain('kontakt@studiotest.pl')
    expect(result).toContain('ul. Testowa 1, 00-001, Warszawa')
    expect(result).not.toContain('BRAVE EDUCATION')
    expect(result).not.toContain('redsxiii@gmail.com')
  })

  it('replaces placeholders in stored gdpr text', () => {
    const result = resolveGdprConsentText(DYNAMIC_GDPR_TEMPLATE, {
      salonName: 'Studio Test',
      salonEmail: 'kontakt@studiotest.pl',
      address: {
        street: 'ul. Testowa 1',
        postalCode: '00-001',
        city: 'Warszawa',
      },
    })

    expect(result).toContain('Studio Test')
    expect(result).toContain('kontakt@studiotest.pl')
    expect(result).toContain('ul. Testowa 1, 00-001, Warszawa')
    expect(result).not.toContain('[NAZWA SALONU]')
    expect(result).not.toContain('[EMAIL SALONU]')
    expect(result).not.toContain('[ADRES]')
  })

  it('detects legacy gdpr markers', () => {
    expect(
      containsLegacyGdprData('BRAVE EDUCATION i redsxiii@gmail.com')
    ).toBe(true)
    expect(containsLegacyGdprData('Zwykly tekst zgody')).toBe(false)
  })
})
