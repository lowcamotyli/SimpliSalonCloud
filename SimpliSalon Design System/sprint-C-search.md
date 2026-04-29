# Sprint C — Global Search: Object Results

## Owner
- Orchestrator: Claude | Workers: codex-dad (C1 API + C2 UI), codex-main (C3 navbar) | Status: plan
- **Bloker:** Sprint A musi być zakończony i tsc clean
- Sprint B NIE jest blokerem — C może startować równolegle z B

## Intent
Dodać global search do topnav. Navbar jeszcze nie ma searcha — implementujemy go od zera per wzorzec z `revamp.html` sekcja 08. Panel wyników używa obiektów z Sprint A. Search API jest nowe.

## Architektura — dokumenty referencyjne

```bash
# Przeczytaj przed dispatchem:
DAD_PROMPT='Read "/mnt/d/SimpliSalonCLoud/SimpliSalon Design System/revamp/revamp.html" section 08 (topnav + global search). List: search input placement, results panel layout, object grouping in results, keyboard navigation spec, quick actions in results. FORMAT: Bulleted list. Do NOT summarize away interaction details.' bash ~/.claude/scripts/dad-exec.sh
```

| Dokument | Dlaczego |
|----------|----------|
| `revamp.html` sekcja 08 | Wzorzec topnav + search input design |
| `interactive-objects.html` sekcja 09.5/09.6 | Object w wynikach = ObjectPill + quick actions |
| `app/api/clients/route.ts` | Wzorzec auth + salon_id filter dla API |

## Pliki

| Plik | Worker | Typ | Uwagi |
|------|--------|-----|-------|
| `app/api/search/route.ts` | **dad C1** | Nowy | Multi-object search API, auth, salon_id |
| `components/layout/global-search.tsx` | **dad C2** | Nowy | Search UI: input + results panel |
| `components/layout/navbar.tsx` | **main C3** | Edycja | Dodaj GlobalSearch — 64 linie, prosta zmiana |

## Graf zależności

```
dad C1 (API route) ──┐
                     ├──> po tsc: main C3 (navbar) ← musi znać props GlobalSearch
dad C2 (UI)    ──────┘
```

C1 i C2 są **równoległe**. C3 musi poczekać aż C2 dostarczy `GlobalSearch` komponent z określonymi propsami.

## Dispatch — RÓWNOLEGLE: C1 i C2 (oba naraz)

### Worker C1 — codex-dad (Search API)

```bash
DAD_PROMPT='Read .workflow/skills/scoped-implementation.md and follow it.
Read /mnt/d/SimpliSalonCLoud/app/api/clients/route.ts for auth pattern (getAuthContext usage).

Goal: Create new search API route.

File: /mnt/d/SimpliSalonCLoud/app/api/search/route.ts

Implementation:
- GET handler with query params: q (search term, min 2 chars), types? (comma-separated: client,worker,service,booking)
- Use getAuthContext() from @/lib/supabase/get-auth-context for auth + salonId
- Search across tables (all filtered by salon_id):
  clients: search name (first+last), email, phone — return { id, type:"client", label: full_name, meta: email|phone }
  employees: search name — return { id, type:"worker", label: name, meta: role }
  services: search name, description — return { id, type:"service", label: name, meta: duration + price }
  bookings: search via client name join, notes — return { id, type:"booking", label: client_name + service_name, meta: date + status }
- Each table: ILIKE %q% on relevant text columns, LIMIT 5 per type
- Response shape:
  { results: { type: ObjectType, items: SearchResult[] }[] }
  where SearchResult = { id: string, label: string, meta: string, avatarUrl?: string }
- Group by type in response, order: clients first, then bookings, workers, services
- Error: 400 if q < 2 chars, 401 if no auth
- Use import type { ObjectType } from "@/components/objects/object-config" for type safety

Constraints:
- ZAWSZE filtruj po salon_id — każde zapytanie musi mieć AND salon_id = $salonId
- Używaj Supabase .ilike() nie raw SQL
- Max 5 wyników per typ żeby panel był lekki
Done when: file written, TypeScript strict.' bash ~/.claude/scripts/dad-exec.sh
```

### Worker C2 — codex-dad (Search UI)

