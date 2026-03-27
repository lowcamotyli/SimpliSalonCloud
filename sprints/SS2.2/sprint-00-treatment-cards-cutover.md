# Sprint SS2.2-00 — Treatment Cards Import: Cutover (Tasks 07–09)

> Domknięcie pracy rozpoczętej w SS2.1. Pełna dokumentacja: `docs/backlog/treatment-cards-import/`

## Cel
Zapisanie zatwierdzonych kart zabiegowych do `lib/forms/builtin-templates.ts`, dodanie obsługi `conditionalShowIf` w rendererze formularzy, walidacja TypeScript i przygotowanie cutoveru na PROD.

## Stan aktualny
- Zadania 00–06: ✅ DONE (format kanoniczny, parser, compliance review, UI bramki)
- Zadania 07–09: ⬜ TODO
- Migracje SQL prerequisites: ✅ w repo (`20260401000001`, `20260401000002`, `20260401000003`)
- Artefakty: `generated/form-templates/*.json` — wygenerowane i zatwierdzone w task 05/06

## Architektura — dokumenty referencyjne

Przed dispatchem przeczytaj:
```bash
gemini -p "Read docs/architecture/data-architecture.md and docs/architecture/security-model.md. Summarize: (1) form_templates and client_forms schema with data_category, (2) health data encryption requirements (AES-256-GCM), (3) health_consent_at field purpose. Max 20 lines." --output-format text 2>/dev/null | grep -v "^Loaded"
```

| Dokument | Dlaczego |
|----------|----------|
| `docs/architecture/data-architecture.md` | Schema `form_templates`, `client_forms`, `data_category` enum, relacje |
| `docs/architecture/security-model.md` | Szyfrowanie `sensitive_health` fields (AES-256-GCM), `health_consent_at` compliance |
| `docs/architecture/bounded-contexts.md` | "Treatment Records" context — kto ma dostęp do form data |

**Kluczowe constraints:**
- Szablony `sensitive_health` wchodzą do `BUILTIN_TEMPLATES` z `is_active: false` (nie aktywne domyślnie)
- `health_consent_at` musi być zapisany przy submicie formularza zdrowotnego — sprawdź renderer
- Dostęp do odpowiedzi `client_forms`: tylko owner/manager (RLS z migracji 20260401000002)
- `FORMS_ENCRYPTION_KEY` — jeden klucz dla wszystkich salonów (znane ograniczenie, per-tenant keys to osobny backlog)
- Nie modyfikuj istniejących 5 ogólnych szablonów w `BUILTIN_TEMPLATES`

## Zakres tego sprintu

### Task 07 — Zapis do builtin-templates.ts
- Odczyt zatwierdzonych artefaktów z `generated/form-templates/*.json`
- Konwersja do formatu `FormTemplate` zgodnego z `lib/forms/builtin-templates.ts`
- Zapis do `BUILTIN_TEMPLATES` (append, nie nadpisuj istniejących)
- Szablony `sensitive_health`: `is_active: false` + komentarz ostrzegawczy

### Task 08 — Renderer conditional fields
- Dodanie obsługi `conditionalShowIf` w publicznym rendererze formularzy
- Pola warunkowe: ukryj/pokaż na podstawie odpowiedzi na inne pytanie
- Nie zmienia API ani DB — tylko logika renderowania po stronie klienta

### Task 09 — TypeScript validation + cutover
- `npx tsc --noEmit` clean po wszystkich zmianach
- Weryfikacja że wszystkie nowe szablony przechodzą Zod schema z `01-schema-and-validator.md`
- Cutover checklist: supabase db push, gen types, smoke test na staging

## Pliki do modyfikacji

| Plik | Akcja | Worker |
|------|-------|--------|
| `lib/forms/builtin-templates.ts` | EDIT (append nowe szablony) | codex-main |
| `app/forms/pre/[token]/page.tsx` lub renderer | EDIT (conditionalShowIf) | codex-dad |

## Zależności
- **Wymaga:** artefakty w `generated/form-templates/` (task 04/05 — ✅ DONE)
- **Blokuje:** nic — niezależny od pozostałych sprintów SS2.2
- **Kolejność wdrożenia:** **pierwszy sprint SS2.2** — to domknięcie SS2.1

---

## Krok 0 — Sprawdź stan artefaktów

```bash
ls generated/form-templates/ | head -20
wc -l lib/forms/builtin-templates.ts
# Odczytaj format przez Gemini:
gemini -p "Read docs/backlog/treatment-cards-import/07-write-to-builtin-templates.md. Show exact prompt/instructions for task 07. Max 30 lines." --output-format text 2>/dev/null | grep -v "^Loaded"
```

---

## Prompt — codex-main (task 07 — zapis szablonów)

> Szczegółowe instrukcje: `docs/backlog/treatment-cards-import/07-write-to-builtin-templates.md`

```bash
codex exec --dangerously-bypass-approvals-and-sandbox "Do NOT use Gemini — write directly.

Read lib/forms/builtin-templates.ts for current BUILTIN_TEMPLATES format.
Read docs/backlog/treatment-cards-import/07-write-to-builtin-templates.md for detailed instructions.
Read generated/form-templates/ for approved template artifacts.

Goal: Append approved treatment card templates to BUILTIN_TEMPLATES array.
File: lib/forms/builtin-templates.ts

Rules:
- Do NOT modify existing 5 general templates
- Templates with data_category='sensitive_health': add with is_active: false and comment // SENSITIVE HEALTH — requires explicit owner activation
- Templates with data_category='health': add with is_active: true
- Follow exact FormTemplate type shape from existing entries
- Group new templates with a comment // === Treatment Cards (imported SS2.2) ===

Done when: all approved templates appended, tsc passes."
```

---

## Prompt — codex-dad (task 08 — conditional fields renderer)

> Szczegółowe instrukcje: `docs/backlog/treatment-cards-import/08-renderer-conditional-fields.md`

```bash
DAD_PROMPT="Read docs/backlog/treatment-cards-import/08-renderer-conditional-fields.md for detailed spec.
Read app/forms/pre/[token]/page.tsx (or the form renderer component) for current rendering logic.

Goal: Add conditionalShowIf support to the public form renderer.
File: /mnt/d/SimpliSalonCLoud/[RENDERER_FILE — ustal z task spec]

conditionalShowIf format: { fieldId: string; value: string } — show this field only when referenced field has specified value.
Logic: track current form values in state; filter visible fields based on conditionalShowIf; re-evaluate on each field change.
Do not change API or DB — client-side only.

Done when: conditional fields show/hide correctly based on other answers." bash ~/.claude/scripts/dad-exec.sh
```

---

## Task 09 — Cutover checklist (Claude wykonuje bezpośrednio)

```bash
# 1. TypeScript validation
npx tsc --noEmit

# 2. Zod schema validation na nowych szablonach (jeśli jest skrypt)
# sprawdź: docs/backlog/treatment-cards-import/09-tests-and-cutover.md

# 3. Staging smoke test
# - Zaloguj się na staging
# - Wejdź w /settings/import
# - Sprawdź czy nowe szablony widoczne
# - Importuj 1 szablon health i 1 general do salonu testowego
# - Wypełnij formularz przez publiczny link

# 4. Staging PROD
supabase db push --project-ref bxkxvrhspklpkkgmzcge  # STAGING only (migracje już są, ale upewnij się)
```

---

## Done when
- `lib/forms/builtin-templates.ts` zawiera nowe karty zabiegowe
- Szablony `sensitive_health` mają `is_active: false`
- Conditional fields działają w rendererze formularzy
- `tsc --noEmit` clean
- Smoke test na staging przeszedł
