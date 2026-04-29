# Sprint SS2.4-41 - Interactive Objects: fundament (object-config + primitives)

## Cel

Domkniecie primitive layer zanim zaczniem integracje widokow. `object-config.ts` ma 7 akcji z
`disabled: true` i `onClick: () => undefined`. Routy dla `service` i `salon` ignoruja `id`.
`ObjectPreview` wylacza mobile. Bez tego sprintu zadne nastepne sprinty nie dzialaja poprawnie.

## Architektura - dokumenty referencyjne

Brak — sprint dotyczy wylacznie warstwy komponentow, nie danych.

Plik zrodla prawdy dla designu: `SimpliSalon Design System/revamp/interactive-objects.html`
sekcja `09.8 Specyfikacja zachowania`.

## Zdiagnozowane problemy

- [ ] `getActions(type)` nie przyjmuje kontekstu (`router`, `slug`, `toast`) — akcje nawigacyjne
      i API calls sa niemozliwe bez przebudowy sygnatury
- [ ] `zadzwon`, `wyslij-sms`, `wyslij-email` maja `disabled: true`
- [ ] `przeloz`, `potwierdz`, `anuluj`, `wyslij-przypomnienie` maja `disabled: true`
- [ ] `service` route: `/${slug}/services` (brak `/${id}`)
- [ ] `salon` route: `/${slug}/settings` (brak sekcji business)
- [ ] `ObjectPreview.tsx`: mobile blokuje popover (`open && !isMobile`), brak fallbacku

## Zakres

### A — object-config.ts: sygnatura + akcje (codex-dad)

- [ ] Dodaj opcjonalny parametr `ctx?: { router: AppRouterInstance; slug: string; toast: (msg: string) => void }`
      do `getActions(type, ctx?)`
- [ ] `wyslij-sms` → `ctx?.router.push(/${ctx.slug}/clients/messages?clientId=${id})`
- [ ] `otworz-profil` (client) → `ctx?.router.push(/${ctx.slug}/clients/${id})`
- [ ] `pokaz-grafik` (worker) → `ctx?.router.push(/${ctx.slug}/employees/${id})`
- [ ] `przeloz` → `ctx?.router.push(/${ctx.slug}/bookings/${id})` (strona detail ma edycje)
- [ ] `potwierdz` → `fetch PATCH /api/bookings/${id}` z `{status:'confirmed'}` + `ctx?.toast`
       + `window.location.reload()` jako fallback jesli brak ctx
- [ ] `anuluj` → `fetch PATCH /api/bookings/${id}` z `{status:'cancelled'}` + `ctx?.toast`
- [ ] `wyslij-przypomnienie` → disabled (brak endpointu `/api/bookings/${id}/remind`) — dodaj
       opis: `"Wyslij przypomnienie"` z `disabled: true` i labelka `"Wkrotce"`
- [ ] `zadzwon` → disabled (numer telefonu nie jest dostepny w kontekscie objektu) — label + tooltip
- [ ] `wyslij-email` → disabled — jw.
- [ ] `service` route → `/${slug}/services` (lista; brak detalu uslugi jako osobnej strony)
- [ ] `salon` route → `/${slug}/settings/business`
- [ ] Nie usuwaj zadnych istniejacych akcji — tylko zmieniaj implementacje

### B — ObjectPreview.tsx: mobile fallback (codex-dad)

- [ ] Przeczytaj aktualny kod
- [ ] Na mobile (`isMobile === true`): zamiast wylaczyc popover, wyswietl stan `null`
      (brak triggera hover — mobile uzywa `RelatedActionsSheet` zamiast popovera)
- [ ] Dodaj prop `disableOnMobile?: boolean` (domyslnie `true`) — gdy false, popover
      dziala na mobile (np. przy long-press)
- [ ] `aria-haspopup="dialog"` na trigger elemencie popovera

## Dispatch commands

### Pkg A — object-config (codex-dad)

