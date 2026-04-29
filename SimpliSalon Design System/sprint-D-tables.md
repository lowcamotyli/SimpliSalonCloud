# Sprint D — CRM Tables: Object Cells

## Owner
- Orchestrator: Claude | Workers: codex-dad (D1, D2) | Status: plan
- **Bloker:** Sprint A musi być zakończony i tsc clean
- Sprint B i C NIE są blokerami — D może startować równolegle z B i C

## Intent
Zaktualizować tabele z listami klientów i innych obiektów aby używały `ObjectPill` (avatar + nazwa + meta) i `ObjectTrigger` w dedykowanej kolumnie akcji. Cel: klik w avatar/nazwę nawiguje do profilu, bez przejścia przez cały wiersz.

## Architektura — dokumenty referencyjne

```bash
DAD_PROMPT='Read "/mnt/d/SimpliSalonCLoud/SimpliSalon Design System/revamp/interactive-objects.html" section 09.6 (table cell object variant). List: object cell structure, action column placement, hover/focus rules, ellipsis handling for long names. FORMAT: Bulleted list.' bash ~/.claude/scripts/dad-exec.sh
```

| Dokument | Dlaczego |
|----------|----------|
| `interactive-objects.html` sekcja 09.6 | Table cell object variant spec |
| `interactive-objects.html` sekcja 09.7 | Mobile variant — bottom sheet w tabelach |

## Pliki

| Plik | Worker | Rozmiar | Uwagi |
|------|--------|---------|-------|
| `components/clients/clients-list-view.tsx` | **dad D1** | 300 linii | Główna lista klientów |
| `components/objects/ObjectCell.tsx` | **dad D2** | Nowy | Reusable table cell component |

Opcjonalnie (po D1 + D2, jeśli czas):
| `app/(dashboard)/[slug]/employees/page.tsx` | **dad D3** | sprawdź | Lista pracowników |

## Graf zależności

```
Sprint A (components/objects/) ──┐
                                  ├──> dad D2 (ObjectCell — nowy plik)
                                  └──> dad D1 (clients-list-view — edycja, używa ObjectCell)
```

D1 i D2 mogą startować **równolegle** — D2 pisze nowy plik, D1 edytuje istniejący. D1 będzie importować ObjectCell który D2 tworzy — akceptujemy tsc error po równoległym dispatchu, dad fixer go naprawi.

## Dispatch — RÓWNOLEGLE: D1 i D2

### Worker D2 — codex-dad (ObjectCell komponent)

```bash
DAD_PROMPT='Read .workflow/skills/scoped-implementation.md and follow it.
Read /mnt/d/SimpliSalonCLoud/components/objects/index.ts and /mnt/d/SimpliSalonCLoud/components/objects/object-config.ts.
Read "/mnt/d/SimpliSalonCLoud/SimpliSalon Design System/revamp/interactive-objects.html" section 09.6 for table cell spec.

Goal: Create reusable ObjectCell component for table rows.

File: /mnt/d/SimpliSalonCLoud/components/objects/ObjectCell.tsx

Implementation:
- "use client"
- Props: { type: ObjectType, id: string, label: string, slug: string, meta?: string, avatarUrl?: string, showActions?: boolean, className?: string }
- Layout: flex row items-center gap-2 justify-between
  Left: [ObjectPill] — avatar + name, links to profile (stopPropagation)
  Right (if showActions): [ObjectTrigger variant="dots"] — compact, flex-shrink-0
- ObjectPill truncates at max-w-[200px] with text-ellipsis
- Meta text below label in ObjectPill (small, text-muted-foreground) if provided
- Row hover (from parent tr) must NOT hide focus ring on ObjectPill/ObjectTrigger
  — use focus-visible ring with color var --obj-{type}
- Missing object: show "—" dash placeholder, no link, aria-label="Brak przypisanego {typeLabel}"
- Export as named export: ObjectCell

Constraints:
- Import ObjectPill, ObjectTrigger from ./ObjectPill, ./ObjectTrigger (relative)
- No new color tokens
- Add ObjectCell to /mnt/d/SimpliSalonCLoud/components/objects/index.ts exports
Done when: file written, index.ts updated.' bash ~/.claude/scripts/dad-exec.sh
```

### Worker D1 — codex-dad (Clients list view)

```bash
DAD_PROMPT='Read .workflow/skills/scoped-implementation.md and follow it.
Read /mnt/d/SimpliSalonCLoud/components/clients/clients-list-view.tsx (current implementation).
Read /mnt/d/SimpliSalonCLoud/components/objects/index.ts for ObjectCell, ObjectPill imports.

Goal: Update clients-list-view.tsx to use ObjectCell in the name/avatar column.

File: /mnt/d/SimpliSalonCLoud/components/clients/clients-list-view.tsx

Changes:
- Import ObjectCell from @/components/objects/ObjectCell (individual path, NOT barrel)
- In the client name column (TableCell that currently shows avatar + name):
  Replace with: <ObjectCell type="client" id={client.id} label={client.full_name} slug={slug} meta={client.email ?? client.phone} avatarUrl={client.avatar_url} showActions={true} />
- Client list must receive slug prop — if not present, add optional slug?: string to component props
- Existing row click handler (if any) stays on the tr/row level — ObjectCell handles stopPropagation internally
- Actions column: if there is a separate actions column with buttons, keep it OR consolidate into ObjectCell showActions — do NOT duplicate
- Long names: ObjectCell handles truncation internally — remove any manual truncation from the column
- Keep all existing filters, search input, pagination unchanged

Constraints:
- Do not remove existing columns (tags, last visit, balance, etc.)
- Keep existing sort and filter logic
- If slug is not available in component, receive it as prop from parent page
Done when: file written, ObjectCell imported and used in name column.' bash ~/.claude/scripts/dad-exec.sh
```

## Weryfikacja po Sprint D

```bash
# 1. TypeScript check
cd d:/SimpliSalonCLoud && npx tsc --noEmit 2>&1 | head -50

# 2. Wiring check
grep -r "ObjectCell" d:/SimpliSalonCLoud/components/clients/clients-list-view.tsx
grep -r "ObjectCell" d:/SimpliSalonCLoud/components/objects/index.ts

# 3. Jeśli błędy tsc → dad fixer
DAD_PROMPT='Read .workflow/skills/typescript-repair.md and follow it.
Run npx tsc --noEmit in /mnt/d/SimpliSalonCLoud. Fix all TypeScript errors in components/objects/ObjectCell.tsx and components/clients/clients-list-view.tsx. Do not change logic.' bash ~/.claude/scripts/dad-exec.sh
```

## Acceptance criteria

- [ ] `components/objects/ObjectCell.tsx` istnieje i jest w index.ts
- [ ] clients-list-view.tsx używa ObjectCell w kolumnie nazwy klienta
- [ ] Klik avatar/nazwa → nawigacja do profilu klienta (nie otwiera row action)
- [ ] Klik `...` → Related Actions menu (stopPropagation)
- [ ] Długie nazwy truncated z ellipsis
- [ ] Row hover nie ukrywa focus ring na ObjectPill/ObjectTrigger
- [ ] `npx tsc --noEmit` przechodzi czysto

## Decision
Ship: TBD
