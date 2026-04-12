# Sprint SS2.3-23.2 — Bulk Addon Assignment (deferred from Sprint 23)

## Cel
Masowe przypisywanie / usuwanie dodatków z wielu usług naraz.
Kontynuacja Sprint 23 — odkryta niezgodność schematu uniemożliwiła wdrożenie w Sprint 23.

## Decyzja architektoniczna (podjęta)

**Problem:** Obecna tabela `service_addons` przechowuje definicje addonów per-usługa
(`service_id` FK, name/price_delta/duration_delta per rekord). Nie istnieje "shared addon template"
który można przypisać do wielu usług.

**Rozwiązanie — addon_templates (nowa tabela, bez zmiany istniejącego schematu):**
- Nowa tabela `addon_templates`: salon-level szablony addonów
- "Bulk assign" = INSERT INTO service_addons kopiując dane z szablonu dla każdej wybranej usługi
- "Bulk remove" = is_active = false na service_addons gdzie name IN (names z wybranych szablonów)
- Istniejący kod `service_addons` NIEZMIENIONY — backward compatible

**Dlaczego nie many-to-many join table:**
- Wymagałoby zmiany schematu service_addons (breaking)
- Booking system czyta service_addons.name/.price_delta bezpośrednio — zmiana = kaskada edytów
- Templates + copy approach daje te same efekty bez ryzyka

---

## Architektura — dokumenty referencyjne

```bash
DAD_PROMPT='Read /mnt/d/SimpliSalonCLoud/docs/architecture/data-architecture.md. List ALL constraints relevant to service_addons table and addon management. FORMAT: Bulleted list. Do NOT summarize away exceptions.' bash ~/.claude/scripts/dad-exec.sh
```

| Kiedy | Plik |
|-------|------|
| Nowa tabela addon_templates | `data-architecture.md` |
| RLS, salon_id isolation | `multi-tenant-architecture.md` |

---

## Zakres

### A — SQL Migration
- [ ] Tabela `addon_templates`:
  - `id UUID PK DEFAULT gen_random_uuid()`
  - `salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE`
  - `name TEXT NOT NULL`
  - `price_delta NUMERIC(10,2) NOT NULL DEFAULT 0`
  - `duration_delta INTEGER NOT NULL DEFAULT 0`
  - `created_at TIMESTAMPTZ DEFAULT now()`
  - UNIQUE(`salon_id`, `name`)
- [ ] RLS: SELECT/INSERT/UPDATE/DELETE WHERE salon_id = get_user_salon_id()

### B — API: batch addon assign/unassign

**`POST /api/services/batch/addons`**
1. getAuthContext() → salonId
2. Body: `{ service_ids: string[], template_ids: string[] }` (zod, max 100 each)
3. Verify template_ids belong to salonId
4. Verify service_ids belong to salonId
5. INSERT INTO service_addons (salon_id, service_id, name, price_delta, duration_delta, is_active)
   SELECT salonId, s, at.name, at.price_delta, at.duration_delta, true
   FROM unnest(service_ids) s CROSS JOIN addon_templates at
   WHERE at.id = ANY(template_ids) AND at.salon_id = salonId
   ON CONFLICT (salon_id, service_id, name) DO UPDATE SET is_active = true
6. Return `{ assigned_count: number }`

> Note: wymaga UNIQUE constraint na service_addons(salon_id, service_id, name) — jeśli nie istnieje,
> migration musi go dodać.

**`DELETE /api/services/batch/addons`**
1. getAuthContext() → salonId
2. Body: `{ service_ids: string[], template_ids: string[] }`
3. UPDATE service_addons SET is_active = false
   WHERE salon_id = salonId
   AND service_id = ANY(service_ids)
   AND name IN (SELECT name FROM addon_templates WHERE id = ANY(template_ids) AND salon_id = salonId)
4. Return `{ removed_count: number }`

**`GET /api/addon-templates`**
- Pobierz wszystkie szablony salonu (dla dialogu)

**`POST /api/addon-templates`**
- Utwórz nowy szablon

