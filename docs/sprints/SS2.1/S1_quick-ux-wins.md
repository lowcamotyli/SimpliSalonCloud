# Sprint S1 — Quick UX Wins

- Status: **NEXT**
- Zależności: brak (nie wymaga zmian DB)
- Szacowany czas: 1–2 sesje Claude

---

## Cel

Trzy niezależne ulepszenia UI o wysokim ROI i zerowym ryzyku regresji danych:
1. **Mini-kalendarz miesięczny** w sidebarze kalendarza — szybki podgląd wolnych terminów podczas rozmowy telefonicznej
2. **Akordeony usług** — grupy kategorii zamiast płaskiej listy w `services/page.tsx` i `booking-dialog.tsx`
3. **Zakładka "Formularze"** w profilu klienta — formularze zagnieżdżone pod konkretnym pacjentem, nie globalny rejestr

---

## Dokumenty referencyjne

| Dokument | Dlaczego |
|----------|---------|
| `docs/architecture/adr/004-tenant-isolation.md` | Nowy endpoint `/api/clients/[id]/forms` musi filtrować po `salon_id` |
| `docs/architecture/service-architecture.md` | Thin route handlers — nie inline logika w route |

---

## Pliki kontekstowe (czytać na początku sesji)

```
app/(dashboard)/[slug]/calendar/page.tsx          ← view_range: 1-60 — struktura sidebara, stan selectedDate
app/(dashboard)/[slug]/calendar/booking-dialog.tsx ← view_range: 1-60 — wzorzec selekcji usług
app/(dashboard)/[slug]/services/page.tsx           ← view_range: 1-60 — aktualna struktura listy usług
app/(dashboard)/[slug]/clients/[id]/page.tsx       ← view_range: 1-60 — wzorzec zakładek w profilu
app/api/clients/[id]/route.ts                      ← wzorzec auth (getAuthContext)
```

---

## Scope

### Sesja 1 — Mini-kalendarz + Akordeony

| Task | Plik | Kto | Linie |
|------|------|-----|-------|
| Nowy komponent MiniCalendar | `app/(dashboard)/[slug]/calendar/mini-calendar.tsx` | **codex-main** | ~80 |
| Integracja MiniCalendar w page | `app/(dashboard)/[slug]/calendar/page.tsx` | **codex-dad** | Edit ~20 |
| Akordeony w services/page | `app/(dashboard)/[slug]/services/page.tsx` | **Gemini** | Edit (666 linii) |
| Akordeony w booking-dialog | `app/(dashboard)/[slug]/calendar/booking-dialog.tsx` | **Gemini** | Edit (460 linii) |

**Kolejność dispatchowania:**
```
RÓWNOLEGLE:
  codex-main → mini-calendar.tsx (bg)
  Gemini     → services/page.tsx (bg)
  Gemini     → booking-dialog.tsx (bg)       ← osobne wywołanie!
WAIT all
  codex-dad  → calendar/page.tsx integracja (bg)   ← czeka na mini-calendar
WAIT
  npx tsc --noEmit
```

### Sesja 2 — Formularze w profilu klienta

| Task | Plik | Kto | Linie |
|------|------|-----|-------|
| Nowy endpoint listy formularzy klienta | `app/api/clients/[id]/forms/route.ts` | **codex-main** | ~60 |
| Zakładka "Formularze" w profilu | `app/(dashboard)/[slug]/clients/[id]/page.tsx` | **codex-dad** | Edit ~40 |

**Kolejność dispatchowania:**
```
codex-main → api/clients/[id]/forms/route.ts (bg)
WAIT
codex-dad  → clients/[id]/page.tsx zakładka (bg)
WAIT
npx tsc --noEmit
```

---

## Prompty

### codex-main → mini-calendar.tsx
```
Read app/(dashboard)/[slug]/calendar/page.tsx view_range 1-60 for state management context. Do NOT use Gemini.
Goal: Create a mini monthly calendar widget
File: app/(dashboard)/[slug]/calendar/mini-calendar.tsx
Requirements:
- 'use client' component using shadcn/ui
- Props: currentDate: Date, onDayClick: (date: Date) => void
- Navigation arrows (prev/next month) change displayed month only — do NOT call onDayClick
- Only explicit day click calls onDayClick
- Highlight today with accent color, highlight currently selected date differently
- No external fetch — pure presentational component
Done when: exports default MiniCalendar with correct prop types, no tsc errors
```