```bash
DAD_PROMPT='Read .workflow/skills/scoped-implementation.md and follow it.
Read "/mnt/d/SimpliSalonCLoud/SimpliSalon Design System/revamp/revamp.html" section 08 for search input and results panel design spec.
Read /mnt/d/SimpliSalonCLoud/components/objects/index.ts for available ObjectPill, ObjectLink, ObjectTrigger exports.
Read /mnt/d/SimpliSalonCLoud/components/ui/popover.tsx for popover API.

Goal: Create global-search component.

File: /mnt/d/SimpliSalonCLoud/components/layout/global-search.tsx

Implementation:
- "use client" component
- Props: { slug: string, className?: string }
- Search input: Cmd+K shortcut to focus, placeholder "Szukaj klientów, rezerwacji...", Search icon
- Min 2 chars to trigger search, 300ms debounce
- Fetch from /api/search?q={q}&slug={slug} (include slug for context, even though auth handles salon_id)
- Results panel: floating panel below input (absolute positioned, z-50, shadow-xl, rounded-xl, bg-background border)
- Panel width: min-w-[400px] or full width on mobile
- Results grouped by type with section headers (type label from OBJECT_TYPE_CONFIG)
- Each result row: [ObjectPill type={type} id={id} label={label} slug={slug}] [meta text] [ObjectTrigger]
  — ObjectPill click navigates and closes panel
  — ObjectTrigger opens related actions (does NOT close panel)
  — Clicking outside closes panel
- Empty state: "Brak wyników dla '{q}'"
- Loading state: skeleton rows (3 per group)
- Keyboard:
  ArrowDown/Up: move active result (highlighted with bg-accent)
  Enter: navigate to active result (uses ObjectLink route)
  Esc: close panel and return focus to input
  Tab: moves through quick actions in active result row
- Import ObjectPill, ObjectTrigger, OBJECT_TYPE_CONFIG from @/components/objects
- Use useDebouncedCallback or manual setTimeout for debounce

Constraints:
- No new color tokens — use existing bg-accent, bg-background, text-muted-foreground
- Mobile: full-width panel, stacks below topnav or opens as sheet
- Import shadcn components from individual paths (not barrel)
- Export as named export: GlobalSearch
Done when: file written, TypeScript types complete.' bash ~/.claude/scripts/dad-exec.sh
```

### Worker C3 — codex-main (Navbar integration)
**CZEKA na C2 (GlobalSearch komponent musi istnieć)**

```bash
codex exec --dangerously-bypass-approvals-and-sandbox 'Read .workflow/skills/scoped-implementation.md and follow it.
Read components/layout/navbar.tsx (current content).
Read components/layout/global-search.tsx (Sprint C2 output) to know GlobalSearch props.

Goal: Add GlobalSearch component to Navbar.

File: components/layout/navbar.tsx
Changes:
- Import GlobalSearch from @/components/layout/global-search
- Add GlobalSearch slug={salonSlug} to navbar center or left of actions
- Navbar must receive salonSlug prop (add to NavbarProps interface if missing)
- GlobalSearch should be hidden on mobile (shown as icon that expands) OR shown as compact input — follow revamp.html section 08 pattern
- Keep existing Bell and LogOut buttons unchanged
- Keep existing layout structure

Constraints: Do not change existing prop interface beyond adding salonSlug if missing. Do NOT use Gemini — write directly.' < /dev/null
```

**Uwaga:** Po C3, sprawdź czy `layout.tsx` w dashboard przekazuje `salonSlug` do Navbar.

## Weryfikacja po Sprint C

```bash
# 1. TypeScript check
cd d:/SimpliSalonCLoud && npx tsc --noEmit 2>&1 | head -50

# 2. Wiring check
grep -r "GlobalSearch" d:/SimpliSalonCLoud/components/layout/navbar.tsx
grep -r "ObjectPill\|ObjectTrigger" d:/SimpliSalonCLoud/components/layout/global-search.tsx
grep -r "/api/search" d:/SimpliSalonCLoud/components/layout/global-search.tsx

# 3. Dashboard layout check — czy slug jest przekazywany do Navbar
grep -r "Navbar" "d:/SimpliSalonCLoud/app/(dashboard)/[slug]/layout.tsx" 2>/dev/null
```

## Acceptance criteria

- [ ] `app/api/search/route.ts` zwraca pogrupowane wyniki dla q >= 2 znaki
- [ ] Każde zapytanie filtruje po salon_id
- [ ] `components/layout/global-search.tsx` renderuje input + results panel
- [ ] Wyniki używają ObjectPill + ObjectTrigger z Sprint A
- [ ] Keyboard nav: ArrowUp/Down po wynikach, Enter otwiera, Esc zamyka
- [ ] Navbar pokazuje GlobalSearch
- [ ] `npx tsc --noEmit` przechodzi czysto

## Decision
Ship: TBD
