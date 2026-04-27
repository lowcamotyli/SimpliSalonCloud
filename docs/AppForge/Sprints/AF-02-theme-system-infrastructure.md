# Sprint AF-02 — Theme System Infrastructure

> **⚡ Dispatch równolegle z:** [AF-01](AF-01-module-system-infrastructure.md)
> Oba są sprintami startowymi bez żadnych zależności — uruchom jednocześnie.

## Cel
(P0) Zbudowanie warstwy theme: interfejs ComponentRegistry, ThemeProvider (React Context)
i implementacja `_default` (wrappery shadcn/ui). Po tym sprincie wszystkie moduły
mogą używać `useComponents()` zamiast bezpośrednich importów z shadcn.

## Architektura — dokumenty referencyjne

```bash
DAD_PROMPT="Read /mnt/d/SimpliSalonCLoud/docs/AppForge/THEME-SYSTEM.md. List ALL components in ComponentRegistry, all DesignTokens fields, and the exact useComponents() rule. FORMAT: Bulleted list. Do NOT summarize away any component." bash ~/.claude/scripts/dad-exec.sh
```

| Dokument | Dlaczego |
|----------|----------|
| `docs/AppForge/THEME-SYSTEM.md` | ComponentRegistry interface, DesignTokens, useComponents() pattern |
| `docs/AppForge/APP-CONFIG.md` | themeId w AppConfig — jak theme jest wybierany |

**Kluczowe constraints:**
- `themes/_default/` wrappuje istniejące shadcn/ui — NIE podmienia, NIE usuwa
- `useComponents()` hook — TYLKO w client components (`'use client'`)
- ThemeProvider musi być async-server-safe (ładuje theme w Server Component, przekazuje do Client Context)
- Props muszą mieć `className?: string` na każdym komponencie (umożliwia overrides)
- Typy props w `lib/themes/types.ts` — definicja kontraktu (niezależna od implementacji)

## Zakres

### Pliki do stworzenia

| Plik | Worker | Zawartość |
|------|--------|-----------|
| `lib/themes/types.ts` | codex-main | ComponentRegistry interface + wszystkie Props types + DesignTokens |
| `lib/themes/provider.tsx` | codex-main | ThemeProvider (server), ComponentRegistryContext (client), useComponents() |
| `lib/themes/registry.ts` | codex-main | loadTheme(), rejestr dostępnych themes |
| `themes/_default/tokens.ts` | codex-dad | DesignTokens dla shadcn/ui default (slate/zinc palette) |
| `themes/_default/components/` | codex-dad | Wrapper TSX per komponent (Button, Card, Input, ...) |
| `themes/_default/index.ts` | codex-dad | Eksport { registry: ComponentRegistry, tokens: DesignTokens } |

## Work packages

- ID: pkg-theme-types | Type: implementation | Worker: codex-main
  Inputs: docs/AppForge/THEME-SYSTEM.md
  Outputs: lib/themes/types.ts, lib/themes/provider.tsx, lib/themes/registry.ts

- ID: pkg-default-theme | Type: implementation | Worker: codex-dad
  Inputs: docs/AppForge/THEME-SYSTEM.md, istniejące komponenty w components/ui/
  Outputs: themes/_default/ (tokens + components + index)

Kolejność: oba równolegle (pkg-theme-types nie zależy od pkg-default-theme).

## Prompt — codex-main (types + provider)

```bash
codex exec --dangerously-bypass-approvals-and-sandbox "Read .workflow/skills/scoped-implementation.md and follow it.
Read docs/AppForge/THEME-SYSTEM.md for the full ComponentRegistry interface and DesignTokens. Do NOT use Gemini — write directly.

Goal: Create the theme system foundation — types, context provider, and theme loader.

Files to create:

1. lib/themes/types.ts
   Export all Props interfaces: ButtonProps, CardProps, InputProps, SelectProps,
   TextareaProps, CheckboxProps, SwitchProps, DatePickerProps, DateRangePickerProps,
   TimePickerProps, FormFieldProps, FormLabelProps, FormMessageProps, BadgeProps,
   AlertProps, DataTableProps<TData>, AvatarProps, EmptyStateProps, StatCardProps,
   FileUploadProps, ModalProps, SheetProps, ConfirmDialogProps, SkeletonProps,
   SpinnerProps, PageHeaderProps, SectionProps, TabsProps, TabsTriggerProps,
   TabsContentProps, IconButtonProps, DropdownMenuProps, TooltipProps,
   BreadcrumbProps, SidebarProps, CardHeaderProps.
   Export ComponentRegistry interface (all components — see THEME-SYSTEM.md).
   Export ColorScale type = Record<50|100|200|300|400|500|600|700|800|900|950, string>.
   Export DesignTokens interface (see THEME-SYSTEM.md).
   Export ToastAPI interface { success(msg: string): void; error(msg: string): void; info(msg: string): void }.

2. lib/themes/provider.tsx
   Client component: ComponentRegistryContext (React.createContext with _default registry as fallback).
   Export useComponents(): ComponentRegistry hook.
   Server component: ThemeProvider({ tokens, registry, children }) — injects CSS variables + provides registry.
   generateCSSVariables(tokens: DesignTokens): string — converts token object to CSS custom properties.

3. lib/themes/registry.ts
   Import AppConfig from lib/config/types.
   Export loadTheme(themeId: string): Promise<{ registry: ComponentRegistry; tokens: DesignTokens }>.
   Implement: dynamic import switch — 'simplisalon' | '_default' (fallback to _default if unknown).
   All theme packages export { registry, tokens } from their index.ts.

Constraints:
- lib/themes/provider.tsx must have 'use client' on the context part only
- Use React.createContext with proper typing — no 'as any'
- ThemeProvider wraps both: style injection + context provider
Done when: tsc passes for all 3 files."
```

