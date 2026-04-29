# Sprint SS2.4-49 - Mobile, a11y + final polish

## Cel

Ostatni sprint: mobile warianty, keyboard a11y dla menu, audyt hit targetow, ARIA finalizacja.
Wszystkie poprzednie sprinty musza byc zamkniete. Ten sprint to cross-cutting pass — nie zmienia
logiki biznesowej, tylko zachowanie i dostepnosc.

Spec: `SimpliSalon Design System/revamp/interactive-objects.html` sekcja `09.7` (mobile) i `09.8` (a11y).

Zaleznosc: Sprinty 41-48 zamkniete.

## Architektura - dokumenty referencyjne

```bash
DAD_PROMPT="Read /mnt/d/SimpliSalonCLoud/SimpliSalon Design System/revamp/interactive-objects.html. Extract sections 09.7 (mobile variant) and 09.8 (behavior spec, keyboard, ARIA, states, tokens). List ALL requirements: min hit target size, keyboard sequence, ARIA attributes, state classes, mobile breakpoint. FORMAT: Bulleted list. Do NOT skip any sub-item." bash ~/.claude/scripts/dad-exec.sh
```

| Dokument | Dlaczego |
|----------|----------|
| `SimpliSalon Design System/revamp/interactive-objects.html` | sekcja 09.7 mobile i 09.8 a11y spec |

## Zdiagnozowane problemy

- [ ] `RelatedActionsSheet.tsx` — Esc nie oddaje focusu triggerowi, brak ArrowUp/Down
- [ ] `ObjectTrigger.tsx` — brak `aria-haspopup="menu"` i `aria-expanded` passthrough
- [ ] `ObjectLink.tsx` — `missing` state ma `aria-disabled` ale czy jest `role`?
- [ ] Hit targets: ObjectTrigger dots ma min 44px? (mobile requirement)
- [ ] `RelatedActionsMenu.tsx` — czy focus trap dziala? Esc wraca do triggera?

## Zakres

### A — RelatedActionsSheet keyboard (codex-dad)

Plik: `components/objects/RelatedActionsSheet.tsx`

- [ ] `Esc` → zamknij sheet + focus wraca do triggera (zapisz ref triggera i focus po zamknieciu)
- [ ] `ArrowUp`/`ArrowDown` → nawigacja po akcjach w sheecie
- [ ] `Enter` → aktywacja aktywnej akcji
- [ ] Kazda akcja ma `role="menuitem"`
- [ ] Sheet container ma `role="menu"` i `aria-label="{label} — akcje"`

### B — RelatedActionsMenu keyboard (codex-dad, rownolegle z A)

Plik: `components/objects/RelatedActionsMenu.tsx`

- [ ] Esc → zamknij menu + focus wraca do triggera
- [ ] ArrowUp/Down → nawigacja po akcjach (DropdownMenu z shadcn moze juz to miec)
- [ ] Zweryfikuj ze DropdownMenuItem ma `role="menuitem"` (shadcn standard)
- [ ] Menu trigger ma `aria-haspopup="menu"` i `aria-expanded={open}`

### C — ObjectTrigger ARIA + hit targets (codex-dad, rownolegle z A i B)

Plik: `components/objects/ObjectTrigger.tsx`

- [ ] Przesyłaj `aria-haspopup="menu"` do przycisku triggera
- [ ] Przesyłaj `aria-expanded={open}` do przycisku triggera
- [ ] `aria-label={`Akcje dla ${label}`}` na przycisku dots
- [ ] Min 44x44px: sprawdz CSS klasy przycisku dots — dodaj `min-h-[44px] min-w-[44px]` jesli brak

### D — ObjectLink missing + disabled ARIA (codex-main, rownolegle z A-C)

Plik: `components/objects/ObjectLink.tsx`

