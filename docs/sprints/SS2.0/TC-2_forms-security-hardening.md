# Sprint TC-2 — Forms Security Hardening

- Status: **TODO** (po TC-1)
- Zależności: TC-1 (migracje muszą być zastosowane, typy zregenerowane)
- Szacowany czas: 2 sesje Claude

---

## Cel

Wymusić `health_consent_at` i `data_category` na poziomie API — nie tylko w DB schema. Zamknąć bug produkcyjny: aktualnie submit formularza zdrowotnego bez zgody przechodzi bez błędu.

---

## Dokumenty referencyjne

| Dokument | Dlaczego |
|----------|---------|
| `docs/SS2.0/v2.0-definition.md` sekcja 3.1 | Prerekvizity v2.0 — consent enforcement jako bloker |
| `docs/architecture/security-model.md` | Threat model, consent gate pattern, defence in depth |
| `docs/architecture/data-architecture.md` | Sensitivity tiers T4/T5, klasyfikacja health data |
| `docs/legal/medical-data-supabase-gdpr-guidance.md` | Art. 9 GDPR — przetwarzanie szczególnych kategorii danych |
| `docs/architecture/bounded-contexts.md` | Documents & Forms context — odpowiedzialność za consent |
| `docs/architecture/adr/005-document-form-system.md` | **Kluczowy ADR** — principle 3: `data_category` jako mechanizm klasyfikacji; principle 4: consent gate enforcement jest architekturalnym wymogiem tego systemu, nie opcją |
| `docs/architecture/adr/004-tenant-isolation.md` | Consent enforcement musi działać per-tenant — nie ma "globalnej" zgody między salonami |

---

## Pliki kontekstowe (czytać na początku sesji)

```
app/api/forms/submit/[token]/route.ts    ← główny endpoint submit — tu brakuje consent check
app/api/forms/public/[token]/route.ts   ← GET publiczny formularza — sprawdź data_category exposure
app/api/forms/templates/route.ts        ← templates API — tu brakuje data_category filter
app/api/forms/templates/[id]/route.ts   ← single template — sprawdź access control
types/forms.ts                          ← FormField, FormTemplate, data_category enum
types/supabase.ts                       ← client_forms (health_consent_at), form_templates (data_category)
lib/forms/gdpr.ts                       ← utility GDPR (jeśli istnieje z TC-1)
lib/supabase/get-auth-context.ts        ← wzorzec auth context
```

---

## Scope

### Sesja 1 — API hardening (Claude bezpośrednio)

Wszystkie edycje < 50 linii zmian — Claude edytuje bezpośrednio.

| Task | Plik | Zmiana |
|------|------|--------|
| Enforce health_consent_at przy submit | `app/api/forms/submit/[token]/route.ts` | Jeśli `form_template.data_category` jest `health` lub `sensitive_health` → sprawdź czy `client_form.health_consent_at` jest null → jeśli null → return 422 z komunikatem |
| Enforce data_category access w templates API | `app/api/forms/templates/route.ts` | Filtruj `sensitive_health` templates: employee nie widzi (sprawdź role z JWT claims) |
| Block sensitive_health w single template GET | `app/api/forms/templates/[id]/route.ts` | Jeśli template.data_category === 'sensitive_health' i rola employee → 403 |

**Wzorzec consent check (wkleić w submit route):**
```typescript
// After fetching template and client_form:
const isHealthData = ['health', 'sensitive_health'].includes(template.data_category)
if (isHealthData && !clientForm.health_consent_at) {
  return NextResponse.json(
    { error: 'Health consent required before submitting this form' },
    { status: 422 }
  )
}
```

### Sesja 2 — UI + Testy (Codex)

| Task | Plik docelowy | Kto | Prompt hint |
|------|--------------|-----|-------------|
| UI: ostrzeżenie sensitive_health w import | `app/(dashboard)/[slug]/settings/import/page.tsx` | **Codex** | Dodaj badge/banner dla templates z data_category=sensitive_health; czyta typy z types/forms.ts |
| Unit test: consent gate | `tests/unit/forms/consent-gate.test.ts` | **Codex** | Test że submit bez health_consent_at → 422; z health_consent_at → 200 |
| Unit test: data_category filter | `tests/unit/forms/data-category-filter.test.ts` | **Codex** | Test że employee nie widzi sensitive_health templates |
| GDPR utility (jeśli nie istnieje) | `lib/forms/gdpr.ts` | **Codex** | Helper functions: `isHealthData(category)`, `requiresConsent(category)`, `canAccessHealthData(role)` |

---

## Kryteria wyjścia (Definition of Done)

- [ ] POST `/api/forms/submit/[token]` z formularzem zdrowotnym bez `health_consent_at` → HTTP 422
- [ ] GET `/api/forms/templates` dla employee nie zwraca `sensitive_health` templates
- [ ] GET `/api/forms/templates/[id]` dla employee z `sensitive_health` → HTTP 403
- [ ] `/settings/import` wyświetla wizualne ostrzeżenie przy kartach `sensitive_health`
- [ ] Unit testy: consent gate + data_category filter przechodzą
- [ ] `npx tsc --noEmit` — 0 błędów
- [ ] Manualna weryfikacja consent gate: POST `/api/forms/submit/[token]` z formularzem `data_category=health` bez `health_consent_at` → HTTP 422 (nie 200, nie 500)
- [ ] Manualna weryfikacja data_category: GET `/api/forms/templates` jako employee → brak `sensitive_health` templates w response
- [ ] Idempotency: submit tego samego formularza dwa razy → drugie wywołanie zwraca 409 lub idempotentny wynik (nie duplikat w DB)

---

## Ryzyka i obejścia

| Ryzyko | Obejście |
|--------|---------|
| `health_consent_at` kolumna nie istnieje w types → migracja TC-1 nie zastosowana | Sprawdź `types/supabase.ts` przed edycją; jeśli brak → wróć do TC-1 |
| `data_category` nie istnieje w form_templates → migracja TC-1 nie zastosowana | Jak wyżej |
| Codex zmienia logikę submit poza consent check | Prompt Codex z `--ephemeral` do review po zmianach |

---

## Resume command (następna sesja)

```
Przeczytaj docs/sprints/TC-2_forms-security-hardening.md.
Sprawdź stan: grep -n 'health_consent_at' app/api/forms/submit/[token]/route.ts (czy check jest).
Kontynuuj od pierwszego niezamkniętego task w sekcji Scope.
```
