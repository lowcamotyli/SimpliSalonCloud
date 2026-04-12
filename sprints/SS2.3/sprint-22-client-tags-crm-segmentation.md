# Sprint SS2.2-22 — Client Tags UI + CRM Segmentation

## Cel
(P2) Uzbroić istniejącą kolumnę `tags` w praktyczne UI:
- dodawanie/usuwanie tagów z profilu klienta,
- filtrowanie listy klientów po tagach,
- widoczność tagów w CRM segment builder.

W schemacie danych tagi już prawdopodobnie istnieją — sprint to domknięcie UX.

## Architektura — dokumenty referencyjne

```bash
grep -r "tags" supabase/migrations/ | head -20
```

```bash
DAD_PROMPT='Read /mnt/d/SimpliSalonCLoud/app/api/clients/route.ts. TASK: Does this file handle tags in client create/update? What filters are supported in GET? FORMAT: Bulleted list. LIMIT: Max 15 lines.' bash ~/.claude/scripts/dad-exec.sh
```

**Kluczowe constraints:**
- Tagi = TEXT[] lub JSONB w tabeli `clients` (sprawdź migration)
- Wolne etykiety (etap 1): brak predefiniowanych typów — użytkownik wpisuje co chce
- Tagi są widoczne per salon (nie globalnie — klient może mieć inne tagi w różnych salonach)
- Filtry CRM muszą korzystać z `tags @> ARRAY['VIP']` lub odpowiednika

## Zakres tego sprintu

### A — UI tagowania w profilu klienta
- [ ] `components/clients/client-tags.tsx`:
  - Wyświetla aktualne tagi jako Badges
  - Input do dodawania nowego tagu (Enter lub kliknięcie "+" zatwierdza)
  - Autocomplete sugeruje tagi używane przez salon (query top 20 tagów tego salonu)
  - Kliknięcie X na tagu → usuwa
  - Zapis przez PATCH `/api/clients/[id]` z `tags: string[]`
- [ ] Integracja w profilu klienta

### B — Filtrowanie klientów po tagach
- [ ] `app/(dashboard)/[slug]/clients/page.tsx` — dodaj multi-select filter "Tagi"
  - Pobierz listę unikalnych tagów z `/api/clients?distinct_tags=true`
  - Przekaż wybrane tagi jako query param `?tags=VIP,stały`
- [ ] `app/api/clients/route.ts` — obsłuż filtr `tags`:
  - `WHERE tags @> ARRAY[$1]::text[]` (PostgreSQL array contains)
  - Nowy query param `distinct_tags=true` → zwróć uniq tagów salonu

### C — Tagi w CRM segment builder
- [ ] `app/(dashboard)/[slug]/crm/segments/` lub odpowiednik:
  - Jeśli jest segment builder: dodaj kryterium "Tagi zawierają"
  - Pobierz listę tagów z API
  - Segment preview uwzględnia filtr tagów
- [ ] `app/api/crm/segments/preview/route.ts` — obsłuż filtr `tags`

## Pliki do stworzenia / modyfikacji

| Plik | Akcja | Worker |
|------|-------|--------|
| `components/clients/client-tags.tsx` | CREATE | codex-main |
| `app/(dashboard)/[slug]/clients/page.tsx` | EDIT — filter tagi | codex-dad |
| `app/api/clients/route.ts` | EDIT — filter + distinct_tags | codex-dad |
| `app/api/crm/segments/preview/route.ts` | EDIT — tags filter | codex-dad |

## Zależności
- **Wymaga:** nic (tagi prawdopodobnie już w schemacie)
- **Blokuje:** sprint-23 (bulk actions), sprint-24 (premium hours — segmentacja klientów)

---

## Prompt — codex-main (ClientTags component)

```bash
codex exec --dangerously-bypass-approvals-and-sandbox 'Read app/api/clients/route.ts for context. Do NOT use Gemini — write directly.
Goal: Create components/clients/client-tags.tsx — client-side component for managing client tags.

Props: { clientId: string, initialTags: string[], onUpdate?: (tags: string[]) => void }

State: tags: string[], inputValue: string, loading: boolean, suggestions: string[]

On mount: fetch GET /api/clients?distinct_tags=true&limit=20 → populate suggestions

UI:
- Flex wrap row of Badge elements for each tag, each with X button to remove
- Input field with autocomplete (datalist or Combobox) for suggestions
- Press Enter or click "+" to add the tag (trim, lowercase, deduplicate)
- After any add/remove: PATCH /api/clients/[clientId] with new tags array
- Show loading state during save

Use shadcn/ui: Badge, Input, Button. Done when: tsc clean'
```

---

## Prompt — codex-dad (API + clients list filter + CRM)

```bash
DAD_PROMPT='Read app/api/clients/route.ts, app/(dashboard)/[slug]/clients/page.tsx, and app/api/crm/segments/preview/route.ts.
Goal: 3 changes for tags support.

Change 1 — app/api/clients/route.ts GET:
- New query param: tags=VIP,stały → filter WHERE tags @> ARRAY[...tags]::text[]
- New query param: distinct_tags=true → instead of rows, return { tags: string[] } (SELECT DISTINCT unnest(tags) FROM clients WHERE salon_id=$1 ORDER BY 1 LIMIT 50)
- PATCH /api/clients/[id] should already accept tags (verify, add if missing): update tags = $1 WHERE id = $2 AND salon_id = $3

Change 2 — app/(dashboard)/[slug]/clients/page.tsx:
- Add "Tagi" multi-select filter above client list
- Fetch distinct tags from GET /api/clients?distinct_tags=true
- On selection: update URL query params and refetch clients with tags filter

Change 3 — app/api/crm/segments/preview/route.ts:
- Add support for tags criterion in segment filter: if segment includes { field: "tags", operator: "contains", values: [...] } → add WHERE tags @> ARRAY[...values]::text[]

Done when: tsc clean' bash ~/.claude/scripts/dad-exec.sh
```

---

## Weryfikacja po sprincie
```bash
npx tsc --noEmit
# Test: otwórz profil klienta → dodaj tag "VIP" → badge widoczny
# Test: lista klientów → filter "VIP" → tylko klienci z tagiem VIP
# Test: CRM → segment z tagiem "VIP" → preview pokazuje właściwych klientów
```