- [ ] `missing` state: dodaj `aria-disabled="true"` i `role="text"` (nie link)
- [ ] `disabled` state: `aria-disabled="true"`, `tabIndex={-1}`
- [ ] Default state: upewnij sie ze `role` nie jest ustawiony (anchor domyslnie ok)

### E — Final tsc + audit (dad-reviewer po A-D)

```bash
wsl -d worker-dad -e bash -c '
  /usr/local/bin/codex --dangerously-bypass-approvals-and-sandbox \
    --ephemeral \
    -C /mnt/d/SimpliSalonCLoud \
    --output-last-message /tmp/final-a11y-audit.txt \
    exec "Check these files for ARIA and hit-target issues:
- /mnt/d/SimpliSalonCLoud/components/objects/ObjectTrigger.tsx
- /mnt/d/SimpliSalonCLoud/components/objects/ObjectLink.tsx
- /mnt/d/SimpliSalonCLoud/components/objects/RelatedActionsMenu.tsx
- /mnt/d/SimpliSalonCLoud/components/objects/RelatedActionsSheet.tsx

For each: PASS or FAIL on:
1. aria-haspopup present on trigger
2. aria-expanded present on trigger
3. Esc closes and returns focus
4. ArrowUp/Down navigates items
5. role=menuitem on items
6. min 44px hit target on touch trigger
7. aria-disabled on missing/disabled ObjectLink

Output: PASS/FAIL per item per file. Bulleted list."
  cat /tmp/final-a11y-audit.txt
'
```

## Dispatch commands

### Pkg A — RelatedActionsSheet keyboard (codex-dad)

```bash
DAD_PROMPT="Read .workflow/skills/scoped-implementation.md and follow it.
Read /mnt/d/SimpliSalonCLoud/components/objects/RelatedActionsSheet.tsx for full context.

Goal: Add full keyboard navigation to RelatedActionsSheet.

File: /mnt/d/SimpliSalonCLoud/components/objects/RelatedActionsSheet.tsx

Changes:
1. Track triggerRef (useRef) — pass ref to the trigger element that opens the sheet.
2. On Sheet onOpenChange(false): call triggerRef.current?.focus() to return focus.
3. Inside the sheet content, add onKeyDown handler:
   - ArrowDown: move focus to next menuitem
   - ArrowUp: move focus to previous menuitem
   - Escape: close sheet (call onOpenChange(false)) — radix Sheet may handle this already; verify
4. Give each action button role='menuitem'.
5. Give the sheet content container role='menu' and aria-label={label + ' — akcje'}.

Constraints:
- Do NOT change the visual layout of the sheet
- Do NOT change how actions are generated from getActions
- Keep all existing onOpenChange behavior

Done when: npx tsc --noEmit passes." bash ~/.claude/scripts/dad-exec.sh
```

### Pkg B — RelatedActionsMenu keyboard (codex-dad, rownolegle z A)

```bash
DAD_PROMPT="Read .workflow/skills/scoped-implementation.md and follow it.
Read /mnt/d/SimpliSalonCLoud/components/objects/RelatedActionsMenu.tsx for full context.

Goal: Verify and complete keyboard behavior and ARIA in RelatedActionsMenu.

File: /mnt/d/SimpliSalonCLoud/components/objects/RelatedActionsMenu.tsx

Changes:
1. On the DropdownMenuTrigger: add aria-haspopup='menu' and aria-expanded={open}.
2. Verify DropdownMenuItem already has role='menuitem' (shadcn default). If not, add.
3. On DropdownMenu onOpenChange(false) via Esc: confirm focus returns to trigger.
   If Radix DropdownMenu handles this natively — no change needed. Just verify in code.
4. DropdownMenuTrigger: add aria-label={`Akcje dla ${label}`} if missing.

Constraints:
- Do NOT change visual layout
- Radix handles most keyboard/focus — do not duplicate

Done when: npx tsc --noEmit passes." bash ~/.claude/scripts/dad-exec.sh
```

### Pkg C — ObjectTrigger ARIA + hit (codex-dad, rownolegle)

