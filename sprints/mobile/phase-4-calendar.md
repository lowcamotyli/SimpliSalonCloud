# Sprint: Mobile Phase 4 — Calendar & Specialized Pages
**Branch:** Booksy2.0 (lub `fix/mobile-phase-4`)
**Prereq:** Phase 3 done

---

## Intent
Kalendarz tygodniowy/dzienny jest prawdopodobnie nieczytelny na telefonach — kolumny pracowników zbyt wąskie.
Strategia: mobile default = day view, horizontal scroll dla wielu pracowników.
Pozostałe strony: reports charts, payroll tabela, billing plan cards.

---

## ⚠️ WYMAGANY PRE-READ przed dispatchem

Struktura kalendarza jest nieznana. **Przed napisaniem promptów:**

```bash
# Krok 1 — Poznaj strukturę kalendarza
DAD_PROMPT='Read /mnt/d/SimpliSalonCLoud/app/(dashboard)/[slug]/calendar/page.tsx and /mnt/d/SimpliSalonCLoud/app/(dashboard)/[slug]/calendar/booking-card.tsx. TASK: describe the calendar layout structure — how are employee columns rendered? Is there a week/day/month view switcher? What state controls the current view? What component renders the time grid? FORMAT: Bullets. Do NOT summarize away implementation details.' bash ~/.claude/scripts/dad-exec.sh

# Krok 2 — Poznaj booking-dialog jeśli potrzebny
DAD_PROMPT='Read /mnt/d/SimpliSalonCLoud/app/(dashboard)/[slug]/calendar/booking-dialog.tsx. TASK: Is there a DialogContent max-w? Any fixed widths that would break on mobile? FORMAT: Bullets. LIMIT: Max 15 lines.' bash ~/.claude/scripts/dad-exec.sh

# Krok 3 — Reports i Payroll
DAD_PROMPT='Read /mnt/d/SimpliSalonCLoud/app/(dashboard)/[slug]/reports/page.tsx. TASK: what chart components are used? Are they from recharts/chart.js? Any fixed width/height on charts? FORMAT: Bullets. LIMIT: Max 15 lines.' bash ~/.claude/scripts/dad-exec.sh
```

**Po pre-read: zaktualizuj sekcję "Detale implementacji" poniżej i napisz finalne prompty.**

---

## Acceptance criteria
- [ ] Kalendarz mobile (375px): day view domyślny, czytelny — jeden pracownik lub horizontal scroll
- [ ] Kalendarz tablet (768px): 3-dniowy widok lub day view z wieloma pracownikami w horizontal scroll
- [ ] Booking dialog: `max-w-[95vw] sm:max-w-lg` — nie wychodzi poza ekran
- [ ] Reports charts: responsywne (nie fixed width), `aspect-[4/3] sm:aspect-[16/9]`
- [ ] Reports tabs: `flex-wrap` lub horizontal scroll na mobile
- [ ] Payroll tabela: card-view fallback na mobile (tak samo jak clients/bookings z Phase 3)
- [ ] Billing plan cards: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` (nie fixed 3 kolumny)

---

## Verification
```bash
npx tsc --noEmit
# DevTools: 375px — sprawdź /calendar, /reports, /payroll, /billing
```

---

## Strategia kalendarza (do weryfikacji po pre-read)

### Opcja A — useMediaQuery hook (preferowana)
```tsx
// hooks/use-media-query.ts (prawdopodobnie już istnieje — sprawdź)
import { useMediaQuery } from '@/hooks/use-media-query'

// W calendar/page.tsx:
const isMobile = useMediaQuery('(max-width: 767px)')
const [view, setView] = useState<'day' | 'week' | 'month'>('week')

// Przy pierwszym renderze na mobile:
useEffect(() => {
  if (isMobile && view === 'week') setView('day')
}, [isMobile])
```

### Opcja B — CSS only (jeśli hook jest zbyt invasive)
```tsx
// Wrapper kolumn pracowników:
<div className="overflow-x-auto">
  <div className="min-w-[600px] md:min-w-0">
    {/* kolumny pracowników */}
  </div>
</div>
```
Opcja B jest bezpieczniejsza — nie zmienia logiki, tylko dodaje horizontal scroll.

**Rekomendacja:** zacznij od Opcja B (CSS only). Opcja A wymaga głębszej ingerencji w state.

---

## Work packages (szablony — uzupełnij po pre-read)

### pkg-1 — calendar/page.tsx + booking-dialog.tsx (codex-main)

**Pliki:**
- `app/(dashboard)/[slug]/calendar/page.tsx`
- `app/(dashboard)/[slug]/calendar/booking-dialog.tsx`

**Prompt codex-main (SZABLON — uzupełnij po pre-read):**
```bash
codex exec --dangerously-bypass-approvals-and-sandbox 'Read .workflow/skills/scoped-implementation.md and follow it.
Read app/(dashboard)/[slug]/calendar/page.tsx and app/(dashboard)/[slug]/calendar/booking-dialog.tsx for context. Do NOT use Gemini — write directly.
Goal: make the calendar usable on mobile/tablet.

