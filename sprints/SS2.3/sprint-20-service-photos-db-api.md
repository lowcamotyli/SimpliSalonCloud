# Sprint SS2.2-20 — Service Photos / Gallery: DB + Storage + API

## Cel
(P1) Umożliwić salonowi dodawanie zdjęć i portfolio do usług.
Klient w public booking widzi efekty pracy przed rezerwacją.

Sprint koncentruje się na modelu danych, storage i API.
UI (upload + public display) → sprint-21.

## Architektura — dokumenty referencyjne

```bash
DAD_PROMPT='Read /mnt/d/SimpliSalonCLoud/docs/architecture/data-architecture.md. TASK: Describe how file storage is used (if at all) — bucket names, RLS policies for storage. Also describe services table structure. FORMAT: Bulleted list. LIMIT: Max 20 lines.' bash ~/.claude/scripts/dad-exec.sh
```

```bash
DAD_PROMPT='Read /mnt/d/SimpliSalonCLoud/docs/architecture/security-model.md. TASK: What are the rules for public vs private storage buckets? What pattern is used for user-uploaded files? FORMAT: Bulleted list. LIMIT: Max 15 lines.' bash ~/.claude/scripts/dad-exec.sh
```

**Kluczowe constraints:**
- Storage bucket: publiczny (klient musi widzieć zdjęcia bez auth)
- Limity: max 5 zdjęć na usługę (etap 1), max 2MB każde
- Format: JPEG/PNG/WebP tylko
- Kolejność: kolumna `sort_order` dla drag-and-drop w przyszłości
- RLS: upload tylko zalogowany salon owner/manager, odczyt publiczny

## Otwarte pytania (rozstrzygnij przed dispatchem)
- Czy "cover photo" (pierwsze zdjęcie) = wyróżnione, czy liczymy `sort_order = 0`? → sort_order, pierwsze = cover
- Czy dedykowany bucket `service-media` czy istniejący (np. `avatars`)? → Dedykowany `service-media`

## Zakres tego sprintu

### A — SQL Migration
- [ ] Tabela `service_media`:
  - `id UUID PK`
  - `salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE`
  - `service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE`
  - `storage_path TEXT NOT NULL` — Supabase Storage path
  - `public_url TEXT NOT NULL` — wygenerowany przy uploadzie
  - `alt_text TEXT`
  - `sort_order INT NOT NULL DEFAULT 0`
  - `created_at TIMESTAMPTZ DEFAULT now()`
  - UNIQUE(service_id, sort_order)
