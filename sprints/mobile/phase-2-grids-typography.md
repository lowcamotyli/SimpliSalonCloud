# Sprint: Mobile Phase 2 — Grid Breakpoints & Typography
**Branch:** Booksy2.0 (lub dedykowany `fix/mobile-phase-2`)
**Prereq:** Phase 1 (sidebar drawer) musi być done — layout.tsx zmieniony na `p-4 md:p-6`

---

## Intent
Naprawić layouty które skaczą z `grid-cols-1` prosto do `lg:grid-cols-4`, pomijając tablet (768px–1024px).
Ujednolicić rozmiary tekstu i odstępy na wszystkich breakpointach.

## Acceptance criteria
- [ ] Dashboard stats: `sm:grid-cols-2 lg:grid-cols-4` (nie brakuje `md:` breakpoint)
- [ ] StatCard value: `text-2xl sm:text-3xl` (nie ucina się na telefonie)
- [ ] Dashboard główny grid `lg:grid-cols-4`: RevenueChart zajmuje `lg:col-span-3`, BooksyWidget `lg:col-span-1`, na mobile: stack pionowo
- [ ] Services page: lista usług czytelna na 375px (Accordion nie przylega do krawędzi)
- [ ] Settings/Business: pola formularza `grid-cols-1 md:grid-cols-2`, nie dwa kolumny na telefonie
- [ ] Gap ujednolicony: `gap-4 sm:gap-6` zamiast stałego `gap-6`
- [ ] Nagłówki stron: `text-2xl sm:text-3xl` (dashboard h1 to `text-3xl` — za duże na 375px)

## Verification
```bash
npx tsc --noEmit
# Następnie DevTools: 375px (iPhone SE), 768px (iPad), 1024px (iPad Pro)
# Sprawdź: dashboard, /services, /settings/business
```

---

## Work packages

### pkg-1 — dashboard/page.tsx + stat-card.tsx (codex-main)

**Pliki:**
- `app/(dashboard)/[slug]/dashboard/page.tsx`
- `components/dashboard/stat-card.tsx`

**Co zmienić w dashboard/page.tsx:**
```
// Stats grid (linia ~235):
"grid gap-6 sm:grid-cols-2 lg:grid-cols-4"
// było: "grid gap-6 sm:grid-cols-2 lg:grid-cols-4" ← sprawdź czy już jest sm:
// gap:
"gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-4"

// Main content grid (linia ~241):
"grid gap-4 sm:gap-6 lg:grid-cols-4"
// RevenueChart wrapper: "lg:col-span-3"
// BooksyWidget wrapper: "lg:col-span-1"

// Page h1 (linia ~219):
"text-2xl sm:text-3xl font-bold tracking-tight text-foreground"

// Subtitle (linia ~222):
"text-muted-foreground text-base sm:text-lg font-medium theme-header-subtitle"

// Header flex (linia ~217):
"flex flex-col sm:flex-row sm:items-end justify-between gap-3 sm:gap-4"
```

**Co zmienić w stat-card.tsx:**
```
// Value (linia ~45):
"theme-stat-card-value text-2xl sm:text-3xl font-bold bg-gradient-to-r..."

// CardHeader padding (linia ~36):
CardHeader className="relative pb-2 p-4 sm:p-6"

// CardContent padding (linia ~44):
CardContent className="relative pt-2 sm:pt-4 px-4 sm:px-6 pb-4 sm:pb-6"
```

