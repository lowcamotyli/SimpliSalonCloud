# Sprint AF-07 — Dynamic Navigation + Module-Aware Layout

## Cel
(P1) Sidebar i layout generowany z MODULE_REGISTRY zamiast hardcoded listy.
Po tym sprincie dodanie nowego modułu do registry automatycznie pojawia się
w nawigacji — bez edytowania sidebar.tsx.

## Architektura — dokumenty referencyjne

```bash
DAD_PROMPT="Read /mnt/d/SimpliSalonCLoud/docs/AppForge/MODULE-SYSTEM.md and /mnt/d/SimpliSalonCLoud/docs/AppForge/APP-CONFIG.md. List: (1) how navItems are defined in ModuleManifest, (2) getEnabledModules() function signature, (3) how APP_CONFIG.enabledModules drives navigation. FORMAT: Bulleted list." bash ~/.claude/scripts/dad-exec.sh
```

| Dokument | Dlaczego |
|----------|----------|
| `docs/AppForge/MODULE-SYSTEM.md` | ModuleManifest.navItems, getEnabledModules(), MODULE_REGISTRY |
| `docs/AppForge/APP-CONFIG.md` | APP_CONFIG.enabledModules — źródło prawdy |
| `docs/AppForge/SECURITY.md` | permission check — nie pokazuj linków bez uprawnień |

**Kluczowe constraints:**
- Istniejący `components/layout/sidebar.tsx` — edytuj, nie zastępuj całkowicie
- Zachowaj istniejące style i animacje sidebara
- NavItem permission jest opcjonalne — brak permission = zawsze widoczny
- Kolejność navItems z enabledModules[] — respektuj kolejność z APP_CONFIG
- Użytkownik widzi tylko linki, do których ma uprawnienia (check JWT permissions)

## Zakres

### Pliki do edycji

| Plik | Worker | Zmiana |
|------|--------|--------|
| `components/layout/sidebar.tsx` | codex-dad | Zamień hardcoded nav na generowany z MODULE_REGISTRY |
| `app/(dashboard)/[slug]/layout.tsx` | codex-main | Przekaż activeModules props do Sidebar |

### Pliki nowe

| Plik | Worker | Zawartość |
|------|--------|-----------|
| `lib/modules/nav-helpers.ts` | codex-main | buildNavItems(), filterByPermissions() |

## Work packages

- ID: pkg-nav-helpers | Type: implementation | Worker: codex-main
  Inputs: AF-01 (registry), AF-04..AF-06 (manifests in registry)
  Outputs: lib/modules/nav-helpers.ts

- ID: pkg-layout | Type: implementation | Worker: codex-main
  Inputs: pkg-nav-helpers
  Outputs: app/(dashboard)/[slug]/layout.tsx update (< 10 linii diff)

- ID: pkg-sidebar | Type: implementation | Worker: codex-dad
  Inputs: pkg-nav-helpers, istniejący sidebar.tsx
  Outputs: components/layout/sidebar.tsx update

Kolejność: pkg-nav-helpers → oba równolegle (pkg-layout + pkg-sidebar).

## Prompt — codex-main (nav helpers + layout)

```bash
codex exec --dangerously-bypass-approvals-and-sandbox "Read .workflow/skills/scoped-implementation.md and follow it.
Read docs/AppForge/MODULE-SYSTEM.md for getEnabledModules() and navItems structure.
Read app/(dashboard)/[slug]/layout.tsx for current layout structure.
Read lib/modules/registry.ts and lib/modules/types.ts.
Do NOT use Gemini — write directly.

Goal: Build navigation helpers and update layout.

File 1: lib/modules/nav-helpers.ts (NEW)
- Import MODULE_REGISTRY, getEnabledModules from lib/modules/registry
- Import APP_CONFIG from app-config (or accept enabledModules as param for SSR)
- Export interface ResolvedNavItem { path: string; label: string; icon: string; permission?: string; children?: ResolvedNavItem[] }
- Export buildNavItems(enabledModuleIds: string[]): ResolvedNavItem[]
  Sort by enabledModuleIds order, flatten navItems from each manifest
- Export filterByPermissions(items: ResolvedNavItem[], userPermissions: string[]): ResolvedNavItem[]
  Keep item if no permission required, or userPermissions includes item.permission

File 2: app/(dashboard)/[slug]/layout.tsx (EDIT — minimal change)
- Import buildNavItems, filterByPermissions from lib/modules/nav-helpers
- Import APP_CONFIG from app-config
- Get user permissions from getAuthContext()
- Compute: const navItems = filterByPermissions(buildNavItems(APP_CONFIG.enabledModules), permissions)
- Pass navItems to Sidebar component

Constraints:
- lib/modules/nav-helpers.ts is a pure function file (no React imports)
- Do NOT change layout.tsx logic beyond adding navItems computation
- Keep all existing layout structure intact
Done when: tsc passes."
```

## Prompt — codex-dad (sidebar update)

```bash
DAD_PROMPT="Read .workflow/skills/targeted-file-read.md and follow it.
Read /mnt/d/SimpliSalonCLoud/components/layout/sidebar.tsx.
Read /mnt/d/SimpliSalonCLoud/lib/modules/nav-helpers.ts for ResolvedNavItem type.
Read /mnt/d/SimpliSalonCLoud/docs/AppForge/MODULE-SYSTEM.md for navItems structure.

Goal: Refactor sidebar to accept navItems prop instead of hardcoded links.

File: /mnt/d/SimpliSalonCLoud/components/layout/sidebar.tsx

Changes:
1. Add prop: navItems: ResolvedNavItem[] (from lib/modules/nav-helpers)
2. Replace hardcoded nav link list with: navItems.map(item => <NavLink ...>)
3. Keep all existing: styling, active state detection, collapse animation, logo, user menu
4. Keep all existing: non-module items (settings, billing, help) — add them hardcoded after module navItems
5. Icon rendering: use dynamic Lucide icon by name (import { icons } from 'lucide-react', render icons[item.icon])

Constraints:
- Preserve ALL existing CSS classes and animation
- Do NOT change sidebar width, collapse behavior, or keyboard shortcuts
- If navItems prop is empty, fall back to current hardcoded list (backwards compatibility)
Done when: tsc passes and sidebar renders module navItems from prop." bash ~/.claude/scripts/dad-exec.sh
```

## Verification

```bash
npx tsc --noEmit
# Test: dodaj nowy moduł do MODULE_REGISTRY → pojawia się w sidebar automatycznie
# Test: użytkownik z role 'employee' nie widzi linków wymagających 'payroll:manage'
# Test: kolejność sidebar = kolejność enabledModules w APP_CONFIG
```

## Acceptance criteria

- [ ] `lib/modules/nav-helpers.ts` — buildNavItems() + filterByPermissions()
- [ ] `sidebar.tsx` — navItems prop, dynamiczny render z Lucide icons
- [ ] `layout.tsx` — przekazuje navItems po filtracji uprawnień
- [ ] Dodanie modułu do MODULE_REGISTRY = automatycznie pojawia się w nav
- [ ] Pracownik nie widzi linków bez uprawnień
- [ ] `npx tsc --noEmit` → clean
