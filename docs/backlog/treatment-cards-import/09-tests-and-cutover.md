# Task 09 - Tests And Cutover

## Objective
Dodac testy parsera/importu oraz przygotowac bezpieczny plan cutover z artefaktow do produkcyjnego uzycia.

## Read Only Context
- wszystkie poprzednie taski backlogu
- `tests/`
- `package.json`

## Output Files
- `tests/unit/forms-import/*.test.ts`
- ewentualna dokumentacja uruchomienia importu

## Scope
- Testy normalizacji zrodla
- Testy parsera pytan
- Testy normalizacji opcji
- Testy validatora
- Testy klasyfikacji compliance
- Testy review/import flow na poziomie jednostkowym
- Krotka instrukcja operacyjna:
  - build artefaktow
  - review
  - approved import
  - przypiecie do uslug
  - retencja i kontrola dostepu

## Acceptance Criteria
- Jest zestaw testow dla reprezentatywnych kart
- Mozna przejsc caly proces od markdown do `form_templates` w powtarzalny sposob
- Zostaje instrukcja operacyjna dla wdrozenia na kolejnych salonach
- Testy potwierdzaja, ze karty blokowane compliance nie trafiaja do importu

## Suggested Agent
- Codex direct

## Resume Prompt
Read `docs/backlog/treatment-cards-import/09-tests-and-cutover.md` and the implemented import pipeline files.
Do NOT use Gemini unless a touched file is large.
Add targeted tests and a cutover runbook for treatment-card import, including compliance gating and retention checks.
Write directly.
