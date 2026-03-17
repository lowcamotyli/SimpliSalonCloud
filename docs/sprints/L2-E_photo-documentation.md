# Sprint L2-E — Photo Documentation

- Status: **TODO** (po L2-B)
- Zależności: L2-A (treatment_records muszą istnieć), TC-2 (health_consent_at enforcement)
- Szacowany czas: 2 sesje Claude
- Uwaga: L2-E może być realizowany równolegle z L2-C/L2-D (brak zależności między nimi)

---

## Cel

Dokumentacja fotograficzna before/after powiązana z kartą zabiegu. Private Supabase Storage bucket z consent gate — zdjęcia tylko gdy klient wyraził zgodę zdrowotną. GDPR: endpoint do usunięcia zdjęć klienta.

---

## Dokumenty referencyjne

| Dokument | Dlaczego |
|----------|---------|
| `docs/SS2.0/v2.0-definition.md` sekcja 3.2 (Photo Documentation) | Feature spec, consent gate, GDPR delete, limits |
| `docs/architecture/data-architecture.md` | T5 sensitivity tier, consent gate pattern, foto retention 2 lat |
| `docs/architecture/security-model.md` | Storage security — private bucket, signed URLs |
| `docs/legal/medical-data-supabase-gdpr-guidance.md` | GDPR Art. 9 — zdjęcia as biometric/health data |
| `docs/architecture/adr/005-document-form-system.md` | **Kluczowy ADR** — principle 4: zdjęcia to T5 sensitivity tier (najwyższy); są "dokumentem" w rozumieniu form system — podlegają tym samym consent gates co formularze zdrowotne |
| `docs/architecture/adr/004-tenant-isolation.md` | Storage bucket path MUSI zaczynać się od `{salon_id}/` — to tenant isolation w Storage (nie tylko w DB); storage RLS policy weryfikuje `(storage.foldername(name))[1] = get_user_salon_id()` |
| `docs/architecture/adr/002-domain-modules.md` | Zdjęcia są sub-modułem Treatment Records, nie Forms — `lib/treatment-records/photos.ts`; dostęp przez treatment_record_id, nie bezpośrednio przez client_id |
| `docs/architecture/service-architecture.md` | Upload handler jest thin: walidacja → `lib/treatment-records/photos.ts` uploadPhoto() → return signed_url; consent check i storage upload w service function, nie w route |
| `docs/architecture/multi-tenant-architecture.md` | Storage path = `{salon_id}/{record_id}/{uuid}.ext` — tenant isolation przez path prefix; storage RLS weryfikuje prefix przez `storage.foldername()` |

---

## Pliki kontekstowe (czytać na początku sesji)

```
types/supabase.ts                                           ← client_forms (health_consent_at), treatment_records
lib/forms/encryption.ts                                     ← wzorzec consent check
lib/supabase/get-auth-context.ts                            ← sygnatura
app/api/treatment-records/[id]/route.ts                     ← wzorzec API z L2-A
app/(dashboard)/[slug]/clients/[id]/treatment-records/[recordId]/page.tsx  ← tu dodamy photo section
```

---

## Scope

### Sesja 1 — Storage Config + SQL + Upload API

> **WAŻNE:** Bucket Storage musi istnieć ZANIM API routes będą deployowane. Migrations SQL tworzą bucket w DB, ale bucket w Storage UI jest osobny. Sprawdź Dashboard → Storage po `supabase db push`.

| Task | Plik | Kto | Metoda |
|------|------|-----|--------|
| Supabase Storage: bucket + policies | `supabase/migrations/YYYYMMDD_treatment_photos_storage.sql` | Claude (Write, < 30 linii SQL) | Write |
| SQL: treatment_photos table | `supabase/migrations/YYYYMMDD_treatment_photos.sql` | **Gemini** | `gemini -p` |
| Regenerate Supabase types | `types/supabase.ts` | Claude | bash |
| API: upload (signed URL) | `app/api/treatment-photos/route.ts` | **Codex** | ~80 linii |
| API: GDPR delete | `app/api/treatment-photos/[id]/route.ts` | **Codex** | ~50 linii |

