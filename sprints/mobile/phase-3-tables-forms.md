# Sprint: Mobile Phase 3 — Tables & Forms
**Branch:** Booksy2.0 (lub `fix/mobile-phase-3`)
**Prereq:** Phase 2 done (grid/typography fixes)

---

## Intent
Tabele klientów, rezerwacji i pracowników są nieczytelne na telefonach (zbyt wiele kolumn, ciasne komórki).
Rozwiązanie: ukrycie nieistotnych kolumn na mobile (`hidden md:table-cell`) + card-view fallback dla głównych list.
Formularze settings: inputs pełna szerokość, selects nie obcięte.

---

## Acceptance criteria
- [ ] Clients list: na 375px widoczne tylko Imię + Status (telefon/email ukryte, dostępne po kliknięciu w kartę)
- [ ] Bookings list: na 375px widoczne Klient + Czas + Status (Pracownik i Usługa ukryte)
- [ ] Employees list: karty pracowników stackują się pionowo na mobile, nie krusząc layoutu
- [ ] Card-view fallback: `md:hidden` karty dla clients i bookings — zwięzły widok z ikoną + badge statusu
- [ ] Settings strony: wszystkie `<Input>`, `<Select>`, `<Textarea>` mają `w-full`
- [ ] Dialog formularze: `<DialogContent className="max-w-[95vw] sm:max-w-lg md:max-w-xl">`
- [ ] Search bary + header actions: `flex-col sm:flex-row` na wąskich ekranach

---

## Verification
```bash
npx tsc --noEmit
# DevTools: 375px — sprawdź /clients, /bookings, /employees, /settings/notifications
```

---

## Card-view pattern (użyj tego wzorca dla clients i bookings)

```tsx
{/* Desktop table */}
<div className="hidden md:block">
  <Table>...</Table>
</div>

{/* Mobile cards */}
<div className="md:hidden space-y-2">
  {items.map(item => (
    <Card key={item.id} className="p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-primary">{item.name?.charAt(0)}</span>
          </div>
          <div className="min-w-0">
            <p className="font-medium text-sm truncate">{item.name}</p>
            <p className="text-xs text-muted-foreground truncate">{item.secondary}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="outline" className="text-xs">{item.status}</Badge>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>
    </Card>
  ))}
</div>
```

---

## Work packages

### pkg-1 — clients/page.tsx (codex-main)

**Plik:** `app/(dashboard)/[slug]/clients/page.tsx`

Clients page jest `'use client'` z dużą ilością state — codex-main lepiej sobie poradzi z całością.

**Zmiany:**
1. Jeśli istnieje tabela klientów inline: dodaj `hidden md:table-cell` do kolumn Email, Telefon, Data ostatniej wizyty
2. Dodaj card-view fallback `md:hidden` (wzorzec wyżej) — pokazuje Imię + telefon + status
3. Search input + "Dodaj klienta" button: `flex flex-col sm:flex-row gap-3`
4. Filter badges row: `flex-wrap gap-2`
5. Stat karty (jeśli są na górze): sprawdź czy stackują się poprawnie na mobile

**Prompt codex-main:**
```bash
codex exec --dangerously-bypass-approvals-and-sandbox 'Read .workflow/skills/scoped-implementation.md and follow it.
Read app/(dashboard)/[slug]/clients/page.tsx for context. Do NOT use Gemini — write directly.
Goal: make the clients list mobile-friendly.

Changes:
1. If there is an inline table: add "hidden md:table-cell" class to non-essential columns (email, phone, last visit date). Keep: name, status, action buttons.
2. Add a mobile card-view fallback (visible only on mobile with "md:hidden") directly below/instead of the table wrapper. Each card shows: avatar initial, full_name, phone number (or email if no phone), status badge, and a ChevronRight icon. Clicking card navigates to client detail page. Import ChevronRight from lucide-react if not already imported.
3. Header area (search input + add button): wrap in "flex flex-col sm:flex-row gap-3 items-start sm:items-center"
4. Any filter/tab row: add "flex-wrap gap-2" so badges wrap on small screens
5. Dialog content for add/edit client: "max-w-[95vw] sm:max-w-lg"

Do not change data fetching, state logic, or API calls. Only UI/layout changes.
Done when: npx tsc --noEmit is clean.'
```

---

### pkg-2 — bookings/page.tsx + employees/page.tsx (codex-dad)

**Pliki:**
- `app/(dashboard)/[slug]/bookings/page.tsx`
- `app/(dashboard)/[slug]/employees/page.tsx`

