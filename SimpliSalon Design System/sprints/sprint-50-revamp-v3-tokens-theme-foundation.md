# Sprint SS2.4-50 - Revamp v3 tokens + theme foundation

## Cel

Ustanowic `Revamp v3` jako jedyne zrodlo prawdy dla stylu aplikacji.
Ten sprint nie zmienia ekranow domenowych. Zmienia fundament: tokeny, fonty, kolory, radiusy,
cienie, globalne klasy `theme-*` i usuwa konflikt z obecnym glass/luxe stylem.

Spec: `SimpliSalon Design System/revamp/tokens-v3.css` oraz podstawowe komponenty/layout z `revamp.html`.

Zaleznosc: Sprinty 41-49 zamkniete.

## Architektura - dokumenty referencyjne

```bash
DAD_PROMPT="Read /mnt/d/SimpliSalonCLoud/SimpliSalon Design System/revamp/tokens-v3.css and /mnt/d/SimpliSalonCLoud/SimpliSalon Design System/revamp/revamp.html. Extract ONLY: token values, typography rules, surface/background rules, radius/shadow rules, global app shell visual rules, and styles that conflict with current glass/luxe design. FORMAT: Bulleted list grouped by token category. Include exact CSS variable names and hex values." bash ~/.claude/scripts/dad-exec.sh
```

| Dokument | Dlaczego |
|----------|----------|
| `SimpliSalon Design System/revamp/tokens-v3.css` | canonical Revamp v3 tokens |
| `SimpliSalon Design System/revamp/revamp.html` | global style, shell, cards, buttons, tables |
| `app/globals.css` | current global Tailwind/theme overrides to replace |
| `tailwind.config.ts` | Tailwind colors/radius/font integration |
| `components/layout/theme-provider.tsx` | current theme key entry point |
| `themes/_default/tokens.ts` | existing theme token layer |

## Zdiagnozowane problemy

- [ ] `app/globals.css` ma stare gradienty, glass, duze radiusy i `auto_service` luxe overrides
- [ ] Tailwind `--primary`, `--secondary`, `--accent` nie odpowiadaja Revamp v3
- [ ] Brak globalnych fontow `Cormorant Garamond`, `Manrope`, `Inter` jako jawnych tokenow
- [ ] Cienie i hover states sa zbyt ciezkie wzgledem wzorca
- [ ] Nie ma guardrail, ktory blokuje powrot do warm gradient/glass styling

## Zakres

### A - Token import + Tailwind bridge (codex-main)

Pliki:
- `app/globals.css`
- `tailwind.config.ts`
- `app/layout.tsx`

- [ ] Dodaj CSS variables `--v3-*` z `tokens-v3.css`
- [ ] Zmapuj shadcn/Tailwind variables na Revamp v3:
  - `--background` -> `#F3F5F7`
  - `--foreground` -> `#2C2C2C`
  - `--primary` -> `#32855F`
  - `--secondary` -> `#276FB7`
  - `--accent` -> `#0875E1`
  - `--border` -> `#E8EBED`
  - `--ring` -> `#276FB7`
- [ ] Dodaj fonty przez `next/font/google` albo kontrolowany global import
- [ ] Ustaw body: `Manrope/Inter`, jasne tlo, bez animowanych gradientow

### B - Remove old luxe/glass conflicts (codex-main)

Plik: `app/globals.css`

- [ ] Ogranicz lub usun konflikty: `.glass`, `.glass-dark`, `.gradient-button`, `.card-hover`, `animate-glow`, `hover-luxe-*`
- [ ] `html[data-theme-key='auto_service']` nie moze narzucac kremowych gradientow ani glassmorphism
- [ ] Zachowaj kompatybilnosc nazw klas, ale przepisz je na flat Revamp v3
- [ ] `theme-dashboard-shell`, `theme-dashboard-main`, `theme-sidebar`, `theme-navbar` maja byc plaskie i jasne

### C - Theme token layer alignment (codex-main)

Pliki:
- `themes/_default/tokens.ts`
- `themes/_default/index.ts`
- `lib/themes/types.ts` jesli typy wymagaja rozszerzenia