**SQL Storage bucket (Claude pisze bezpośrednio — < 30 linii):**
```sql
-- Supabase Storage bucket (przez API lub migration)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'treatment-photos',
  'treatment-photos',
  false,  -- PRIVATE bucket
  10485760,  -- 10MB per file
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: tylko authenticated + salon owner/manager
CREATE POLICY "treatment_photos_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'treatment-photos'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = public.get_user_salon_id()::text
  );

CREATE POLICY "treatment_photos_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'treatment-photos'
    AND auth.role() = 'authenticated'
    AND public.has_any_salon_role(ARRAY['owner', 'manager', 'employee'])
    AND (storage.foldername(name))[1] = public.get_user_salon_id()::text
  );

CREATE POLICY "treatment_photos_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'treatment-photos'
    AND auth.role() = 'authenticated'
    AND public.has_any_salon_role(ARRAY['owner', 'manager'])
  );
```

**Prompt Gemini dla treatment_photos table:**
```
Generate a PostgreSQL migration for Supabase.

Create table 'treatment_photos' with these columns:
- id: uuid PRIMARY KEY DEFAULT gen_random_uuid()
- salon_id: uuid NOT NULL REFERENCES salons(id) ON DELETE CASCADE
- treatment_record_id: uuid NOT NULL REFERENCES treatment_records(id) ON DELETE CASCADE
- client_id: uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE
- storage_path: text NOT NULL (path in 'treatment-photos' bucket, format: {salon_id}/{record_id}/{uuid}.jpg)
- photo_type: text NOT NULL CHECK (photo_type IN ('before', 'after', 'during', 'other'))
- taken_at: timestamptz NOT NULL DEFAULT now()
- notes: text
- created_by: uuid NOT NULL REFERENCES auth.users(id)
- created_at: timestamptz NOT NULL DEFAULT now()

RLS:
- Enable RLS
- SELECT: salon_id = public.get_user_salon_id() — all roles (owner, manager, employee)
  Per v2.0 definition: employee can view photos read-only
- INSERT: salon_id = public.get_user_salon_id() AND has_any_salon_role(ARRAY['owner','manager','employee'])
- DELETE: salon_id = public.get_user_salon_id() AND has_any_salon_role(ARRAY['owner','manager'])

Indexes: (treatment_record_id), (salon_id, client_id)

Output ONLY valid SQL. No markdown, no explanations.
```

**Prompt Codex dla upload API:**
```
Read lib/supabase/get-auth-context.ts, types/supabase.ts (treatment_photos, client_forms sections),
app/api/treatment-records/[id]/route.ts for context.
Do NOT use Gemini — write directly.

FILE 1: app/api/treatment-photos/route.ts
- POST: upload photo to treatment record
  - Body: treatment_record_id, photo_type ('before'|'after'|'during'|'other'), file (base64 or multipart)
  - CONSENT GATE: fetch client_form for this record's client — if health_consent_at is null → return 422 'Health consent required'
  - Fetch treatment_record to get client_id
  - Upload to Supabase Storage bucket 'treatment-photos', path: {salon_id}/{record_id}/{uuid}.{ext}
  - Insert record to treatment_photos table
  - Return { id, storage_path, signed_url (60min expiry) }
  - Use supabase.storage.from('treatment-photos').upload() and createSignedUrl()

FILE 2: app/api/treatment-photos/[id]/route.ts
- GET: get single photo (returns signed URL, 60min expiry)
- DELETE: GDPR delete — remove from storage.objects AND delete treatment_photos row (owner/manager only)

Write both files directly.
```

### Sesja 2 — UI Component + Integration

| Task | Plik | Kto | Linie |
|------|------|-----|-------|
| Komponent: PhotoUpload | `components/treatment-records/photo-upload.tsx` | **Gemini** | ~180 linii |
| Consent gate komunikat | `components/treatment-records/photo-upload.tsx` | Claude | Edit ~10 linii |
| Integracja w widoku karty | `app/(dashboard)/[slug]/clients/[id]/treatment-records/[recordId]/page.tsx` | Claude | Edit ~20 linii |

