# Task 04 - Generated Artifacts And Report

## Objective
Uruchomic pipeline, ktory generuje zunifikowane JSON-y dla wszystkich kart i zapisuje raport jakosci importu jeszcze przed review i importem do DB.

## Read Only Context
- `docs/backlog/treatment-cards-import/01-schema-and-validator.md`
- `docs/backlog/treatment-cards-import/02-source-normalization.md`
- `docs/backlog/treatment-cards-import/03-parser-and-field-normalization.md`

## Output Files
- `scripts/build-treatment-card-imports.ts`
- `generated/form-templates/*.json`
- `generated/form-templates/report.json`

## Scope
- Przetworzyc wszystkie karty z katalogu zrodlowego
- Zapisac po jednym pliku JSON na karte
- Wygenerowac zbiorczy raport:
  - total
  - success
  - review_required
  - failed
  - warning counts
  - confidence distribution
  - potential_health_sensitive field counts

## Non-Goals
- Brak importu do DB
- Brak edycji UI

## Acceptance Criteria
- Kazdy JSON przechodzi wspolny validator albo trafia do raportu jako failed
- Raport pozwala latwo ustalic kolejke review
- Wyniki sa deterministyczne i mozna je odtworzyc przez jeden skrypt
- Raport wyraznie pokazuje karty potencjalnie medyczne

## Suggested Agent
- Codex direct

## Resume Prompt
Read `docs/backlog/treatment-cards-import/04-generated-artifacts-and-report.md` and the parser/validator modules.
Do NOT use Gemini unless one of the touched files exceeds the project threshold.
Build the batch generation script and quality report outputs, including flags for potentially health-sensitive templates.
Write directly.
