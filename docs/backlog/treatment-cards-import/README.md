# Backlog - Import Kart Zabiegowych

## Cel
Jednorazowy import wszystkich kart zabiegowych do `lib/forms/builtin-templates.ts`.
Szablony beda dostepne dla wszystkich salonow przez istniejacy UI `/settings/import`.
Brak nowych tabel, brak per-salon importu. Docelowy format to `lib/forms/builtin-templates.ts`.
UI review (task 06) zostal dodany jako bramka compliance przed zapisem do builtin-templates.

## Docelowy model
- Zrodlo preferowane: `karty_zabiegowe/do_wysylki_klientom/*.md`
- Zrodlo fallback: `karty_zabiegowe/*.md`
- Format posredni: kanoniczny JSON per karta (`generated/form-templates/*.json`)
- Format finalny: wpisy w `lib/forms/builtin-templates.ts` (tablica `BUILTIN_TEMPLATES`)
- Dostep salonow: przez istniejacy `/settings/import` - bez zmian w UI

## Prerequisite: migracje SQL przed importem
Przed uruchomieniem jakiegokolwiek importu do DB musza byc zastosowane 3 migracje:

| # | Plik | Co dodaje | RODO |
|---|------|-----------|------|
| 1 | `20260401000000_form_data_category.sql` | `data_category` enum + kolumna na `form_templates` | Art. 5(1)(c) minimalizacja danych |
| 2 | `20260401000001_restrict_client_forms_select.sql` | `SELECT` na `client_forms` tylko dla owner/manager | zasada need-to-know |
| 3 | `20260401000002_health_consent_at.sql` | `health_consent_at TIMESTAMPTZ` na `client_forms` | Art. 9(2)(a) zgoda explicite |

## Compliance First
- Karty zabiegowe zawieraja dane zdrowotne (Art. 9 GDPR - specjalna kategoria).
- Kazdy szablon musi byc sklasyfikowany jako `general | health | sensitive_health`.
- Szablony `sensitive_health` laduja do `BUILTIN_TEMPLATES` z flaga i ostrzezeniem w UI.
- Importowac tylko pytania niezbedne dla bezpiecznego wykonania konkretnej uslugi.
- Nie wysylac tresci odpowiedzi w SMS ani e-mail; tylko link z tokenem.
- Dostep do odpowiedzi tylko dla owner/manager (wymuszone przez migracje #2).
- `health_consent_at` musi byc zapisany przy submicie formularza zdrowotnego (migracja #3).

## Zasady podzialu pracy
- Kazdy task ma maly, lokalny kontekst.
- Najpierw generujemy artefakty i raport, dopiero potem piszemy do `builtin-templates.ts`.
- Gemini do duzych zadan parsowania z wiekszym kontekstem (>150 linii).
- Codex do typow, walidacji, review i integracji (20-150 linii).
- Claude bezposrednio do edycji < 50 linii i fiksow.

## Kolejnosc realizacji

| # | Plik | Status |
|---|------|--------|
| 00 | `00-canonical-data-shape.md` - format kanoniczny JSON z `data_category` | ✅ DONE |
| 01 | `01-schema-and-validator.md` - typy TS + Zod schema | ✅ DONE |
| 02 | `02-source-normalization.md` - preprocess plikow MD | ✅ DONE |
| 03 | `03-parser-and-field-normalization.md` - parser pytan + compliance markers | ✅ DONE |
| 04 | `04-generated-artifacts-and-report.md` - batch run + raport jakosci | ✅ DONE |
| 05 | `05-compliance-and-data-minimization.md` - klasyfikacja + zatwierdzenie pol | ✅ DONE |
| 06 | `06-review-and-import-ui.md` - UI review kart z bramkami compliance w /settings/import | ✅ DONE |
| 07 | `07-write-to-builtin-templates.md` - zapis zatwierdzonych kart do `lib/forms/builtin-templates.ts` | ⬜ TODO |
| 08 | `08-renderer-conditional-fields.md` - obsługa `conditionalShowIf` w publicznym rendererze | ⬜ TODO |
| 09 | `09-tests-and-cutover.md` - walidacja TypeScript + plan cutover na PROD | ⬜ TODO |

## Stan poczatkowy repo
- `lib/forms/builtin-templates.ts` istnieje z 5 szablonami ogolnymi.
- Runtime formularzy juz istnieje i dziala.
- `/settings/import` umozliwia import z `BUILTIN_TEMPLATES` do DB salonu.
- W `karty_zabiegowe/do_wysylki_klientom/` jest ~120 kart wstepnie oczyszczonych.
- Brakuje: pipeline parsowania, `data_category` w typach, `health_consent_at` w DB.

## Kluczowe pliki referencyjne
- `lib/forms/builtin-templates.ts` - cel importu
- `types/forms.ts` - typy runtime
- `app/(dashboard)/[slug]/settings/import/page.tsx` - istniejacy UI importu
- `app/api/forms/templates/route.ts` - API zapisu do DB
- `lib/forms/encryption.ts` - szyfrowanie odpowiedzi (AES-256-GCM)
- `supabase/migrations/20260401000000_form_data_category.sql` - prerequisite
- `karty_zabiegowe/do_wysylki_klientom/*.md` - zrodlo preferowane

## Ograniczenia
- Preferowac ASCII w nowych plikach roboczych (skrypty, artefakty JSON).
- Nie importowac od razu wszystkiego bez etapu review (task 05).
- Nie polegac wylacznie na parserze AI - wynik walidowany deterministycznie (Zod).
- Format kanoniczny przechowuje wiecej niz finalny szablon (umozliwia reimport).
- Szablony `sensitive_health` wchodza do `BUILTIN_TEMPLATES` z `is_active: false` i komentarzem.
- `FORMS_ENCRYPTION_KEY` jest jeden dla wszystkich salonow - to znane ograniczenie (per-tenant keys to osobny backlog).