### codex-dad → calendar/page.tsx (po mini-calendar)
```
Read app/(dashboard)/[slug]/calendar/mini-calendar.tsx for props.
Read /mnt/d/SimpliSalonCLoud/app/(dashboard)/[slug]/calendar/page.tsx view_range 1-60 for sidebar structure.
Goal: Integrate MiniCalendar widget into calendar page left sidebar
File: /mnt/d/SimpliSalonCLoud/app/(dashboard)/[slug]/calendar/page.tsx
Constraints: do NOT break existing day/week view switching; keep existing selectedDate state
- Import MiniCalendar from ./mini-calendar
- Place it above employee list in the left sidebar panel
- When MiniCalendar.onDayClick → update existing selectedDate state → triggers existing booking fetch
Done when: MiniCalendar visible in sidebar, clicking a day navigates main calendar view
```

### Gemini → services/page.tsx (akordeony)
```
Refactor app/(dashboard)/[slug]/services/page.tsx to add accordion-based category grouping.

Requirements:
- Use shadcn/ui Accordion (AccordionItem per category)
- Group services by existing category field; services without category → "Inne" group at bottom
- Default render: first category expanded, rest collapsed
- Keep all existing CRUD (add/edit/delete service) fully intact
- Keep all existing state, handlers, and modals unchanged

File: app/(dashboard)/[slug]/services/page.tsx
```

### Gemini → booking-dialog.tsx (akordeony w selekcji)
```
Refactor the service selection step in app/(dashboard)/[slug]/calendar/booking-dialog.tsx to use category accordions.

Requirements:
- Use shadcn/ui Accordion — one AccordionItem per service category
- Services without category → "Inne" group at bottom
- Default: first category expanded
- Keep existing onSelect handler when user picks a service — do NOT change it
- Modify ONLY the service list rendering section — no other dialog steps

File: app/(dashboard)/[slug]/calendar/booking-dialog.tsx
```

### codex-main → clients/[id]/forms/route.ts
```
Read app/api/clients/[id]/route.ts for auth pattern. Do NOT use Gemini.
Goal: GET endpoint returning all form submissions for a specific client
File: app/api/clients/[id]/forms/route.ts
Requirements:
- GET handler only
- Auth via getAuthContext(); verify client belongs to same salon
- Query: SELECT id, template_id, submitted_at, status FROM form_submissions
         WHERE client_id = params.id AND salon_id = salonId
         ORDER BY submitted_at DESC
- Return: NextResponse.json({ submissions })
Done when: endpoint compiles, returns 401 without auth, returns submissions array with auth
```

### codex-dad → clients/[id]/page.tsx (zakładka)
```
Read /mnt/d/SimpliSalonCLoud/app/(dashboard)/[slug]/clients/[id]/page.tsx view_range 1-80 for tab pattern.
Goal: Add "Formularze" tab to client profile
File: /mnt/d/SimpliSalonCLoud/app/(dashboard)/[slug]/clients/[id]/page.tsx
Constraints: do NOT break existing tabs; keep existing data fetching
- Add new tab trigger "Formularze" using the existing Tabs component pattern
- In the tab content: fetch /api/clients/[id]/forms?salonId=salonId
- Render submissions as a list: form name (template_id), submitted_at formatted, status badge
- Click on a submission → link to /[slug]/forms/submissions (existing submissions view)
Done when: new tab visible without breaking other tabs
```

---

## Weryfikacja po każdej sesji

```bash
npx tsc --noEmit
# Sesja 1: sprawdź też wizualnie — otwórz /calendar i /services w przeglądarce
# Sesja 2: otwórz /clients/[id] — zakładka Formularze powinna być widoczna
```

---

## Definition of Done

- [ ] MiniCalendar widoczny w sidebarze kalendarza, klik → zmiana dnia w widoku głównym
- [ ] Nawigacja strzałkami mini-kalendarza nie przeładowuje głównego widoku
- [ ] Services/page grupuje usługi w akordeonach po kategoriach
- [ ] Booking-dialog grupuje usługi w akordeonach (selekcja podczas tworzenia wizyty)
- [ ] Profil klienta ma zakładkę "Formularze" z listą jego zgłoszeń
- [ ] `npx tsc --noEmit` — 0 błędów
