# Sprint SS2.2-23 — Bulk Actions: Usługi i Dodatki

## Cel
(P2) Masowe operacje na usługach i dodatkach — eliminacja bólu "wchodzenia w każdą usługę osobno"
przy dużym katalogu:
- zaznaczanie wielu usług checkboxem,
- bulk aktywuj/dezaktywuj,
- bulk przypisanie / usunięcie przypisania dodatku.

## Architektura — dokumenty referencyjne

```bash
DAD_PROMPT='Read /mnt/d/SimpliSalonCLoud/app/(dashboard)/[slug]/services/page.tsx. TASK: Describe current services list UI structure — how items are rendered, is there any selection mechanism, what actions are available. FORMAT: Bulleted list. LIMIT: Max 20 lines.' bash ~/.claude/scripts/dad-exec.sh
```

**Kluczowe constraints:**
- Zmiany czysto po stronie UI + nowe batch API endpoints
- Batch endpoint musi walidować `salon_id` dla każdego ID (IDOR prevention)
- Max batch size: 100 usług jednocześnie (limit w API)

## Zakres tego sprintu

### A — API: batch endpoints
- [ ] `PATCH /api/services/batch` — body: `{ ids: string[], action: "activate" | "deactivate" }`
  - Walidacja: wszystkie IDs należą do salonu
  - UPDATE services SET active = (action === "activate") WHERE id = ANY($ids) AND salon_id = $salonId
  - Zwróć `{ updated_count: number }`
- [ ] `POST /api/services/batch/addons` — body: `{ service_ids: string[], addon_ids: string[] }`
  - Dodaj przypisania w tabeli `service_addons` (lub odpowiedniku)
  - INSERT ... ON CONFLICT DO NOTHING
- [ ] `DELETE /api/services/batch/addons` — body: `{ service_ids: string[], addon_ids: string[] }`
  - Usuń przypisania

### B — UI: lista usług z selekcją
- [ ] `app/(dashboard)/[slug]/services/page.tsx`:
  - Dodaj Checkbox przy każdej usłudze + "Zaznacz wszystkie"
  - Floating action bar (fixed bottom lub sticky) pokazywany gdy > 0 zaznaczonych:
    - "Zaznaczono: N" | Aktywuj | Dezaktywuj | Przypisz dodatki | Usuń przypisanie | Odznacz wszystkie
  - "Aktywuj / Dezaktywuj" → PATCH `/api/services/batch`
  - "Przypisz dodatki" → otwiera dialog wyboru dodatków → POST batch/addons
  - "Usuń przypisanie" → otwiera dialog wyboru dodatków do usunięcia → DELETE batch/addons

### C — Dialog bulk addon assignment
- [ ] `components/services/bulk-addon-dialog.tsx`:
  - Lista dostępnych dodatków z checkboxami
  - Tryb: "przypisz" lub "usuń"
  - Submit → wywołuje odpowiedni batch API
  - Toast po zakończeniu: "Przypisano N dodatków do M usług"

## Pliki do stworzenia / modyfikacji

| Plik | Akcja | Worker |
|------|-------|--------|
| `app/api/services/batch/route.ts` | CREATE (PATCH) | codex-dad |
| `app/api/services/batch/addons/route.ts` | CREATE (POST, DELETE) | codex-dad |
| `app/(dashboard)/[slug]/services/page.tsx` | EDIT — checkboxy + action bar | codex-main |
| `components/services/bulk-addon-dialog.tsx` | CREATE | codex-main |

## Zależności
- **Wymaga:** sprint-04 (add-ons UI revamp — zna model danych addonów)
- **Blokuje:** nic

---

## Prompt — codex-dad (batch API)

```bash
DAD_PROMPT='Read app/api/services/route.ts and lib/supabase/get-auth-context.ts for context.
Goal: Create batch endpoints for services.

File 1: /mnt/d/SimpliSalonCLoud/app/api/services/batch/route.ts
PATCH handler:
1. getAuthContext() — salonId
2. Body: { ids: string[], action: "activate" | "deactivate" }
3. Validate: ids.length <= 100, action in enum
4. UPDATE services SET is_active = (action === "activate") WHERE id = ANY(ids::uuid[]) AND salon_id = salonId
5. Return { updated_count: number }

File 2: /mnt/d/SimpliSalonCLoud/app/api/services/batch/addons/route.ts
POST handler — assign addons:
1. getAuthContext() — salonId
2. Body: { service_ids: string[], addon_ids: string[] }
3. Verify all service_ids belong to salonId
4. INSERT INTO service_addons (salon_id, service_id, addon_id) SELECT $salonId, s, a FROM unnest($serviceIds) s, unnest($addonIds) a ON CONFLICT DO NOTHING
5. Return { assigned_count: number }

DELETE handler — remove addons:
1. Same auth/validation
2. DELETE FROM service_addons WHERE salon_id=$salonId AND service_id = ANY(service_ids) AND addon_id = ANY(addon_ids)
3. Return { removed_count: number }

Done when: tsc clean' bash ~/.claude/scripts/dad-exec.sh
```

---

## Prompt — codex-main (UI + bulk addon dialog)

```bash
codex exec --dangerously-bypass-approvals-and-sandbox 'Read app/(dashboard)/[slug]/services/page.tsx for context. Do NOT use Gemini — write directly.

Goal 1: Add bulk selection and action bar to services/page.tsx
- Add Checkbox to each service row and "Zaznacz wszystkie" in header
- Track selectedIds: Set<string> in state
- When selectedIds.size > 0: show sticky bottom action bar with:
  - "Zaznaczono: N usług" text
  - Button "Aktywuj" → PATCH /api/services/batch { ids, action: "activate" }
  - Button "Dezaktywuj" → PATCH /api/services/batch { ids, action: "deactivate" }
  - Button "Przypisz dodatki" → open BulkAddonDialog mode="assign"
  - Button "Usuń przypisanie dodatku" → open BulkAddonDialog mode="remove"
  - Button "Odznacz" → clear selection
- After API call: refetch services, clear selection, show toast

Goal 2: Create components/services/bulk-addon-dialog.tsx
Props: { serviceIds: string[], mode: "assign" | "remove", open, onClose, onSuccess }
- Fetch GET /api/addons (or existing addons endpoint) for this salon
- Display list with Checkboxes
- Submit: POST or DELETE /api/services/batch/addons
- Show "Gotowe: przypisano X dodatków do Y usług" after success

Done when: tsc clean'
```

---

## Weryfikacja po sprincie
```bash
npx tsc --noEmit
# Test: zaznacz 3 usługi → "Dezaktywuj" → wszystkie 3 nieaktywne
# Test: zaznacz 5 usług → "Przypisz dodatki" → wybierz 2 dodatki → confirm → przypisano
```
