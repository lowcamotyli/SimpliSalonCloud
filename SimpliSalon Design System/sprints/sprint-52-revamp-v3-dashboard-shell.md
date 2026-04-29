# Sprint SS2.4-52 - Revamp v3 dashboard shell

## Cel

Przebudowac glowny shell aplikacji: sidebar, navbar, global search container, dashboard main spacing,
mobile nav sheet. Po tym sprincie kazdy ekran ma siedziec w ramie identycznej ze wzorcem `revamp.html`.

Zaleznosc: Sprinty 50-51 zamkniete.

## Architektura - dokumenty referencyjne

```bash
DAD_PROMPT="Read /mnt/d/SimpliSalonCLoud/SimpliSalon Design System/revamp/revamp.html. Extract ONLY app shell spec: .app, .sidebar, .side-section, .side-item, .topnav, .search, .app-main, dashboard heading/action row, mobile assumptions. Include spacing, typography, colors, active/hover states. FORMAT: Bulleted list with class names and exact values." bash ~/.claude/scripts/dad-exec.sh
```

| Dokument | Dlaczego |
|----------|----------|
| `SimpliSalon Design System/revamp/revamp.html` | dashboard shell target |
| `app/(dashboard)/[slug]/layout.tsx` | main dashboard composition |
| `components/layout/sidebar.tsx` | left nav |
| `components/layout/navbar.tsx` | top nav |
| `components/layout/global-search.tsx` | search input in navbar |
| `components/layout/mobile-nav-context.tsx` | mobile nav state |

## Zdiagnozowane problemy

- [ ] Sidebar jest bardziej glass/purple/luxe niz v3 flat
- [ ] Navbar ma blur i stary button logout
- [ ] Dashboard main spacing nie odpowiada `revamp.html`
- [ ] Active nav ma glow/dot zamiast spokojnego `secondary-soft`
- [ ] Mobile sheet musi odziedziczyc ten sam jezyk wizualny

## Zakres

### A - Dashboard layout shell (codex-main)

Plik: `app/(dashboard)/[slug]/layout.tsx`

- [ ] Shell: `bg-[var(--v3-bg)]`, no glass
- [ ] Sidebar width i main spacing zgodne z `revamp.html`
- [ ] Main: `p-4 md:p-6` lub `24/28px` zgodnie z responsywnoscia
- [ ] Nie zmieniac auth/profile/settings loading logic

### B - Sidebar visual rewrite (codex-dad)

Plik: `components/layout/sidebar.tsx`

- [ ] Brand block: compact salon/app identity, square logo 32/40px, no Sparkles-heavy look
- [ ] Sections: uppercase 11px, letter spacing 0.1em, muted text
- [ ] Items: 44px mobile min, radius 6/8px, active `--v3-secondary-soft`, text `--v3-secondary`
- [ ] Remove glow dot/shadow-lg active indicator
- [ ] Subnav: left border subtle, active same v3 system
- [ ] Footer user block: plain white/light surface, no glass

### C - Navbar + global search shell (codex-dad)

Pliki:
- `components/layout/navbar.tsx`
- `components/layout/global-search.tsx`

- [ ] Navbar: white or surface, 1px bottom border, no blur/glass
- [ ] Salon name uses display/UI hierarchy from v3
- [ ] Icon buttons: circular/36px, hover `--v3-bg-alt`
- [ ] Logout button: secondary/ghost style unless primary action required
- [ ] Search field matches `.search` from `revamp.html`

## Dispatch commands

### Pkg A - layout shell

```bash
codex exec --dangerously-bypass-approvals-and-sandbox "Read .workflow/skills/scoped-implementation.md and follow it.
Read app/(dashboard)/[slug]/layout.tsx.
Read SimpliSalon Design System/revamp/revamp.html app shell section.

Goal: Align dashboard layout shell with Revamp v3.

File: app/(dashboard)/[slug]/layout.tsx

Changes:
1. Update only visual shell classNames around Sidebar/Navbar/main.
2. Keep auth, redirects, Supabase queries and ThemeProvider logic unchanged.
3. Use theme-dashboard-shell and theme-dashboard-main as stable hooks.

Done when: npm run typecheck passes." < /dev/null
```

### Pkg B - sidebar

```bash
DAD_PROMPT="cd /mnt/d/SimpliSalonCLoud
Read .workflow/skills/scoped-implementation.md and follow it.
Read components/layout/sidebar.tsx.
Read SimpliSalon Design System/revamp/revamp.html styles for .sidebar, .side-section, .side-item and app logo block.

Goal: Rewrite Sidebar visual styling to Revamp v3.

File: components/layout/sidebar.tsx

Constraints:
- Do NOT change nav item hrefs, permissions, role filtering or logout behavior.
- Keep mobile Sheet behavior.
- Remove glow/shadow-heavy active styles.
- Maintain min 44px hit targets.

Done when: npm run typecheck passes.
Return evidence: files changed, commands run with exact results, open risks/follow-ups." bash ~/.claude/scripts/dad-exec.sh
```

### Pkg C - navbar + search shell

```bash
DAD_PROMPT="cd /mnt/d/SimpliSalonCLoud
Read .workflow/skills/scoped-implementation.md and follow it.
Read components/layout/navbar.tsx and components/layout/global-search.tsx.
Read SimpliSalon Design System/revamp/revamp.html styles for .topnav, .search, .nav-icon and .avatar.

Goal: Align Navbar and global search container with Revamp v3.

Files:
- components/layout/navbar.tsx
- components/layout/global-search.tsx

Constraints:
- Do NOT change search API calls, debounce, keyboard behavior or command palette behavior.
- Visual classes only unless accessibility is broken.

Done when: npm run typecheck passes.
Return evidence: files changed, commands run with exact results, open risks/follow-ups." bash ~/.claude/scripts/dad-exec.sh
```

## Work packages

- ID: pkg-52-layout-shell | Type: implementation | Worker: codex-main | Inputs: dashboard layout | Outputs: v3 shell hooks
- ID: pkg-52-sidebar | Type: implementation | Worker: codex-dad | Inputs: sidebar.tsx | Outputs: v3 navigation
- ID: pkg-52-navbar-search | Type: implementation | Worker: codex-dad | Inputs: navbar.tsx, global-search.tsx | Outputs: v3 topnav/search

## Verification

```bash
npm run typecheck
pwsh ./scripts/check-encoding.ps1
# Manual desktop: dashboard, calendar, settings pages share same shell.
# Manual mobile: open nav sheet, verify same sidebar style and 44px targets.
```

## Acceptance criteria

- [ ] Sidebar matches v3 active/hover/section styling
- [ ] Navbar is flat, bordered, no glass blur
- [ ] Global search input matches v3 `.search`
- [ ] Mobile sidebar sheet keeps same visual language
- [ ] Auth/permissions/nav routing unchanged
- [ ] `npm run typecheck` -> clean