## Prompt — codex-dad (_default theme)

```bash
DAD_PROMPT="Read .workflow/skills/scoped-implementation.md and follow it.
Read /mnt/d/SimpliSalonCLoud/docs/AppForge/THEME-SYSTEM.md for ComponentRegistry interface and component list.
Read /mnt/d/SimpliSalonCLoud/lib/themes/types.ts for the exact Props types to use.

Goal: Create _default theme — wrappers for existing shadcn/ui components.

Directory: /mnt/d/SimpliSalonCLoud/themes/_default/

Files to create:

1. themes/_default/tokens.ts
   DesignTokens object using shadcn/ui defaults:
   - colors.primary: slate scale (50-950)
   - colors.neutral: zinc scale
   - colors.destructive: red scale
   - colors.success: green scale
   - colors.warning: yellow scale
   - background: '#ffffff', surface: '#f8fafc', border: '#e2e8f0', foreground: '#0f172a'
   - typography: fontFamily.sans = 'var(--font-sans)', fontFamily.mono = 'var(--font-mono)'
   - borderRadius: sm='0.25rem', md='0.375rem', lg='0.5rem', xl='0.75rem', full='9999px'

2. themes/_default/components/Button.tsx — wraps @/components/ui/button
3. themes/_default/components/Card.tsx — wraps @/components/ui/card (variant prop → className)
4. themes/_default/components/Input.tsx — wraps @/components/ui/input
5. themes/_default/components/Select.tsx — wraps @/components/ui/select
6. themes/_default/components/Badge.tsx — wraps @/components/ui/badge
7. themes/_default/components/Modal.tsx — wraps @/components/ui/dialog
8. themes/_default/components/Sheet.tsx — wraps @/components/ui/sheet
9. themes/_default/components/Tabs.tsx, TabsList.tsx, TabsTrigger.tsx, TabsContent.tsx
10. themes/_default/components/Skeleton.tsx — wraps @/components/ui/skeleton
11. themes/_default/components/Avatar.tsx — wraps @/components/ui/avatar
12. themes/_default/components/DataTable.tsx — generic wrapper (uses TanStack Table if available, or simple table)
13. themes/_default/components/EmptyState.tsx — new component (icon + title + description + optional action)
14. themes/_default/components/Spinner.tsx — simple CSS spinner or Lucide Loader2

3. themes/_default/index.ts
   Import all components. Import tokens from ./tokens.
   Export: const registry: ComponentRegistry = { Button, Card, Input, ... }
   Export: { registry, tokens }

Constraints:
- Each wrapper must accept AND propagate className?: string
- Use 'use client' only where component uses hooks/events
- Do NOT import from @/modules/* — only from @/components/ui/*
- DataTable: minimal implementation (map data to <table> rows) — full TanStack later
Done when: themes/_default/index.ts exports { registry, tokens } with all required fields." bash ~/.claude/scripts/dad-exec.sh
```

## Verification

```bash
npx tsc --noEmit
# Sprawdź: import { useComponents } from '@/lib/themes' działa
# Sprawdź: themes/_default/index.ts eksportuje registry ze wszystkimi polami ComponentRegistry
# Sprawdź: ThemeProvider opakowuje children bez błędów SSR
```

## Acceptance criteria

- [ ] `lib/themes/types.ts` — ComponentRegistry z 35+ komponentami + DesignTokens
- [ ] `lib/themes/provider.tsx` — useComponents() hook + ThemeProvider
- [ ] `lib/themes/registry.ts` — loadTheme('_default') zwraca { registry, tokens }
- [ ] `themes/_default/` — implementacja wszystkich komponentów z ComponentRegistry
- [ ] `themes/_default/index.ts` — eksportuje { registry, tokens }
- [ ] `npx tsc --noEmit` → clean
