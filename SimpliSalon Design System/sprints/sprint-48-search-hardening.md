# Sprint SS2.4-48 - Global search hardening

## Cel

`global-search.tsx` juz istnieje i uzywa ObjectPill/ObjectTrigger. Sprint 48 domyka:
1. API search zwraca wszystkie 5 typow z poprawnym ksztaltem danych
2. Keyboard navigation jest kompletna (Tab, Enter, Esc, ArrowUp/Down)
3. Quick action klik w wyniku nie otwiera calego wyniku
4. Wyniki sa grupowane po typach z separatorami

Zaleznosc: Sprint 41 zamkniety. Sprinty 43-47 nie blokuja.

## Architektura - dokumenty referencyjne

```bash
DAD_PROMPT="Read /mnt/d/SimpliSalonCLoud/SimpliSalon Design System/revamp/revamp.html. Extract ONLY section 08 that covers the global search panel and search results: layout, grouping, keyboard behavior, quick actions. FORMAT: Bulleted list." bash ~/.claude/scripts/dad-exec.sh
```

| Dokument | Dlaczego |
|----------|----------|
| `SimpliSalon Design System/revamp/revamp.html` | sekcja 08 — global search spec |
| `SimpliSalon Design System/revamp/interactive-objects.html` | sekcja 09.8 — keyboard/ARIA spec |

## Zdiagnozowane problemy

- [ ] `api/search/route.ts` — weryfikacja czy zwraca wszystkie 5 typow z poprawnymi polami
- [ ] `global-search.tsx` — keyboard: Tab wchodzi w row, Enter otwiera, Esc zamyka
- [ ] Quick action klik nie propaguje do row onClick
- [ ] Brak separatorow miedzy grupami typow

## Zakres

### A — Search API audit + fix (codex-dad)

Plik: `app/api/search/route.ts` (301 linii)

- [ ] Sprawdz czy route zwraca te typy: `client`, `worker`, `service`, `booking`, `salon`
- [ ] Sprawdz shape kazdego wyniku: `{ id: string, label: string, meta: string, type: ObjectType, avatarUrl?: string }`
- [ ] Jesli brakuje typow — dodaj odpowiednie zapytania Supabase
- [ ] Upewnij sie ze kazdy wynik ma `salon_id` filtr (security — multi-tenant)
- [ ] Dodaj `salon` jako typ jesli brakuje — proste query do tabeli `salons` po slugu

### B — Search UI hardening (codex-dad, rownolegle z A)

Plik: `components/layout/global-search.tsx` (469 linii)

- [ ] Keyboard: `Enter` na aktywnym wyniku → router.push do obiektu
- [ ] Keyboard: `Esc` → zamknij panel wynikow, focus wraca do inputa
- [ ] Keyboard: `ArrowUp`/`ArrowDown` → zmiana aktywnego wyniku (juz moze byc — zweryfikuj)
- [ ] Keyboard: `Tab` → wejdz w aktywny wynik, `Tab` ponownie → przejdz do quick actions
- [ ] Quick action klik: `e.stopPropagation()` zeby nie otworzyc calego wyniku
- [ ] Grupowanie: wyniki pogrupowane po `type` z naglowkiem grupy (np. "Klientki", "Pracownicy")
      jesli jeszcze nie sa pogrupowane
- [ ] Kazdy naglowek grupy: `role="group"` lub `<li role="presentation">` z `aria-label`
- [ ] Panel wynikow: `role="listbox"`, kazdy wynik: `role="option"`, aktywny: `aria-selected="true"`

## Dispatch commands

### Pkg A — search API (codex-dad)

