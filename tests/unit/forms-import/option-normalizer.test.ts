import { describe, expect, it } from 'vitest'

import {
  detectFieldType,
  normalizeOptions,
  splitCollapsedOptionLine,
} from '../../../lib/forms/import-option-normalizer'

describe('normalizeOptions', () => {
  it("normalizes yes/no values with canonical casing and sorts single-word options", () => {
    expect(normalizeOptions(['tak', 'NIE'])).toEqual(['Nie', 'Tak'])
  })

  it('deduplicates options case-insensitively while keeping the first occurrence', () => {
    expect(normalizeOptions(['Tak', 'tak'])).toEqual(['Tak'])
  })

  it('keeps canonical multi-word options and does not sort when any option contains spaces', () => {
    expect(normalizeOptions(['nie dotyczy', 'Tak'])).toEqual([
      'Nie dotyczy',
      'Tak',
    ])
  })

  it('preserves order for multi-word options when already canonicalized', () => {
    expect(normalizeOptions(['Nie dotyczy', 'Tak'])).toEqual([
      'Nie dotyczy',
      'Tak',
    ])
  })

  it('filters out empty strings before deduplication and sorting', () => {
    expect(normalizeOptions(['Tak', '', 'Nie'])).toEqual(['Nie', 'Tak'])
  })

  it('sorts single-word options ascending', () => {
    expect(normalizeOptions(['Nie', 'Tak'])).toEqual(['Nie', 'Tak'])
    expect(normalizeOptions(['Tak', 'Nie'])).toEqual(['Nie', 'Tak'])
  })

  it('splits glued option labels before normalization', () => {
    expect(
      normalizeOptions(['More than 1 liter1 to 1.5 liters1.5 to 2 liters'])
    ).toEqual([
      'More than 1 liter',
      '1 to 1.5 liters',
      '1.5 to 2 liters',
    ])
  })

  it('splits glued vitamin and lifestyle options', () => {
    expect(
      normalizeOptions([
        'Vitamin DVitamin AVitamin EB vitamins',
        'Vegan dietI include meat in my diet',
      ])
    ).toEqual([
      'Vitamin D',
      'Vitamin A',
      'Vitamin E',
      'B vitamins',
      'Vegan diet',
      'I include meat in my diet',
    ])
  })
})

describe('splitCollapsedOptionLine', () => {
  it('splits glued yes/no follow-up options', () => {
    expect(splitCollapsedOptionLine('NoI try to')).toEqual(['No', 'I try to'])
  })

  it('splits options separated by repeated spaces', () => {
    expect(splitCollapsedOptionLine('Tak    Nie')).toEqual(['Tak', 'Nie'])
  })

  it('splits leading numeric choices', () => {
    expect(splitCollapsedOptionLine('01234>4Nie dotyczy')).toEqual([
      '0',
      '1',
      '2',
      '3',
      '4',
      '>4',
      'Nie dotyczy',
    ])
  })
})

describe('detectFieldType', () => {
  it("returns 'radio' for Tak/Nie options", () => {
    expect(detectFieldType('Czy wyraza zgode?', ['Tak', 'Nie'])).toBe('radio')
  })

  it("returns 'radio' for three options", () => {
    expect(detectFieldType('Wybierz opcje', ['A', 'B', 'C'])).toBe('radio')
  })

  it("returns 'radio' for five options", () => {
    expect(detectFieldType('Wybierz opcje', ['A', 'B', 'C', 'D', 'E'])).toBe(
      'radio'
    )
  })

  it("returns 'select' for six options", () => {
    expect(
      detectFieldType('Wybierz opcje', ['A', 'B', 'C', 'D', 'E', 'F'])
    ).toBe('select')
  })

  it("returns 'date' when the label indicates a date field and there are no options", () => {
    expect(detectFieldType('Data urodzenia', [])).toBe('date')
  })

  it("returns 'textarea' when the label indicates additional notes and there are no options", () => {
    expect(detectFieldType('Uwagi dodatkowe', [])).toBe('textarea')
  })

  it("returns 'text' when there are no options and the label has no special keywords", () => {
    expect(detectFieldType('Imie i nazwisko', [])).toBe('text')
  })
})