**`DELETE /api/addon-templates/[id]`**
- Usuń szablon

### C — UI: BulkAddonDialog

**`components/services/bulk-addon-dialog.tsx`**
- Props: `{ serviceIds: string[], mode: "assign" | "remove", open, onClose, onSuccess }`
- Fetch GET `/api/addon-templates`
- Wyświetl listę szablonów z Checkbox
- Jeśli brak szablonów: info + link do zarządzania szablonami
- Submit → POST lub DELETE `/api/services/batch/addons`
- Toast: "Przypisano N dodatków do M usług" / "Usunięto N dodatków z M usług"

### D — UI: Podpięcie do action bar (services/page.tsx)

Dwie nowe akcje w floating action bar (obok istniejących Aktywuj/Dezaktywuj):
- "Przypisz dodatki" → otwiera `<BulkAddonDialog mode="assign" />`
- "Usuń przypisanie" → otwiera `<BulkAddonDialog mode="remove" />`

### E — UI: Zarządzanie szablonami

**`app/(dashboard)/[slug]/services/addon-templates/page.tsx`** (lub sekcja w settings)
- Lista szablonów z przyciskiem Dodaj / Usuń
- Prosty formularz: nazwa, price_delta, duration_delta

---

## Pliki do stworzenia / modyfikacji

| Plik | Akcja | Worker |
|------|-------|--------|
| `supabase/migrations/[ts]_addon_templates.sql` | CREATE | codex-dad |
| `app/api/addon-templates/route.ts` | CREATE (GET, POST) | codex-dad |
| `app/api/addon-templates/[id]/route.ts` | CREATE (DELETE) | codex-dad |
| `app/api/services/batch/addons/route.ts` | CREATE (POST, DELETE) | codex-main |
| `components/services/bulk-addon-dialog.tsx` | CREATE | codex-main |
| `app/(dashboard)/[slug]/services/page.tsx` | EDIT — dwa nowe przyciski + dialog | Claude |
| `app/(dashboard)/[slug]/services/addon-templates/page.tsx` | CREATE | codex-dad |

## Zależności / sekwencja

```
Pattern C (migration-first):

codex-dad → SQL migration (addon_templates)
              ↓ wait
supabase db push
supabase gen types typescript --linked > types/supabase.ts
              ↓
codex-main → batch/addons/route.ts + bulk-addon-dialog.tsx (bg)
codex-dad  → addon-templates API + addon-templates page (bg)
              ↓ wait all
Claude     → Edit services/page.tsx (dwa przyciski + dialog state)
              ↓
tsc --noEmit
```

---

## Prompty

### codex-dad — SQL migration

```bash
DAD_PROMPT='Read .workflow/skills/sql-migration-safe.md and follow it.
Goal: Create addon_templates table migration.
File: /mnt/d/SimpliSalonCLoud/supabase/migrations/20260421000001_addon_templates.sql
Schema:
  CREATE TABLE addon_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    price_delta NUMERIC(10,2) NOT NULL DEFAULT 0,
    duration_delta INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(salon_id, name)
  );
  ALTER TABLE service_addons ADD CONSTRAINT IF NOT EXISTS service_addons_salon_service_name_unique UNIQUE (salon_id, service_id, name);
  RLS: enable + 4 policies (SELECT/INSERT/UPDATE/DELETE) using get_user_salon_id()
Pure SQL only. Done when: file written.' bash ~/.claude/scripts/dad-exec.sh
```

### codex-dad — addon-templates API + page

