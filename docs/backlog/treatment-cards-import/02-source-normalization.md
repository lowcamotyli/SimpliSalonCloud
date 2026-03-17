# Task 02 - Source Normalization

## Objective
Zbudowac preprocess zrodla, ktory preferuje `karty_zabiegowe/do_wysylki_klientom/*.md`, normalizuje kodowanie i wydziela sekcje wejsciowe do dalszego parsowania.

## Read Only Context
- `karty_zabiegowe/do_wysylki_klientom/*.md`
- `karty_zabiegowe/*.md`
- `docs/backlog/treatment-cards-import/00-canonical-data-shape.md`
- `docs/backlog/treatment-cards-import/01-schema-and-validator.md`

## Output Files
- `lib/forms/import-source-normalizer.ts`
- `scripts/normalize-treatment-cards.ts`

## Scope
- Odczytac najpierw `do_wysylki_klientom`, a dopiero potem fallback z katalogu glownego
- Naprawic najczestsze problemy z kodowaniem
- Usunac naglowki techniczne typu `Podglad gotowego dokumentu`
- Rozdzielic:
  - naglowek karty
  - blok pytan
  - blok zgody/GDPR
- Wykorzystac marker `## Klauzula informacyjna RODO`, gdy istnieje
- Zwracac wynik jako ustrukturyzowane sekcje tekstowe

## Non-Goals
- Brak mapowania do finalnych `fields`
- Brak zapisu do DB

## Acceptance Criteria
- Dla reprezentatywnych kart wynik zawiera poprawny `category`, `serviceName`, `questionsText`, `legalText`
- Normalizer nie gubi pliku z powodu pojedynczych bledow kodowania
- Bledy i niepewne przypadki trafiaja do warningow
- Gdy istnieje plik w `do_wysylki_klientom`, jest traktowany jako glowny input

## Suggested Agent
- Gemini draft for large source pattern analysis, then Codex final review

## Resume Prompt
Read `docs/backlog/treatment-cards-import/00-canonical-data-shape.md`, `docs/backlog/treatment-cards-import/02-source-normalization.md`, and sample files from `karty_zabiegowe/do_wysylki_klientom/`.
Use Gemini first only for summarizing recurring source patterns if needed.
Implement source normalization utilities and a CLI script that emits normalized sections per file.
Write directly.
