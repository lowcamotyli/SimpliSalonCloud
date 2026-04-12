# Sprint SS2.2-19 — Regulamin Salonu i Akceptacja przy Rezerwacji

## Cel
(P1) Salon może wkleić własny regulamin lub podać URL zewnętrzny.
Klient musi zaznaczyć checkbox akceptacji przed finalizacją rezerwacji.
Fakt akceptacji jest zapisywany przy bookingu.

## Architektura — dokumenty referencyjne

```bash
DAD_PROMPT='Read /mnt/d/SimpliSalonCLoud/docs/architecture/data-architecture.md. TASK: Describe the bookings table structure and salon_settings/salons table — what fields are stored, how settings are serialized. FORMAT: Bulleted list. LIMIT: Max 15 lines.' bash ~/.claude/scripts/dad-exec.sh
```

| Dokument | Dlaczego |
|----------|----------|
| `docs/architecture/data-architecture.md` | Struktura bookings i salon settings |
| `docs/architecture/security-model.md` | Public booking endpoint — co można dodać bez auth |

**Kluczowe constraints:**
- Regulamin = per salon (w `salon_settings` lub kolumna `salons`)
- Akceptacja = `terms_accepted_at TIMESTAMPTZ` na tabeli `bookings`
- Jeśli salon NIE ma regulaminu — checkbox nie jest wymagany (nie blokuje rezerwacji)
- Regulamin to plain text lub URL — etap 1: oba opcjonalnie (jedno z dwóch)

## Otwarte pytania (rozstrzygnij przed dispatchem)
- Regulamin jako treść w bazie (TEXT) czy tylko URL? → Rekomendacja: dwa pola: `terms_text TEXT` + `terms_url TEXT`, użyj któregokolwiek
- Czy brak akceptacji ma blokować rezerwację, czy tylko wymagać checkboxa? → Blokuje jeśli salon ma ustawiony regulamin

## Zakres tego sprintu

### A — SQL Migration
- [ ] `salon_settings` (lub `salons`): dodaj `terms_text TEXT` i `terms_url TEXT`
- [ ] `bookings`: dodaj `terms_accepted_at TIMESTAMPTZ NULL`

### B — Panel: ustawienia regulaminu
- [ ] Nowa sekcja w `app/(dashboard)/[slug]/settings/business/page.tsx`:
  - Textarea "Treść regulaminu" + Input "URL regulaminu" (alternatywy — jedno z drugiem)
  - Podgląd (jeśli wklejony tekst)
  - Zapis przez istniejący PATCH `/api/settings`

### C — Public booking flow
- [ ] Przed etapem potwierdzenia rezerwacji: jeśli `terms_text` lub `terms_url` jest ustawiony →
  - Pokaż treść regulaminu (lub link do URL otwierający w nowym oknie)
  - Wymagany checkbox "Zapoznałem/am się z regulaminem i akceptuję jego treść"
  - Jeśli nieznaczony → przycisk "Potwierdź rezerwację" disabled
- [ ] W POST `/api/public/bookings` — jeśli salon ma regulamin i `terms_accepted: true` w body → zapisz `terms_accepted_at = now()` do bookings

### D — API: settings endpoint
- [ ] `PATCH /api/settings` — akceptuj `terms_text` i `terms_url` w body
- [ ] `GET /api/public/salon/[slug]` (lub odpowiednik) — zwróć `has_terms`, `terms_text`, `terms_url`

## Pliki do stworzenia / modyfikacji

| Plik | Akcja | Worker |
|------|-------|--------|
| `supabase/migrations/[ts]_salon_terms.sql` | CREATE | codex-dad |
| `app/(dashboard)/[slug]/settings/business/page.tsx` | EDIT — sekcja regulamin | codex-main |
| `app/api/settings/route.ts` | EDIT — dodaj terms_text/url | codex-dad |
| `app/api/public/bookings/route.ts` | EDIT — zapisz terms_accepted_at | codex-dad |
| `app/booking/[slug]/components/booking-confirmation.tsx` | EDIT — checkbox regulamin | codex-main |

## Zależności
- **Wymaga:** nic (niezależne)
- **Blokuje:** sprint-20 (public booking content — razem buduje trust layer)

---

## Prompt — codex-dad (SQL migration)

```bash
DAD_PROMPT='Generate SQL migration for SimpliSalonCloud.

1. Add to salons table (or salon_settings if that exists separately):
   ALTER TABLE salons ADD COLUMN IF NOT EXISTS terms_text TEXT;
   ALTER TABLE salons ADD COLUMN IF NOT EXISTS terms_url TEXT;

2. Add to bookings table:
   ALTER TABLE bookings ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;

Write to /mnt/d/SimpliSalonCLoud/supabase/migrations/20260412000001_salon_terms.sql. Pure SQL only.' bash ~/.claude/scripts/dad-exec.sh
```

---

## Prompt — codex-dad (API: settings + public bookings)

```bash
DAD_PROMPT='Read app/api/settings/route.ts and app/api/public/bookings/route.ts.
Goal: 2 API changes.

Change 1 — app/api/settings/route.ts:
- PATCH accepts terms_text: string and terms_url: string (both optional)
- Update salons table: SET terms_text=$1, terms_url=$2 WHERE id = salonId
- Return updated settings

Change 2 — app/api/public/bookings/route.ts:
- POST accepts optional terms_accepted: boolean in body
- If salon has terms (terms_text or terms_url) and terms_accepted != true → return 422 { error: "terms_not_accepted" }
- If terms_accepted = true → set bookings.terms_accepted_at = now() in INSERT

Done when: tsc clean' bash ~/.claude/scripts/dad-exec.sh
```

---

## Prompt — codex-main (Settings UI + public booking checkbox)

```bash
codex exec --dangerously-bypass-approvals-and-sandbox 'Read app/(dashboard)/[slug]/settings/business/page.tsx and the public booking confirmation step for context. Do NOT use Gemini — write directly.

Goal 1: Add terms section to settings/business/page.tsx
- Heading "Regulamin salonu"
- Textarea "Treść regulaminu" (terms_text, max 5000 chars) with character counter
- Input "URL regulaminu" (terms_url) with note "Jeśli podasz URL, treść powyżej będzie ignorowana"
- Save button → PATCH /api/settings

Goal 2: Add terms acceptance checkbox to public booking confirmation
- Find the confirmation step component in public booking flow
- If salonData.terms_text or salonData.terms_url exists: show Checkbox "Zapoznałem/am się z regulaminem"
- If terms_url: show link "Przeczytaj regulamin" opening in new tab
- If terms_text: show collapsible with full text
- Disable confirm button until checkbox is checked
- Include terms_accepted: true in booking POST body

Done when: tsc clean'
```

---

## Weryfikacja po sprincie
```bash
npx tsc --noEmit
# Panel: ustawienia → regulamin → wklej tekst → zapisz
# Public flow: zarezerwuj wizytę → checkbox pojawia się → nieznaczony = przycisk disabled
# DB: sprawdź bookings.terms_accepted_at po rezerwacji
```