- [ ] RLS: SELECT = public (brak restriccji), INSERT/UPDATE/DELETE = salon_id = get_user_salon_id()
- [ ] Storage bucket `service-media`: publiczny, max 2MB, accept image/*

### B — API Endpoints
- [ ] `GET /api/services/[id]/media` — lista mediów usługi (public lub auth, oba akceptowalne)
- [ ] `POST /api/services/[id]/media` — upload nowego zdjęcia
  - Walidacja: max 5 zdjęć per usługa, max 2MB, typ pliku
  - Upload do Supabase Storage bucket `service-media`
  - INSERT do `service_media`
  - Zwróć `{ id, public_url, sort_order }`
- [ ] `DELETE /api/services/[id]/media/[mediaId]` — usuń zdjęcie (z storage + DB)
- [ ] `PATCH /api/services/[id]/media/reorder` — body `{ order: string[] }` (tablica media_id w nowej kolejności)

## Pliki do stworzenia / modyfikacji

| Plik | Akcja | Worker |
|------|-------|--------|
| `supabase/migrations/[ts]_service_media.sql` | CREATE | codex-dad |
| `app/api/services/[id]/media/route.ts` | CREATE (GET, POST) | codex-main |
| `app/api/services/[id]/media/[mediaId]/route.ts` | CREATE (DELETE) | codex-dad |
| `app/api/services/[id]/media/reorder/route.ts` | CREATE (PATCH) | codex-dad |

## Zależności
- **Wymaga:** sprint-18 (service descriptions — razem tworzą service detail)
- **Blokuje:** sprint-21 (UI uploadu i wyświetlania)

---

## Prompt — codex-dad (SQL migration)

```bash
DAD_PROMPT='Generate SQL migration for SimpliSalonCloud (Supabase/PostgreSQL).

1. Create table service_media:
- id UUID PRIMARY KEY DEFAULT gen_random_uuid()
- salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE
- service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE
- storage_path TEXT NOT NULL
- public_url TEXT NOT NULL
- alt_text TEXT
- sort_order INT NOT NULL DEFAULT 0
- created_at TIMESTAMPTZ NOT NULL DEFAULT now()
- UNIQUE(service_id, sort_order)

2. Enable RLS on service_media.
Policies:
- SELECT: true (public access, no restriction)
- INSERT: salon_id = get_user_salon_id()
- UPDATE: salon_id = get_user_salon_id()
- DELETE: salon_id = get_user_salon_id()

3. Create Supabase Storage bucket (SQL/config approach if possible, otherwise comment to create manually):
-- Bucket: service-media, public: true, allowed_mime_types: ['"'"'image/jpeg'"'"','"'"'image/png'"'"','"'"'image/webp'"'"'], file_size_limit: 2097152

Add indexes: (salon_id, service_id), (service_id, sort_order).
Write to /mnt/d/SimpliSalonCLoud/supabase/migrations/20260413000001_service_media.sql. Pure SQL only.' bash ~/.claude/scripts/dad-exec.sh
```

**Uwaga:** Bucket storage musi być też stworzony w Supabase Dashboard lub przez `supabase storage create` CLI.

---

## Prompt — codex-main (GET + POST /api/services/[id]/media)

```bash
codex exec --dangerously-bypass-approvals-and-sandbox 'Read app/api/services/[id]/route.ts and lib/supabase/get-auth-context.ts for context. Do NOT use Gemini — write directly.
Goal: Create app/api/services/[id]/media/route.ts with GET and POST handlers.

GET handler:
1. Extract serviceId from params
2. Query service_media WHERE service_id=$1 ORDER BY sort_order ASC
3. Return array (no auth required for GET)

POST handler:
1. getAuthContext() — salonId
2. Verify service belongs to salonId
3. Check count: if >= 5 photos → 422 "max_photos_reached"
4. Parse multipart form: file field "image"
5. Validate: size <= 2MB, type in [image/jpeg, image/png, image/webp]
6. Upload to Supabase Storage bucket "service-media" path: {salonId}/{serviceId}/{uuid}.{ext}
7. Get public URL from storage
8. INSERT into service_media: { salon_id, service_id, storage_path, public_url, sort_order: current_count }
9. Return { id, public_url, sort_order }

Done when: tsc clean'
```

---

## Prompt — codex-dad (DELETE + reorder)

```bash
DAD_PROMPT='Read app/api/services/[id]/media/route.ts for context.
Goal: Create 2 more media endpoints.

File 1: /mnt/d/SimpliSalonCLoud/app/api/services/[id]/media/[mediaId]/route.ts
DELETE handler:
1. getAuthContext() — salonId
2. SELECT storage_path FROM service_media WHERE id=$mediaId AND salon_id=$salonId
3. If not found → 404
4. Delete from Supabase Storage
5. DELETE from service_media
6. Reorder remaining: UPDATE sort_order to fill gap (sequential 0,1,2...)
7. Return 204

File 2: /mnt/d/SimpliSalonCLoud/app/api/services/[id]/media/reorder/route.ts
PATCH handler:
1. getAuthContext() — salonId
2. Body: { order: string[] } — array of media IDs in new order
3. Verify all IDs belong to this service + salonId
4. UPDATE service_media SET sort_order = index WHERE id = id
5. Return 200

Done when: tsc clean' bash ~/.claude/scripts/dad-exec.sh
```

---

## Po migracji — OBOWIĄZKOWE
```bash
supabase db push
supabase gen types typescript --linked > types/supabase.ts
npx tsc --noEmit
# Ręcznie: utwórz bucket "service-media" jako publiczny w Supabase Dashboard (jeśli SQL nie stworzy)
```