```bash
DAD_PROMPT="Read .workflow/skills/scoped-implementation.md and follow it.
Read /mnt/d/SimpliSalonCLoud/app/api/search/route.ts for full context.
Read /mnt/d/SimpliSalonCLoud/components/objects/object-config.ts first 40 lines to see ObjectType.

Goal: Ensure search API returns all 5 object types with correct shape for global search.

File: /mnt/d/SimpliSalonCLoud/app/api/search/route.ts

Changes:
1. Verify the route returns results with shape: { id, label, meta, type, avatarUrl? }
   where type is one of: client | worker | service | booking | salon
2. If any type is missing, add a Supabase query for it.
   - client: query clients table, label=full_name, meta=phone or email
   - worker: query employees table (or profiles), label=full_name, meta=role
   - service: query services table, label=name, meta=duration+price
   - booking: query bookings table, label=client_name, meta=booking_date+status
   - salon: query salons table, label=name, meta=slug — filter by user access
3. Every query MUST include salon_id filter using getAuthContext() pattern.
4. Use existing getAuthContext or auth helper — do NOT add new auth boilerplate.
5. Return grouped: { type, items: [...] }[] — or flat with type field on each item.

Constraints:
- Do NOT change response format if frontend already works with it — only ADD missing types
- Always filter by salon_id
- Use existing supabase client creation pattern

Done when: npx tsc --noEmit passes and all 5 types returned." bash ~/.claude/scripts/dad-exec.sh
```

### Pkg B — search UI keyboard + grouping (codex-dad, rownolegle z A)

```bash
DAD_PROMPT="Read .workflow/skills/scoped-implementation.md and follow it.
Read /mnt/d/SimpliSalonCLoud/components/layout/global-search.tsx for full context.

Goal: Complete keyboard navigation and group separators in global search panel.

File: /mnt/d/SimpliSalonCLoud/components/layout/global-search.tsx

Changes:
1. On ArrowUp/ArrowDown keydown: cycle through flatResults, update activeIndex.
   If already present — verify it works correctly.
2. On Enter keydown: navigate to the active result (router.push to object URL using OBJECT_TYPE_CONFIG[type].getRoute(id, slug)).
3. On Escape keydown: close results panel, call inputRef.current?.blur() or focus back.
4. On Tab keydown inside panel: if active row has focusable children (buttons), Tab into them.
5. Add e.stopPropagation() to quick action button onClick handlers.
6. If results are not grouped by type: group them. Use type as key. Show group header:
   map type to Polish label: client→Klientki, worker→Pracownicy, service→Uslugi, booking→Wizyty, salon→Lokalizacje
   Render as: <li role='presentation' aria-label='Klientki'>Klientki</li> before each group.
7. Panel: aria-label='Wyniki wyszukiwania'. Each result: role='option'. Active: aria-selected='true'.

Constraints:
- Do NOT change the search input styling or debounce logic
- Do NOT change how ObjectPill and ObjectTrigger are rendered in results (already done)
- Do NOT change the skeleton/loading state

Done when: npx tsc --noEmit passes." bash ~/.claude/scripts/dad-exec.sh
```

## Work packages

- ID: pkg-48-search-api | Type: implementation | Worker: codex-dad | Inputs: api/search/route.ts | Outputs: wszystkie 5 typow z poprawnymi polami
- ID: pkg-48-search-ui | Type: implementation | Worker: codex-dad | Inputs: global-search.tsx | Outputs: keyboard nav + grupowanie

## Verification

```bash
npx tsc --noEmit
# Test manualny keyboard:
# 1. Otwórz search (Cmd/Ctrl+K lub kliknij)
# 2. Wpisz imie klienta → wyniki pojawiaja sie
# 3. ArrowDown → aktywny wynik podswietlony
# 4. ArrowDown dalej → przejdz przez wszystkie grupy
# 5. Enter → nawigacja do obiektu
# 6. Esc → zamkniecie panelu, focus wraca do inputa
# 7. Tab → wejdz w quick actions aktywnego wyniku
# 8. Klik w quick action → tylko quick action, nie otwiera profilu
```

## Acceptance criteria

- [ ] Search API zwraca 5 typow: client, worker, service, booking, salon
- [ ] Kazdy wynik ma shape: `{id, label, meta, type}`
- [ ] Wyniki pogrupowane z polskim naglowkiem grupy
- [ ] ArrowUp/Down dziala przez grupy
- [ ] Enter otwiera aktywny wynik
- [ ] Esc zamyka panel i oddaje focus
- [ ] Quick action klik nie otwiera calego wyniku
- [ ] `npx tsc --noEmit` → clean