- [ ] Dostosuj tokeny default theme do Revamp v3
- [ ] Nie tworz nowego systemu theme registry
- [ ] Jesli obecny provider wstrzykuje CSS vars, ustaw je zgodnie z v3

## Dispatch commands

### Pkg A - tokens + Tailwind bridge

```bash
codex exec --dangerously-bypass-approvals-and-sandbox "Read .workflow/skills/scoped-implementation.md and follow it.
Read SimpliSalon Design System/revamp/tokens-v3.css.
Read app/globals.css, tailwind.config.ts, app/layout.tsx.

Goal: Make Revamp v3 tokens the global visual foundation.

Files:
- app/globals.css
- tailwind.config.ts
- app/layout.tsx

Changes:
1. Add Revamp v3 CSS variables from tokens-v3.css to :root.
2. Map existing shadcn/Tailwind HSL variables to Revamp v3 values so existing components inherit the new look.
3. Add Cormorant Garamond, Manrope and Inter through the existing font-loading pattern.
4. Body should use a flat light background (#F3F5F7) and primary text (#2C2C2C).
5. Keep edits scoped to visual foundation only.

Constraints:
- Do NOT change business logic.
- Do NOT add new UI libraries.
- Do NOT remove existing theme class names if pages depend on them.

Done when: npm run typecheck passes." < /dev/null
```

### Pkg B - old style conflict removal

```bash
codex exec --dangerously-bypass-approvals-and-sandbox "Read .workflow/skills/scoped-implementation.md and follow it.
Read app/globals.css.
Read SimpliSalon Design System/revamp/revamp.html style block for global shell/card/button visual rules.

Goal: Replace old glass/luxe global overrides with flat Revamp v3-compatible rules.

File: app/globals.css

Changes:
1. Rewrite .glass, .glass-dark, .gradient-button, .card-hover to match Revamp v3 flat surfaces.
2. Rewrite html[data-theme-key='auto_service'] overrides so they do not use animated warm gradients, heavy blur, big radius, or glow.
3. Preserve class names for compatibility.
4. Use --v3-* variables for colors, radius, borders, shadows.

Constraints:
- Do NOT delete unrelated keyframes unless unused by app code.
- Keep CSS readable and grouped.

Done when: npm run typecheck passes and pwsh ./scripts/check-encoding.ps1 passes." < /dev/null
```

### Pkg C - theme token layer

```bash
codex exec --dangerously-bypass-approvals-and-sandbox "Read .workflow/skills/scoped-implementation.md and follow it.
Read themes/_default/tokens.ts, themes/_default/index.ts, lib/themes/types.ts.
Read SimpliSalon Design System/revamp/tokens-v3.css.

Goal: Align existing theme token registry with Revamp v3.

Files:
- themes/_default/tokens.ts
- themes/_default/index.ts
- lib/themes/types.ts only if required

Changes:
1. Update default token values to Revamp v3 colors, radius, shadows, typography.
2. Keep the existing registry API stable.
3. Do not add a second theme provider.

Done when: npm run typecheck passes." < /dev/null
```

## Work packages

- ID: pkg-50-token-bridge | Type: implementation | Worker: codex-main | Inputs: globals.css, tailwind.config.ts, layout.tsx | Outputs: global v3 token bridge
- ID: pkg-50-conflict-removal | Type: implementation | Worker: codex-main | Inputs: globals.css | Outputs: old luxe/glass overrides rewritten
- ID: pkg-50-theme-registry | Type: implementation | Worker: codex-main | Inputs: themes/_default | Outputs: registry tokens aligned

## Verification

```bash
npm run typecheck
pwsh ./scripts/check-encoding.ps1
rg -n "gradient-to|backdrop-blur|rounded-3xl|shadow-2xl|animate-glow|luxe-bg" app components themes
```

## Acceptance criteria

- [ ] `--v3-*` tokens sa dostepne globalnie
- [ ] Tailwind/shadcn variables dziedzicza Revamp v3
- [ ] Body i dashboard shell maja plaskie jasne tlo, bez animowanych gradientow
- [ ] Glass/luxe klasy nie generuja starego wizualu
- [ ] Fonty display/UI/body odpowiadaja wzorcom
- [ ] `npm run typecheck` -> clean
- [ ] `pwsh ./scripts/check-encoding.ps1` -> clean
