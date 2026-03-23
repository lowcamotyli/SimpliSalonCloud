# Task 06 - Review And Import UI

## Objective
Dodac w panelu review flow dla wygenerowanych kart oraz kontrolowany import approved templates do istniejacego systemu formularzy, z twardymi blokadami compliance.

## Read Only Context
- `app/(dashboard)/[slug]/settings/import/page.tsx`
- `app/(dashboard)/[slug]/settings/forms/page.tsx`
- `app/api/forms/templates/route.ts`
- `docs/backlog/treatment-cards-import/04-generated-artifacts-and-report.md`
- `docs/backlog/treatment-cards-import/05-compliance-and-data-minimization.md`

## Output Files
- `components/settings/treatment-card-import-review.tsx`
- ewentualne male API pomocnicze do ladowania artefaktow importowych

## Scope
- Dodac sekcje w istniejacej zakladce importu formularzy
- Pokazac:
  - liste kart
  - status
  - warningi
  - preview pol
  - klasyfikacje compliance
  - akcje approve/import tylko dla kart dopuszczonych
- Wymusic potwierdzenia review dla:
  - pytan zdrowotnych
  - tekstow zgody
  - retencji
  - zakresu przypisania do uslug

## Non-Goals
- Brak finalnego auto-przypinania do uslug
- Brak przebudowy calej strony forms

## Acceptance Criteria
- Uzytkownik moze obejrzec wygenerowany template przed zapisem
- Karty zablokowane compliance nie moga byc zaimportowane z UI
- Approved template daje sie zapisac do `form_templates`
- UX korzysta z obecnej architektury settings/import zamiast tworzyc osobny modul

## Suggested Agent
- Gemini summary first for `app/(dashboard)/[slug]/settings/import/page.tsx`
- Codex final edits and review

## Resume Prompt
Read `docs/backlog/treatment-cards-import/06-review-and-import-ui.md`, `app/(dashboard)/[slug]/settings/import/page.tsx`, and `app/(dashboard)/[slug]/settings/forms/page.tsx`.
Use Gemini first for a summary of the large import page if needed.
Add a focused review/import UX for generated treatment-card templates with hard compliance gates.
Write directly.