**Typy dla Gemini:**
```typescript
type TreatmentPhoto = {
  id: string
  treatment_record_id: string
  photo_type: 'before' | 'after' | 'during' | 'other'
  storage_path: string
  taken_at: string
  notes: string | null
  signed_url?: string  // returned by API
}
```

**Prompt Gemini dla PhotoUpload komponentu:**
```
Generate a React 'use client' component at:
components/treatment-records/photo-upload.tsx

Props:
- treatmentRecordId: string
- clientId: string
- hasHealthConsent: boolean  (from parent — if false, show consent required message)
- onPhotoAdded: (photo: TreatmentPhoto) => void

Types needed:
[wklej TreatmentPhoto type]

Requirements:
- If hasHealthConsent === false: render Alert "Klient nie wyraził zgody zdrowotnej. Zdjęcia niedostępne."
- If hasHealthConsent === true:
  - File input (accept: image/jpeg,image/png,image/webp, max 10MB)
  - Photo type selector: before / after / during / other
  - Upload button → POST /api/treatment-photos
  - After upload: show thumbnail (signed_url from response)
  - List existing photos: GET /api/treatment-photos?treatment_record_id=[id] (add this endpoint if needed)
  - Each photo: thumbnail, type badge, delete button (calls DELETE /api/treatment-photos/[id])
  - Loading states, error handling

Output ONLY valid TypeScript/TSX. No markdown, no explanations.
```

---

## Limity storage per plan (implementacja w L2-E lub billing sprint)

Zanotuj jako TODO — nie blokuje shipu v2.0:
```
Professional: 500MB per salon
Business: 5GB per salon
→ Sprawdzenie w upload API: query sum(file_size) from storage.objects where bucket='treatment-photos' and path starts with salon_id
→ Jeśli > limit: return 402
```

---

## Kryteria wyjścia (Definition of Done)

- [ ] Supabase Storage bucket `treatment-photos` — private, max 10MB/plik, JPEG/PNG/WebP
- [ ] `supabase db push` — migracja `treatment_photos` zastosowana
- [ ] POST `/api/treatment-photos` — bez `health_consent_at` → HTTP 422
- [ ] POST `/api/treatment-photos` — z zgodą → plik w Storage, rekord w DB, zwraca signed_url
- [ ] DELETE `/api/treatment-photos/[id]` — usuwa z Storage I DB (GDPR hard delete)
- [ ] Widok karty zabiegu wyświetla sekcję zdjęć (PhotoUpload komponent)
- [ ] Jeśli brak zgody: informacja "zdjęcia niedostępne" (nie upload button)
- [ ] Employee widzi thumbnails read-only (bez delete button)
- [ ] `npx tsc --noEmit` — 0 błędów

---

## Ryzyka i obejścia

| Ryzyko | Obejście |
|--------|---------|
| Supabase Storage policies mają inną składnię niż regular RLS | Testuj przez Supabase Dashboard → Storage → Policies |
| Base64 upload zbyt wolne dla dużych plików | Alternatywa: presigned upload URL (klient uploaduje bezpośrednio do Storage) — Codex może wybrać to podejście |
| signed_url wygasa → thumbnail broken po 60min | Dla widoku: pobierz fresh URL przy każdym GET, nie cachuj |
| `health_consent_at` null gdy klient ma starsze formy | Akceptowalne — wymagaj ponownej zgody lub oznacz ręcznie przez owner |

---

## Resume command (następna sesja)

```
Przeczytaj docs/sprints/L2-E_photo-documentation.md.
Sprawdź: ls supabase/migrations/ | grep photo (czy migracje są).
Sprawdź: ls components/treatment-records/ (czy PhotoUpload istnieje).
Kontynuuj od pierwszego niezamkniętego task.
```