**Prompt codex-main:**
```bash
codex exec --dangerously-bypass-approvals-and-sandbox 'Read .workflow/skills/scoped-implementation.md and follow it.
Read app/(dashboard)/[slug]/dashboard/page.tsx and components/dashboard/stat-card.tsx for context. Do NOT use Gemini — write directly.
Goal: improve mobile/tablet responsiveness — fix grid breakpoints and typography.

In app/(dashboard)/[slug]/dashboard/page.tsx:
1. Stats grid: change class to "grid gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-4"
2. Main content grid (lg:grid-cols-4 below stats): change gap to "gap-4 sm:gap-6", ensure RevenueChart has "lg:col-span-3" wrapper and BooksyStatusWidget has "lg:col-span-1" wrapper so they stack vertically on mobile
3. Page h1: "text-2xl sm:text-3xl font-bold tracking-tight text-foreground"
4. Subtitle p: add "text-base sm:text-lg" (remove plain "text-lg")
5. Header flex div: "flex flex-col sm:flex-row sm:items-end justify-between gap-3 sm:gap-4"
6. Upcoming bookings section: ensure booking items use "flex-wrap" so time/status wraps on narrow screens
7. Main wrapper: ensure "px-0 sm:px-0" (already has px-4 sm:px-0 — keep as is)

In components/dashboard/stat-card.tsx:
1. Value div: change "text-3xl" to "text-2xl sm:text-3xl"
2. Do not change any other logic, only responsive classes.

Done when: npx tsc --noEmit is clean. No logic changes — only Tailwind class additions/modifications.'
```

---

### pkg-2 — services/page.tsx + settings/business/page.tsx (codex-dad)

**Pliki:**
- `app/(dashboard)/[slug]/services/page.tsx`
- `app/(dashboard)/[slug]/settings/business/page.tsx`

**Co zmienić w services/page.tsx:**
- Header: search input + buttons — `flex-col sm:flex-row` gap
- Accordion items (lista usług): padding `p-3 sm:p-4`, title `text-base sm:text-lg`
- Dialog content: `max-w-[95vw] sm:max-w-lg` żeby nie wychodził poza ekran na mobile
- Przyciski akcji (Edit/Delete) na kartach usług: `gap-1 sm:gap-2`

**Co zmienić w settings/business/page.tsx:**
- Pola formularza: `grid grid-cols-1 md:grid-cols-2 gap-4` gdzie jest kilka pól obok siebie
- Sekcje: padding `p-4 sm:p-6`
- Przyciski Save: `w-full sm:w-auto`

**Prompt codex-dad:**
```bash
DAD_PROMPT='Read .workflow/skills/scoped-implementation.md and follow it.
Read app/(dashboard)/[slug]/services/page.tsx and app/(dashboard)/[slug]/settings/business/page.tsx.
Goal: improve mobile responsiveness — fix layouts for phone/tablet.

In services/page.tsx:
1. Header area (search + buttons row): wrap in "flex flex-col sm:flex-row gap-3 sm:gap-4 sm:items-center"
2. Any Dialog/DialogContent: add "max-w-[95vw] sm:max-w-lg" to prevent overflow on mobile
3. Accordion trigger padding: ensure "px-3 sm:px-4 py-3"
4. Action button groups (edit/delete pairs): "flex gap-1 sm:gap-2"

In settings/business/page.tsx:
1. Multi-field rows (name+phone, etc): wrap in "grid grid-cols-1 md:grid-cols-2 gap-4" instead of side-by-side flex
2. Card/section padding: "p-4 sm:p-6" (not fixed p-6)
3. Submit/Save buttons: add "w-full sm:w-auto" so they fill width on mobile
4. Page heading: "text-xl sm:text-2xl font-bold"

Do not change logic, validation, or data fetching. Tailwind class changes only.
Done when: npx tsc --noEmit is clean.' bash ~/.claude/scripts/dad-exec.sh
```

---

## Architektura — dokumenty referencyjne

| Doc | Relevantny? |
|-----|-------------|
| `docs/architecture/*.md` | NIE — czysta zmiana UI, brak wpływu na dane/auth |

---

## Dispatch order

Oba paczki **równoległe** — różne pliki, brak wspólnych importów.

```
codex-main → pkg-1 (bg)
codex-dad  → pkg-2 (bg)
            ↓ wait both
npx tsc --noEmit
errors → dad fixes → tsc again
```

---

## Evidence log
<!-- append-only -->
