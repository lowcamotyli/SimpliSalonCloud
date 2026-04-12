# Sprint SS2.2-18 — Service Descriptions End-to-End

## Cel
(P1) Upewnić się, że opis usługi istnieje w modelu danych, jest edytowalny w panelu
i wyświetlany w publicznym flow rezerwacji — ograniczając obawy klientów przed wizytą.

## Architektura — dokumenty referencyjne

```bash
DAD_PROMPT='Read /mnt/d/SimpliSalonCLoud/docs/architecture/data-architecture.md. TASK: Check if services table has description field. Describe public booking flow data model — what service fields are exposed in public API. FORMAT: Bulleted list. LIMIT: Max 15 lines.' bash ~/.claude/scripts/dad-exec.sh
```

**Kluczowe constraints:**
- Opis może zawierać tekst z formatowaniem — plain text lub markdown (decyzja: plain text w etapie 1)
- Public API `/api/public/services` musi zwracać description bez auth
- Opis opcjonalny — nie blokuj rezerwacji jeśli brak opisu

## Otwarte pytania (rozstrzygnij przed dispatchem)
- Czy kolumna `description` już istnieje w tabeli `services`? → Sprawdź przed dispatchem:
  ```bash
  grep -r "description" supabase/migrations/ | grep -i "services"
  ```
- Jeśli nie istnieje → potrzebna mała migracja (ALTER TABLE services ADD COLUMN description TEXT)

## Zakres tego sprintu

### Krok 0 — weryfikacja schematu
```bash
# Sprawdź czy services.description istnieje:
grep -r "description" supabase/migrations/ | grep -i "services"
# Jeśli brak → uruchom codex-dad dla migracji ALTER TABLE
```

### A — API (jeśli potrzebna zmiana)
- [ ] Upewnij się, że `GET /api/services` zwraca pole `description`
- [ ] Upewnij się, że `GET /api/public/services` zwraca pole `description` (public, bez auth)
- [ ] `PATCH /api/services/[id]` akceptuje `description` w body

### B — Panel: formularz edycji usługi
- [ ] Dodaj pole `Opis usługi` (Textarea, max 1000 znaków) w formularzu tworzenia i edycji usługi
- [ ] Licznik znaków poniżej pola
- [ ] Zapis przez istniejący endpoint PATCH/POST

### C — Public booking flow
- [ ] Przy wyborze usługi w public booking (`app/booking/[slug]/...`) — dodaj tooltip lub expand z opisem
- [ ] Jeśli opis istnieje: ikona "i" lub link "Dowiedz się więcej" rozwijający tekst
- [ ] Jeśli brak opisu — żaden element nie jest dodawany

## Pliki do stworzenia / modyfikacji

| Plik | Akcja | Worker |
|------|-------|--------|
| `supabase/migrations/[ts]_services_description.sql` | CREATE (jeśli potrzebna) | codex-dad |
| `app/api/services/route.ts` | EDIT — upewnij się, że description jest w SELECT | codex-dad |
| `app/api/public/services/route.ts` | EDIT — dodaj description do public response | codex-dad |
| `components/services/service-form.tsx` | EDIT — pole Textarea | codex-main |
| `app/booking/[slug]/components/service-selector.tsx` | EDIT — opis w UI | codex-main |

## Zależności
- **Wymaga:** sprint-01/02 (services są w kontekście employee-service)
- **Blokuje:** sprint-19 (zdjęcia usług — razem tworzą public service detail)

---

## Prompt — codex-dad (migracja jeśli potrzebna)

```bash
# Tylko gdy grep potwierdzi brak kolumny:
DAD_PROMPT='Generate SQL migration for SimpliSalonCloud.
ALTER TABLE services ADD COLUMN IF NOT EXISTS description TEXT;
COMMENT ON COLUMN services.description IS '"'"'Optional description visible to clients in public booking flow'"'"';
Write to /mnt/d/SimpliSalonCLoud/supabase/migrations/20260411000001_services_description.sql. Pure SQL only.' bash ~/.claude/scripts/dad-exec.sh
```

---

## Prompt — codex-dad (API updates)

```bash
DAD_PROMPT='Read app/api/services/route.ts and app/api/public/services/route.ts.
Goal: Ensure both endpoints include description field.

Changes:
1. app/api/services/route.ts — in SELECT query add description field; in PATCH handler accept description in body
2. app/api/public/services/route.ts — add description to SELECT (public endpoint, no auth required for reading)

Do not break existing logic. Done when: tsc clean' bash ~/.claude/scripts/dad-exec.sh
```

---

## Prompt — codex-main (form + public UI)

```bash
codex exec --dangerously-bypass-approvals-and-sandbox 'Read components/services/service-form.tsx and the public booking service selection component for context. Do NOT use Gemini — write directly.

Goal 1: Add description textarea to service-form.tsx
- Add Textarea field "Opis usługi" with maxLength=1000, character counter below
- Connect to form state (existing form library used in the file)
- Save via existing submit handler

Goal 2: Show description in public booking service selector
- Find the component where services are listed for selection in public booking
- If service has description: add expandable text or tooltip showing description
- Use shadcn/ui Collapsible or Tooltip

Done when: tsc clean'
```

---

## Weryfikacja po sprincie
```bash
npx tsc --noEmit
# Panel: edytuj usługę → dodaj opis → zapisz → opis widoczny
# Public flow: wybierz usługę z opisem → opis widoczny przy karcie
```