```bash
DAD_PROMPT="Read .workflow/skills/scoped-implementation.md and follow it.
Read /mnt/d/SimpliSalonCLoud/components/objects/object-config.ts for full context.
Read /mnt/d/SimpliSalonCLoud/app/api/bookings/[id]/route.ts first 60 lines only to confirm PATCH accepts {status}.

Goal: Refactor getActions(type) to accept optional ctx and wire up real navigation/API actions.

File: /mnt/d/SimpliSalonCLoud/components/objects/object-config.ts

Changes:
1. Import AppRouterInstance from 'next/navigation' (type import only).
2. Add type: ActionCtx = { router: import('next/navigation').AppRouterInstance; slug: string; toast: (msg: string) => void }
3. Change getActions signature to: getActions(type: ObjectType, id: string, ctx?: ActionCtx): RelatedAction[]
   Currently it takes only (type). Pass id through so actions can use it.
4. Reimplement navigate helper to use ctx?.router.push(path) when ctx is available, else console.warn.
5. Wire wyslij-sms: ctx?.router.push(/{ctx.slug}/clients/messages?clientId={id})
6. Wire przeloz: ctx?.router.push(/{ctx.slug}/bookings/{id})
7. Wire potwierdz: fetch PATCH /api/bookings/{id} body {status:confirmed} then ctx?.toast('Wizyta potwierdzona')
8. Wire anuluj: fetch PATCH /api/bookings/{id} body {status:cancelled} then ctx?.toast('Wizyta anulowana')
9. Keep zadzwon, wyslij-email, wyslij-przypomnienie as disabled:true — update labels only.
10. Fix service getRoute: return /{slug}/services (no id — no detail page exists yet)
11. Fix salon getRoute: return /{slug}/settings/business

Constraints:
- Do NOT change RelatedAction type shape
- Do NOT change OBJECT_TYPE_CONFIG keys or colors
- Do NOT add new dependencies beyond next/navigation
- Keep all existing action ids (slugs) unchanged

Done when: npx tsc --noEmit passes with no errors in this file." bash ~/.claude/scripts/dad-exec.sh
```

### Pkg B — ObjectPreview mobile (codex-dad)

```bash
DAD_PROMPT="Read .workflow/skills/scoped-implementation.md and follow it.
Read /mnt/d/SimpliSalonCLoud/components/objects/ObjectPreview.tsx for full context.

Goal: Add disableOnMobile prop and aria-haspopup to ObjectPreview.

File: /mnt/d/SimpliSalonCLoud/components/objects/ObjectPreview.tsx

Changes:
1. Add prop disableOnMobile?: boolean (default: true)
2. Change condition: when isMobile && disableOnMobile, render children without any popover wrapper
3. When isMobile && !disableOnMobile, keep existing behavior (open stays false)
4. Add aria-haspopup='dialog' to the Popover trigger element
5. Keep all existing props and behavior unchanged for desktop

Constraints:
- Do NOT change the popover visual style
- Do NOT add new shadcn components
- Keep the 400ms hover delay behavior unchanged

Done when: npx tsc --noEmit passes." bash ~/.claude/scripts/dad-exec.sh
```

## Work packages

- ID: pkg-41-config | Type: implementation | Worker: codex-dad | Inputs: object-config.ts, api/bookings/[id] | Outputs: getActions z ctx, poprawne routy
- ID: pkg-41-preview | Type: implementation | Worker: codex-dad | Inputs: ObjectPreview.tsx | Outputs: disableOnMobile prop

## Verification

```bash
npx tsc --noEmit
# Sprawdz ze getActions('client', 'test-id', undefined) nie rzuca
# Sprawdz ze getActions('booking', 'test-id', ctx) zwraca potwierdz/anuluj bez disabled:true
```

## Acceptance criteria

- [ ] `getActions(type, id, ctx?)` przyjmuje opcjonalny kontekst
- [ ] `wyslij-sms` i `przeloz` wywoluja `ctx.router.push` gdy ctx dostepny
- [ ] `potwierdz` i `anuluj` wywoluja PATCH na /api/bookings/[id]
- [ ] `service` route prowadzi do `/${slug}/services`
- [ ] `salon` route prowadzi do `/${slug}/settings/business`
- [ ] `ObjectPreview` renderuje children bez wrappera gdy `isMobile && disableOnMobile`
- [ ] `npx tsc --noEmit` → clean