```bash
DAD_PROMPT="Read .workflow/skills/scoped-implementation.md and follow it.
Read /mnt/d/SimpliSalonCLoud/components/objects/ObjectTrigger.tsx for full context.

Goal: Add ARIA attributes and ensure 44px hit target on ObjectTrigger.

File: /mnt/d/SimpliSalonCLoud/components/objects/ObjectTrigger.tsx

Changes:
1. On the button that renders dots or chevron: add aria-haspopup='menu'.
2. Add aria-expanded={open} to same button.
3. Add aria-label={'Akcje dla ' + label} to the button.
4. Check the button className: if min-h or min-w smaller than 44px, add min-h-[44px] min-w-[44px].
5. Pass open and onOpenChange down to RelatedActionsMenu and RelatedActionsSheet.

Constraints:
- Do NOT change variant logic (dots vs chevron)
- Keep all existing className merging

Done when: npx tsc --noEmit passes." bash ~/.claude/scripts/dad-exec.sh
```

### Pkg D — ObjectLink ARIA (codex-main, rownolegle)

```bash
codex exec --dangerously-bypass-approvals-and-sandbox "Read .workflow/skills/scoped-implementation.md and follow it.
Read components/objects/ObjectLink.tsx for full context.

Goal: Add correct ARIA to missing and disabled states in ObjectLink.

File: components/objects/ObjectLink.tsx

Changes:
1. missing prop: render as <span> not <a>, add aria-disabled='true', role='note' or role='text'.
2. disabled prop: keep <a> but add aria-disabled='true' and tabIndex={-1}.
3. Default state: no role attribute override needed.

Constraints:
- Do NOT change visual styling
- Do NOT change href behavior for enabled links

Done when: npx tsc --noEmit passes." < /dev/null
```

## Work packages

- ID: pkg-49-sheet-keyboard | Type: implementation | Worker: codex-dad | Inputs: RelatedActionsSheet.tsx | Outputs: keyboard nav + focus return
- ID: pkg-49-menu-keyboard | Type: implementation | Worker: codex-dad | Inputs: RelatedActionsMenu.tsx | Outputs: ARIA + keyboard verify
- ID: pkg-49-trigger-aria | Type: implementation | Worker: codex-dad | Inputs: ObjectTrigger.tsx | Outputs: aria-haspopup + aria-expanded + 44px
- ID: pkg-49-link-aria | Type: implementation | Worker: codex-main | Inputs: ObjectLink.tsx | Outputs: missing/disabled ARIA
- ID: pkg-49-audit | Type: review | Worker: dad-reviewer | Inputs: A-D output | Outputs: /tmp/final-a11y-audit.txt

## Verification

```bash
npx tsc --noEmit
cat /tmp/final-a11y-audit.txt

# Keyboard test sequence:
# 1. Tab do ObjectTrigger → focus widoczny
# 2. Enter/Space → menu otwarte, aria-expanded=true
# 3. ArrowDown → pierwsza akcja focused
# 4. ArrowDown/Up → nawigacja
# 5. Enter → akcja wywolana, menu zamkniete
# 6. Esc zamiast Enter → menu zamkniete, focus wraca do triggera
# 7. Na mobile: swipe up → bottom sheet, te same reguly
```

## Acceptance criteria

- [ ] RelatedActionsSheet: Esc zamyka + focus wraca do triggera
- [ ] RelatedActionsSheet: ArrowUp/Down nawiguje po akcjach
- [ ] RelatedActionsMenu: aria-haspopup + aria-expanded na triggerze
- [ ] ObjectTrigger: aria-label="Akcje dla {nazwa}", min 44x44px
- [ ] ObjectLink missing: aria-disabled="true", nie jest linkiem
- [ ] ObjectLink disabled: aria-disabled="true", tabIndex=-1
- [ ] Dad-reviewer audit: wszystkie checkpointy PASS
- [ ] `npx tsc --noEmit` → clean
