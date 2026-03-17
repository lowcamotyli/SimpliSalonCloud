# Sprint TC-1 — Treatment Cards: Finalizacja pipeline'u

- Status: **NEXT** (pierwszy do realizacji)
- Zależności: brak — to prerekvizyt dla wszystkich pozostałych sprintów v2.0
- Szacowany czas: 2 sesje Claude

---

## Cel

Domknąć pipeline importu kart zabiegowych: zastosować 3 migracje SQL blokujące GDPR compliance, zapisać ~120 zatwierdzonych kart do `lib/forms/builtin-templates.ts`, uruchomić `conditionalShowIf` w publicznym rendererze formularzy.

---

## Dokumenty referencyjne

| Dokument | Dlaczego |
|----------|---------|
| `docs/backlog/treatment-cards-import/07-write-to-builtin-templates.md` | Specyfikacja task 07 — jak zapisać artefakty do builtin-templates |
| `docs/backlog/treatment-cards-import/08-renderer-conditional-fields.md` | Specyfikacja task 08 — conditionalShowIf w rendererze |
| `docs/backlog/treatment-cards-import/09-tests-and-cutover.md` | Specyfikacja task 09 — walidacja TypeScript i plan cutover |
| `docs/backlog/treatment-cards-import/README.md` | Indeks pipeline'u, status tasków, zasady compliance |
| `docs/SS2.0/v2.0-definition.md` sekcja 3.1 | Prerekvizity v2.0 i kryteria Done |
| `docs/architecture/data-architecture.md` | Sensitivity tiers T4/T5, klasyfikacja data_category |
| `docs/architecture/security-model.md` | Wzorzec consent gate, zasada need-to-know |
| `docs/architecture/adr/005-document-form-system.md` | **Kluczowy ADR** — decyzja: templates są danymi, nie kodem (principle 1); `data_category` jako pole klasyfikacji (principle 3); `conditionalShowIf` jako requirement runtime renderera (principle 2) |
| `docs/architecture/adr/004-tenant-isolation.md` | Każda nowa tabela wymaga `salon_id NOT NULL` + RLS — sprawdź migracje pod tym kątem |
| `docs/architecture/bounded-contexts.md` | Documents & Forms domain JEST właścicielem `form_templates` tabeli — żaden inny domain nie queryuje jej bezpośrednio |
| `docs/architecture/domain-map.md` | `form_templates` → Documents & Forms domain; `client_forms` → również Documents & Forms; Treatment Records będzie je CZYTAĆ przez Documents domain service function, nie bezpośrednio |

---

## Pliki kontekstowe (czytać na początku sesji)

```
supabase/migrations/20260401000001_form_data_category.sql     ← SQL do zastosowania
supabase/migrations/20260401000002_restrict_client_forms_select.sql
supabase/migrations/20260401000003_health_consent_at.sql
types/forms.ts                                                ← typy runtime formularzy
lib/forms/builtin-templates.ts                               ← head -30 (format tablicy)
lib/forms/import-validator.ts                                ← sygnatura validateArtifact
lib/forms/import-parser.ts                                   ← sygnatura parseNormalizedSource
generated/form-templates/report.json                         ← wynik build script (status kart)
app/forms/fill/[token]/page.tsx                              ← renderer do modyfikacji (task 08)
```

---

## Scope

### Sesja 1 — Migracje + Typy + Task 07

| Task | Plik docelowy | Kto | Metoda |
|------|--------------|-----|--------|
| Apply 3 SQL migrations | — | Claude | `supabase db push` |
| Regenerate Supabase types | `types/supabase.ts` | Claude | `supabase gen types typescript --linked` |
| Task 07: Write approved cards | `lib/forms/builtin-templates.ts` | **Gemini** | `gemini -p "..."` |

**Prompt Gemini dla task 07:**
```
Read generated/form-templates/report.json to find all artifacts with status=approved.
Read lib/forms/builtin-templates.ts lines 1-50 to understand the BUILTIN_TEMPLATES array format.
Read types/forms.ts for FormTemplate type definition.

Append ALL approved artifacts from generated/form-templates/*.json to BUILTIN_TEMPLATES array
in lib/forms/builtin-templates.ts.

Rules:
- data_category='sensitive_health' → set is_active: false, add comment // requires review
- data_category='health' → set is_active: true
- data_category='general' → set is_active: true
- Preserve ALL existing entries at the top of the array
- Output ONLY the appended entries as TypeScript objects (not the full file)

Output ONLY valid TypeScript. No markdown, no explanations.
```

> Po exec: `head -5 lib/forms/builtin-templates.ts` (sprawdź brak prefixu), `wc -l` (sprawdź liczbę linii)

### Sesja 2 — Task 08 + Task 09

| Task | Plik docelowy | Kto | Metoda |
|------|--------------|-----|--------|
| Task 08: conditionalShowIf w rendererze | `app/forms/fill/[token]/page.tsx` | **Codex** | `codex exec --dangerously-bypass-approvals-and-sandbox` |
| Task 09: tsc check + cutover doc | `docs/sprints/TC-1_cutover-notes.md` | Claude | `npx tsc --noEmit` + Write |

**Prompt Codex dla task 08:**
```
Read app/forms/fill/[token]/page.tsx and types/forms.ts for context.
Do NOT use Gemini — write directly.

Modify app/forms/fill/[token]/page.tsx to support conditionalShowIf field rendering:
- FormField has optional field: conditionalShowIf?: { fieldId: string; value: string | string[] }
- A field with conditionalShowIf should only render when the referenced field's current value matches
- Track form values in component state
- Preserve all existing rendering logic
- Use simple show/hide (not remove from DOM — keep values for submission)
Edit the file directly.
```

---

## Kryteria wyjścia (Definition of Done)

- [ ] `supabase db push` — 3 migracje zastosowane bez błędów
- [ ] `supabase gen types typescript --linked` — `types/supabase.ts` zaktualizowany
- [ ] `lib/forms/builtin-templates.ts` — min. 50 nowych kart (KOSMETOLOGIA + HI-TECH priorytet)
- [ ] Karty `sensitive_health` mają `is_active: false` w builtin-templates
- [ ] `conditionalShowIf` działa w publicznym rendererze (`app/forms/fill/[token]/page.tsx`)
- [ ] `npx tsc --noEmit` — 0 błędów
- [ ] Karty widoczne w UI `/settings/import` salonu testowego

---

## Ryzyka i obejścia

| Ryzyko | Obejście |
|--------|---------|
| Gemini dodaje prefix opisu przed kodem | `head -3 plik` po exec, usuń przez Edit |
| `lib/forms/builtin-templates.ts` za duży → tsc timeout | Podziel na import z osobnych plików chunks; patrz INFRA-B |
| Mniej niż 50 kart ma status `approved` w report.json | Sprawdź report.json przed taskiem 07 — może wymagać ręcznego zatwierdzenia przez `/settings/import` UI |
| conditionalShowIf logic jest złożone → Codex robi partial fix | Sprawdź przez Write bezpośrednio jeśli edycja < 40 linii |

---

## Resume command (następna sesja)

```
Przeczytaj docs/sprints/TC-1_treatment-cards-finalizacja.md.
Sprawdź stan: supabase db push (czy 3 migracje zastosowane), head -5 lib/forms/builtin-templates.ts (czy nowe karty są).
Kontynuuj od pierwszego niezamkniętego task w sekcji Scope.
```