**Prompt codex-dad:**
```bash
DAD_PROMPT='Read .workflow/skills/scoped-implementation.md and follow it.
Read app/(dashboard)/[slug]/bookings/page.tsx and app/(dashboard)/[slug]/employees/page.tsx for context.
Goal: make bookings list and employees list mobile-friendly.

In bookings/page.tsx:
1. If table exists inline: "hidden md:table-cell" on columns: employee name, service name (keep: client name, time, date, status, actions)
2. Add mobile card-view fallback "md:hidden" below table: each card shows client name, service name (truncated), date + time, status badge. Import ChevronRight if needed. Card links to booking detail or opens edit dialog if that exists.
3. Header/filter area: "flex flex-col sm:flex-row gap-3 flex-wrap"
4. Status filter tabs: "flex-wrap gap-1"
5. Any DialogContent: "max-w-[95vw] sm:max-w-lg md:max-w-xl"

In employees/page.tsx:
1. Employee cards/list: ensure grid is "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" (not jumping to lg directly)
2. Each employee card: avatar + name + role on one line, action buttons below on mobile
3. Header: "flex flex-col sm:flex-row gap-3 items-start sm:items-center"
4. Any DialogContent: "max-w-[95vw] sm:max-w-lg"

Do not change logic. Only Tailwind class additions and minor JSX structure for card-view.
Done when: npx tsc --noEmit is clean.' bash ~/.claude/scripts/dad-exec.sh
```

---

### pkg-3 — settings pages (codex-dad, po pkg-1 i pkg-2)

**Pliki:**
- `app/(dashboard)/[slug]/settings/notifications/page.tsx`
- `app/(dashboard)/[slug]/settings/sms/page.tsx`
- `components/settings/settings-nav.tsx`
- `components/settings/hours-editor.tsx`

**Uwaga:** Przeczytaj przed dispatchem przez dad-reader żeby poznać strukturę.

**Prompt pre-read (przed dispatchem):**
```bash
DAD_PROMPT='Read /mnt/d/SimpliSalonCLoud/app/(dashboard)/[slug]/settings/notifications/page.tsx and /mnt/d/SimpliSalonCLoud/components/settings/settings-nav.tsx. TASK: describe the layout structure — is there a sidebar nav + content area? How are form fields laid out? FORMAT: Bullets. LIMIT: Max 20 lines.' bash ~/.claude/scripts/dad-exec.sh
```

**Po przeczytaniu — prompt implementacji:**
```bash
DAD_PROMPT='Read .workflow/skills/scoped-implementation.md and follow it.
Read app/(dashboard)/[slug]/settings/notifications/page.tsx, app/(dashboard)/[slug]/settings/sms/page.tsx, components/settings/settings-nav.tsx, components/settings/hours-editor.tsx for context.
Goal: make settings pages mobile-friendly.

For ALL settings pages:
1. Any Input, Select, Textarea: ensure they have "w-full" (not fixed widths)
2. Label + Input pairs: "space-y-1.5" vertical stacking (already likely correct — verify)
3. Form sections with side-by-side fields: "grid grid-cols-1 md:grid-cols-2 gap-4"
4. Save/Submit buttons: "w-full sm:w-auto"
5. Section cards: padding "p-4 sm:p-6"

For settings-nav.tsx (sidebar navigation within settings):
1. On mobile: convert vertical nav to horizontal scrollable tabs "flex overflow-x-auto gap-1 pb-2 md:flex-col md:overflow-visible" with "whitespace-nowrap" on items
2. Add "shrink-0" to nav items so they do not compress

For hours-editor.tsx:
1. Each day row: "flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4"
2. Time inputs: "w-full sm:w-auto" 

Done when: npx tsc --noEmit is clean.' bash ~/.claude/scripts/dad-exec.sh
```

---

## Architektura — dokumenty referencyjne

| Doc | Relevantny? |
|-----|-------------|
| `docs/architecture/*.md` | NIE — czysta zmiana UI |

---

## Dispatch order

pkg-1 i pkg-2 **równoległe**. pkg-3 po obu (settings są niezależne ale lepiej nie tasować wszystkiego naraz).

```
codex-main → pkg-1 clients (bg)
codex-dad  → pkg-2 bookings+employees (bg)
            ↓ wait both
npx tsc --noEmit
clean → codex-dad → pkg-3 settings (bg)
        ↓ wait
npx tsc --noEmit → done
```

---

## Evidence log
<!-- append-only -->
