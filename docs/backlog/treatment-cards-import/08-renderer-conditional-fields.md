# Task 08 - Renderer Conditional Fields

## Objective
Uzupelnic publiczny renderer formularzy tak, aby obslugiwal `conditionalShowIf` i poprawnie renderowal pytania zalezne z zaimportowanych kart.

## Read Only Context
- `app/forms/fill/[token]/page.tsx`
- `types/forms.ts`

## Output Files
- modyfikacje w `app/forms/fill/[token]/page.tsx`
- ewentualny helper typu `lib/forms/field-visibility.ts`

## Scope
- Ukrywac pola, jesli warunek nie jest spelniony
- Obslugiwac warunki zalezne od `radio`, `select` i prostego `checkbox`
- Nie walidowac ukrytych pol jako wymaganych

## Non-Goals
- Brak redesignu formularza
- Brak zmian w szyfrowaniu lub submit route

## Acceptance Criteria
- Pytania typu `Jesli tak...` wyswietlaja sie tylko po spelnieniu warunku
- Ukryte pola nie blokuja submitu
- Nie ma regresji dla formularzy bez warunkow

## Suggested Agent
- Gemini summary first because target file is large
- Codex final patch and verification

## Resume Prompt
Read `docs/backlog/treatment-cards-import/08-renderer-conditional-fields.md`, `app/forms/fill/[token]/page.tsx`, and `types/forms.ts`.
Use Gemini first for summary because the page is large.
Implement conditional field visibility without redesigning the form.
Write directly.