```bash
DAD_PROMPT='Read .workflow/skills/scoped-implementation.md and follow it.
Read lib/supabase/get-auth-context.ts for context.
Goal: Create addon templates CRUD API and management page.

File 1: /mnt/d/SimpliSalonCLoud/app/api/addon-templates/route.ts
GET: getAuthContext() → list addon_templates WHERE salon_id = salonId ORDER BY name
POST: body { name: string, price_delta: number, duration_delta: number } → INSERT, return created template

File 2: /mnt/d/SimpliSalonCLoud/app/api/addon-templates/[id]/route.ts
DELETE: getAuthContext() → DELETE WHERE id AND salon_id = salonId → { success: true }

File 3: /mnt/d/SimpliSalonCLoud/app/(dashboard)/[slug]/services/addon-templates/page.tsx
- "use client"
- Fetch GET /api/addon-templates
- List templates with name, price_delta, duration_delta + Delete button
- Add form: name (required), price_delta (default 0), duration_delta (default 0) → POST /api/addon-templates
- Toast on success. Use shadcn/ui components consistent with rest of app.

Done when: tsc clean.' bash ~/.claude/scripts/dad-exec.sh
```

### codex-main — batch/addons API + BulkAddonDialog

```bash
codex exec --dangerously-bypass-approvals-and-sandbox 'Read .workflow/skills/scoped-implementation.md and follow it.
Read app/api/services/batch/route.ts and lib/supabase/get-auth-context.ts for context. Do NOT use Gemini — write directly.

File 1: app/api/services/batch/addons/route.ts
POST handler:
1. getAuthContext() → salonId
2. Body zod: { service_ids: z.string().uuid().array().min(1).max(100), template_ids: z.string().uuid().array().min(1).max(50) }
3. Verify template_ids belong to salonId (SELECT from addon_templates)
4. Verify service_ids belong to salonId (SELECT from services)
5. For each (service_id, template) pair: INSERT INTO service_addons (salon_id, service_id, name, price_delta, duration_delta, is_active) VALUES (...) ON CONFLICT (salon_id, service_id, name) DO UPDATE SET is_active = true
6. Return { assigned_count: number }

DELETE handler (same file):
1. Same auth + same body shape
2. Get template names: SELECT name FROM addon_templates WHERE id = ANY(template_ids) AND salon_id = salonId
3. UPDATE service_addons SET is_active = false WHERE salon_id = salonId AND service_id = ANY(service_ids) AND name = ANY(template_names)
4. Return { removed_count: number }

File 2: components/services/bulk-addon-dialog.tsx
Props: { serviceIds: string[], mode: "assign" | "remove", open: boolean, onClose: () => void, onSuccess: () => void }
- Fetch GET /api/addon-templates on open
- Show loading state while fetching
- If no templates: "Brak szablonów dodatków. Utwórz szablony w Usługi > Szablony dodatków."
- Otherwise: list with Checkbox per template (name, price_delta, duration_delta as hints)
- Submit button: disabled if no templates selected
  - mode="assign": POST /api/services/batch/addons
  - mode="remove": DELETE /api/services/batch/addons
- Toast: "Przypisano X dodatków do Y usług" / "Usunięto X dodatków z Y usług"
- Use Dialog, Checkbox, Button from shadcn/ui

Done when: tsc clean'
```

### Claude — Edit services/page.tsx (po tsc clean z powyższych)

Dodaj do floating action bar dwa przyciski oraz state dla dialogu:
```tsx
const [addonDialogMode, setAddonDialogMode] = useState<"assign" | "remove" | null>(null)

// W action bar, przed "Odznacz wszystkie":
<Button onClick={() => setAddonDialogMode("assign")}>Przypisz dodatki</Button>
<Button variant="secondary" onClick={() => setAddonDialogMode("remove")}>Usuń przypisanie</Button>

// Pod action bar (lub na poziomie page return):
{addonDialogMode && (
  <BulkAddonDialog
    serviceIds={[...selectedIds]}
    mode={addonDialogMode}
    open={true}
    onClose={() => setAddonDialogMode(null)}
    onSuccess={() => { setAddonDialogMode(null); clearSelection(); refetch(); }}
  />
)}
```

---

## Weryfikacja po sprincie

```bash
npx tsc --noEmit
# Test: utwórz szablon "Przedłużenie" w addon-templates
# Test: zaznacz 3 usługi → "Przypisz dodatki" → wybierz "Przedłużenie" → confirm
# Sprawdź service_addons — powinny być 3 rekordy z name="Przedłużenie"
# Test: te same 3 usługi → "Usuń przypisanie" → confirm → is_active=false
```
