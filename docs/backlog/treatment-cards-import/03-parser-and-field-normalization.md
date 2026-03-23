# Task 03 - Parser And Field Normalization

## Objective
Przeksztalcic znormalizowany tekst pytan do zunifikowanych pol SimpliSalon z przewidywalnymi `field.id`, znormalizowanymi opcjami i sygnalami potrzebnymi do pozniejszego review compliance.

## Read Only Context
- `docs/backlog/treatment-cards-import/01-schema-and-validator.md`
- `docs/backlog/treatment-cards-import/02-source-normalization.md`
- `types/forms.ts`
- `lib/forms/builtin-templates.ts`

## Output Files
- `lib/forms/import-field-map.ts`
- `lib/forms/import-parser.ts`
- `lib/forms/import-option-normalizer.ts`

## Scope
- Rozpoznawac typy pytan:
  - `radio`
  - `checkbox`
  - `select`
  - `textarea`
  - `text`
  - `date`
  - `section_header`
- Tworzyc stabilne `field.id`
- Wykrywac pytania warunkowe `Jesli tak...`
- Deduplikowac i normalizowac opcje
- Wydzielac `gdpr_consent_text`
- Ustawiac `requires_signature`
- Oznaczac pytania potencjalnie zdrowotne do dalszej klasyfikacji compliance
- Oznaczac pytania podejrzanie szerokie lub nieniezbedne jako kandydatow do blokady

## Non-Goals
- Brak UI review
- Brak zapisu do DB

## Acceptance Criteria
- Parser generuje poprawny artefakt importowy dla co najmniej kilku roznych kart
- Zblizone pytania maja te same `field.id`
- Duplikaty opcji sa usuwane
- Prawne bloki nie staja sie zwyklymi polami pytan
- Artefakt zawiera sygnaly potrzebne do pozniejszego compliance review

## Suggested Agent
- Gemini draft for parser skeleton if file grows >150 lines
- Codex final integration and logic review

## Resume Prompt
Read `docs/backlog/treatment-cards-import/03-parser-and-field-normalization.md`, the shared validator/types, and several normalized source examples.
Use Gemini first if the parser file becomes large.
Implement deterministic parsing and field normalization into SimpliSalon form fields, including compliance-related field markers.
Write directly.
