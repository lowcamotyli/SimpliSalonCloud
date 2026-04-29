# Sprint SS2.4-57 - Revamp v3 visual regression, mobile + a11y final

## Cel

Finalny sprint zamykajacy pelne wdrozenie Revamp v3: screenshoty, porownanie z referencjami,
mobile, keyboard, focus, kontrast, encoding, typecheck. Ten sprint nie powinien dodawac nowych
funkcji. Tylko poprawki wykryte w audycie.

Zaleznosc: Sprinty 50-56 zamkniete.

## Architektura - dokumenty referencyjne

```bash
DAD_PROMPT="Read /mnt/d/SimpliSalonCLoud/SimpliSalon Design System/revamp/revamp.html, /mnt/d/SimpliSalonCLoud/SimpliSalon Design System/revamp/interactive-objects.html and /mnt/d/SimpliSalonCLoud/SimpliSalon Design System/revamp/tokens-v3.css. Create a final visual QA checklist for Revamp v3 implementation: colors, fonts, cards, buttons, sidebar, navbar, tables, booking cards, object components, mobile, keyboard, focus, loading, empty, error states. FORMAT: checklist grouped by area. Include forbidden patterns to grep for." bash ~/.claude/scripts/dad-exec.sh
```

| Dokument | Dlaczego |
|----------|----------|
| `SimpliSalon Design System/revamp/tokens-v3.css` | final token parity |
| `SimpliSalon Design System/revamp/revamp.html` | final app visual parity |
| `SimpliSalon Design System/revamp/interactive-objects.html` | object/menu/mobile/a11y parity |
| `SimpliSalon Design System/sprints/sprint-50-*.md` do `sprint-56-*.md` | acceptance trail |
| `scripts/check-encoding.ps1` | Polish mojibake guard |
| `playwright.config.ts` | browser verification |

## Zdiagnozowane problemy

- [ ] Mozliwe resztki `rounded-3xl`, `backdrop-blur`, `gradient-to`, `shadow-2xl`, `animate-glow`
- [ ] Mozliwe ekrany, ktore nie byly widoczne w happy path
- [ ] Mobile hit targets i overflow moga regresowac po zmianach stylu
- [ ] Keyboard/focus musi zostac sprawdzony po visual rewrite
- [ ] Polskie stringi wymagaja encoding check

## Zakres

### A - Static audit + forbidden patterns (dad-reviewer)

- [ ] Grep forbidden patterns in `app`, `components`, `themes`
- [ ] Wyjatki tylko jesli uzasadnione i zgodne z v3
- [ ] Sprawdz czy `--v3-*` tokens sa uzywane w globalnych overrides
- [ ] Sprawdz czy komponenty UI nie maja starych purple/luxe wartosci

### B - Browser screenshot pass (codex-main)

Widoki minimum:
- `/[slug]/dashboard`
- `/[slug]/calendar`
- `/[slug]/bookings`
- `/[slug]/clients`
- `/[slug]/clients/[id]`
- `/[slug]/services`
- `/[slug]/employees`
- `/[slug]/settings`
- `/[slug]/forms`
- `/[slug]/reports`
- `/[slug]/booksy`
- `/[slug]/billing`
- public form/survey if test token available

- [ ] Desktop 1440px
- [ ] Tablet/mobile 390px
- [ ] Verify no overlap, no clipped text, no old gradient/glass look

### C - Keyboard/mobile/a11y audit (dad-reviewer)

- [ ] Sidebar mobile sheet: open/close/focus return
- [ ] Global search: Ctrl/Cmd+K, arrows, enter, esc
- [ ] RelatedActions: trigger, menu, sheet, esc/focus return
- [ ] Dialogs: focus trap, escape, labelled title
- [ ] Buttons/links: visible focus
- [ ] Touch targets: >=44px on mobile interactive controls

## Dispatch commands

### Pkg A - static audit