Changes:
1. Employee columns grid/flex container: wrap in "overflow-x-auto" container with inner div having "min-w-[MAX_EMPLOYEES * 120px] md:min-w-0" so it horizontally scrolls on mobile instead of crushing
2. Time column (left side): make it "sticky left-0 z-10 bg-background" so time labels stay visible during horizontal scroll
3. View switcher buttons (day/week/month): add "text-xs sm:text-sm" and "px-2 sm:px-3 py-1 sm:py-2"
4. Calendar header (date navigation): "flex flex-wrap gap-2 items-center justify-between"
5. booking-dialog.tsx DialogContent: add "max-w-[95vw] sm:max-w-lg md:max-w-xl" if not present
6. booking-dialog form fields: "grid grid-cols-1 sm:grid-cols-2 gap-4" for date+time pair, "w-full" on all inputs/selects

[UZUPEŁNIJ po pre-read: dodaj specyficzne klasy/linie po poznaniu struktury]

Do not change calendar logic, booking creation logic, or state management.
Done when: npx tsc --noEmit is clean.'
```

---

### pkg-2 — reports/page.tsx + payroll/page.tsx (codex-dad)

**Pliki:**
- `app/(dashboard)/[slug]/reports/page.tsx`
- `app/(dashboard)/[slug]/payroll/page.tsx`

**Prompt codex-dad (SZABLON — uzupełnij po pre-read):**
```bash
DAD_PROMPT='Read .workflow/skills/scoped-implementation.md and follow it.
Read app/(dashboard)/[slug]/reports/page.tsx and app/(dashboard)/[slug]/payroll/page.tsx for context.
Goal: make reports and payroll pages mobile-friendly.

In reports/page.tsx:
1. Tabs row: "flex overflow-x-auto gap-1 pb-1 whitespace-nowrap" so tabs scroll horizontally on mobile
2. Chart containers: ensure ResponsiveContainer from recharts is used (height: 250 on mobile, 350 on desktop) — if fixed height, change to "h-[250px] sm:h-[350px]" on the wrapper div
3. Chart grid layout: "grid grid-cols-1 lg:grid-cols-2 gap-6" (not side-by-side on mobile)
4. Page header: "flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between"
5. Export/action buttons: "w-full sm:w-auto"

In payroll/page.tsx:
1. Add card-view mobile fallback "md:hidden" below the table (same pattern as Phase 3):
   each card: employee name, month period, total amount, status badge
2. Table wrapper: "hidden md:block overflow-x-auto"
3. Header: "flex flex-col sm:flex-row gap-3"
4. Date range picker / month selector: "w-full sm:w-auto"

[UZUPEŁNIJ po pre-read jeśli znasz dokładniejszą strukturę]

Done when: npx tsc --noEmit is clean.' bash ~/.claude/scripts/dad-exec.sh
```

---

### pkg-3 — billing/page.tsx (codex-dad, równolegle z pkg-2)

**Plik:** `app/(dashboard)/[slug]/billing/page.tsx`

**Pre-read:**
```bash
DAD_PROMPT='Read /mnt/d/SimpliSalonCLoud/app/(dashboard)/[slug]/billing/page.tsx. TASK: how are plan cards rendered — grid or flex? Any fixed widths? FORMAT: Bullets. LIMIT: Max 10 lines.' bash ~/.claude/scripts/dad-exec.sh
```

**Prompt codex-dad:**
```bash
DAD_PROMPT='Read .workflow/skills/scoped-implementation.md and follow it.
Read app/(dashboard)/[slug]/billing/page.tsx for context.
Goal: make billing plan cards and invoices table mobile-friendly.

Changes:
1. Plan cards grid: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6" (not fixed 3 columns)
2. Current plan card/banner: "flex flex-col sm:flex-row gap-4 items-start sm:items-center"
3. Invoices table (if exists): "hidden md:block overflow-x-auto" + card-view fallback "md:hidden" showing date, amount, status badge, download link
4. Upgrade/Subscribe buttons: "w-full sm:w-auto"
5. Feature list in plan card: compact on mobile, use "text-sm" consistently

Done when: npx tsc --noEmit is clean.' bash ~/.claude/scripts/dad-exec.sh
```

---

## Architektura — dokumenty referencyjne

| Doc | Relevantny? | Powód |
|-----|-------------|-------|
| `docs/architecture/service-architecture.md` | Sprawdź | Kalendarz może mieć serwisy/hooks do sprawdzenia |
| Inne `docs/architecture/*.md` | NIE | Czysta zmiana UI |

---

## Dispatch order

**Pre-read first (blokujące):**
```
dad reader → calendar structure
dad reader → reports structure  
            ↓ (uzupełnij prompty)
```

**Implementacja:**
```
codex-main → pkg-1 calendar (bg)
codex-dad  → pkg-2 reports+payroll (bg)
codex-dad  → pkg-3 billing (bg, równolegle z pkg-2)
            ↓ wait all
npx tsc --noEmit
errors → dad fixes → tsc → done
```

---

## Uwagi po pre-read (wypełnij tutaj)

<!-- Po uruchomieniu pre-read wpisz tutaj co znalazłeś:
- Jak działa widok kalendarza (state, komponenty)
- Jakie chart library (recharts/chart.js/custom)
- Czy billing ma 1/2/3 plany — jak renderowane
-->

---

## Evidence log
<!-- append-only -->
