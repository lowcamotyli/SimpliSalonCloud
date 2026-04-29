# Sprint Overview — Interactive Objects + Related Actions

## Zależności między sprintami

```
Sprint A (primitives) ──────────────────────────────────┐
  └─ dad A1: object-config, ObjectAvatar, RelatedActionsMenu, RelatedActionsSheet
  └─ main A2: ObjectLink, ObjectPill, ObjectTrigger, ObjectPreview, index.ts
                                                          │
          ┌─────────────────────────────────────────────────┘ tsc clean
          │
          ├──> Sprint B (booking card) — dad B1 solo
          │     └─ components/calendar/booking-card.tsx — 3 strefy kliknięcia
          │
          ├──> Sprint C (search) — równolegle: dad C1+C2, potem main C3
          │     └─ C1: app/api/search/route.ts
          │     └─ C2: components/layout/global-search.tsx
          │     └─ C3: components/layout/navbar.tsx (po C2)
          │
          └──> Sprint D (tables) — równolegle: dad D1+D2
                └─ D2: components/objects/ObjectCell.tsx (nowy)
                └─ D1: components/clients/clients-list-view.tsx (edycja)
```

## Kolejność wykonywania

| Faza | Sprinty | Warunek |
|------|---------|---------|
| 1 | A (A1 + A2 równolegle) | Brak — start od razu |
| 2 | B + C (C1+C2) + D (D1+D2) — wszystkie równolegle | tsc clean po Sprint A |
| 3 | C3 (navbar) | C2 done (GlobalSearch komponent istnieje) |

**Faza 2 to największy boost** — 4 workery naraz jeśli masz dostęp do 2 kont Codex.

## Pliki według spryntów

### Sprint A — Nowe (9 plików)
```
components/objects/
  object-config.ts          ← dad A1
  ObjectAvatar.tsx          ← dad A1
  RelatedActionsMenu.tsx    ← dad A1
  RelatedActionsSheet.tsx   ← dad A1
  ObjectLink.tsx            ← main A2
  ObjectPill.tsx            ← main A2
  ObjectTrigger.tsx         ← main A2
  ObjectPreview.tsx         ← main A2
  index.ts                  ← main A2
```

### Sprint B — Edycja (1 plik)
```
components/calendar/booking-card.tsx   ← dad B1
```

### Sprint C — Nowe + Edycja (3 pliki)
```
app/api/search/route.ts                ← dad C1 (nowy)
components/layout/global-search.tsx    ← dad C2 (nowy)
components/layout/navbar.tsx           ← main C3 (edycja, 64 linie)
```

### Sprint D — Nowy + Edycja (2 pliki)
```
components/objects/ObjectCell.tsx      ← dad D2 (nowy, dodaj do index.ts)
components/clients/clients-list-view.tsx ← dad D1 (edycja, 300 linii)
```

## Weryfikacja po każdej fazie

```bash
# Po każdym sprincie:
cd d:/SimpliSalonCLoud && npx tsc --noEmit

# Jeśli błędy → dad fixer:
DAD_PROMPT='Read .workflow/skills/typescript-repair.md and follow it.
Run npx tsc --noEmit in /mnt/d/SimpliSalonCLoud. Fix all TypeScript errors. Do not change logic.' bash ~/.claude/scripts/dad-exec.sh
```

## Acceptance criteria (całościowe)

Po wszystkich 4 sprintach:

- [ ] `components/objects/` ma 10 plików (9 z Sprint A + ObjectCell z Sprint D)
- [ ] Booking card: 3 strefy kliknięcia bez konfliktu
- [ ] Search: Cmd+K → panel wyników → ObjectPill wyniki → keyboard nav
- [ ] CRM lista klientów: ObjectCell w kolumnie nazwy
- [ ] `npx tsc --noEmit` przechodzi czysto
- [ ] Żadna nowa paleta kolorów — tylko tokeny v3
- [ ] Desktop + mobile: menu vs bottom sheet
- [ ] ARIA: aria-haspopup, aria-expanded, role=menuitem, Esc focus return

## Uwagi dla Codex-dad

1. Ścieżki ZAWSZE `/mnt/d/SimpliSalonCLoud/...` — nigdy `d:\`
2. Wywołanie przez wrapper: `DAD_PROMPT="..." bash ~/.claude/scripts/dad-exec.sh`
3. HTML reference w cudzysłowie ze spacją: `"/mnt/d/SimpliSalonCLoud/SimpliSalon Design System/revamp/..."`
4. Każdy prompt zaczyna się od `Read .workflow/skills/scoped-implementation.md and follow it.`
5. Import shadcn z indywidualnych ścieżek, NIE z barrel `@/components/ui`