```bash
wsl -d worker-dad -e bash -c '
  /usr/local/bin/codex --dangerously-bypass-approvals-and-sandbox \
    --ephemeral \
    -C /mnt/d/SimpliSalonCLoud \
    --output-last-message /tmp/revamp-v3-static-audit.txt \
    exec "Read .workflow/skills/review-ready-diff.md if present; otherwise perform a read-only implementation audit.

Goal: Static audit for forbidden legacy visual patterns after Revamp v3 migration.

Commands to run:
- rg -n \"gradient-to|backdrop-blur|rounded-3xl|shadow-2xl|animate-glow|luxe-bg|glass|purple|violet|rose-\" app components themes
- rg -n \"--v3-|theme-dashboard|theme-sidebar|theme-navbar|theme-card|theme-button\" app components themes

Output:
1. List each forbidden hit with file path and whether it is acceptable or must be fixed.
2. Do not edit files.
3. Save final PASS/FAIL report with file references.

Done when: report is saved."
  cat /tmp/revamp-v3-static-audit.txt
'
```

### Pkg B - browser visual pass

```bash
codex exec --dangerously-bypass-approvals-and-sandbox "Use the playwright skill if available.
Start the dev server if not already running.

Goal: Visual QA Revamp v3 on desktop and mobile.

Visit these app routes using an available salon slug:
- dashboard
- calendar
- bookings
- clients
- services
- employees
- settings
- forms
- reports
- booksy
- billing

For each route:
1. Capture or inspect desktop 1440px.
2. Capture or inspect mobile 390px.
3. Report visual failures: old glass/gradient, clipped text, overlap, wrong colors, excessive radius, broken sidebar/navbar, invisible focus.

Do not change files unless the failure is small and clearly visual-only.
Done when: visual QA report is ready." < /dev/null
```

### Pkg C - a11y reviewer

```bash
wsl -d worker-dad -e bash -c '
  /usr/local/bin/codex --dangerously-bypass-approvals-and-sandbox \
    --ephemeral \
    -C /mnt/d/SimpliSalonCLoud \
    --output-last-message /tmp/revamp-v3-a11y-audit.txt \
    exec "Review the implemented Revamp v3 UI for keyboard/mobile/a11y regressions.
Focus files:
- components/layout/sidebar.tsx
- components/layout/navbar.tsx
- components/layout/global-search.tsx
- components/objects/ObjectTrigger.tsx
- components/objects/RelatedActionsMenu.tsx
- components/objects/RelatedActionsSheet.tsx
- components/ui/button.tsx
- components/ui/dialog.tsx
- components/ui/dropdown-menu.tsx

Check:
1. visible focus
2. aria-expanded/haspopup for menus
3. Esc closes overlays and returns focus
4. Arrow navigation where expected
5. mobile hit targets >=44px
6. no clipped labels on mobile
7. dialogs have title/label

Output PASS/FAIL per area with file references. Do not edit."
  cat /tmp/revamp-v3-a11y-audit.txt
'
```

## Work packages

- ID: pkg-57-static-audit | Type: review | Worker: dad-reviewer | Inputs: app/components/themes | Outputs: `/tmp/revamp-v3-static-audit.txt`
- ID: pkg-57-browser-visual | Type: review | Worker: codex-main | Inputs: running app, dad static report | Outputs: desktop/mobile visual QA report + tiny visual fixes if obvious
- ID: pkg-57-a11y-review | Type: review | Worker: dad-reviewer | Outputs: `/tmp/revamp-v3-a11y-audit.txt`

## Verification

```bash
npm run typecheck
pwsh ./scripts/check-encoding.ps1
npm run lint
# Optional if suite is stable:
# npm run test
cat /tmp/revamp-v3-static-audit.txt
cat /tmp/revamp-v3-a11y-audit.txt
```

## Acceptance criteria

- [ ] No unapproved legacy glass/gradient/heavy-radius patterns remain
- [ ] Desktop visual QA passes for core dashboard routes
- [ ] Mobile visual QA passes for core dashboard routes
- [ ] RelatedActions/global search/sidebar keyboard checks PASS
- [ ] Focus visible across buttons, links, menus, dialogs
- [ ] No Polish mojibake
- [ ] `npm run typecheck` -> clean
- [ ] Claude makes final ship/no-ship decision
