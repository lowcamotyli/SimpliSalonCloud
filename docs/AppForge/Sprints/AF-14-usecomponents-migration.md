# Sprint AF-14 — Migracja istniejących modułów → useComponents()

> **⚡ Dispatch równolegle z:** [AF-15](AF-15-wizard-steps-1-3.md)
> AF-14 (audit i migracja UI) i AF-15 (wizard) dotyczą osobnych części kodu — brak zależności.

## Cel
(P2) Usunięcie hardcoded importów z `@/components/ui/*` z komponentów domenowych
(calendar, CRM, forms). Zastąpienie przez `useComponents()`. Nie zmienia logiki —
tylko zamienia źródło komponentów UI.

## Architektura — dokumenty referencyjne

```bash
DAD_PROMPT="Read /mnt/d/SimpliSalonCLoud/docs/AppForge/THEME-SYSTEM.md. List: (1) the exact useComponents() rule (which directories), (2) which files are EXEMPT from this rule (app/, components/layout/), (3) how to handle components not in ComponentRegistry. FORMAT: Bulleted list." bash ~/.claude/scripts/dad-exec.sh
```

| Dokument | Dlaczego |
|----------|----------|
| `docs/AppForge/THEME-SYSTEM.md` | Reguła useComponents(), lista exempt files |

**Kluczowe constraints:**
- Migracja TYLKO w `modules/*/components/` — NIE w `app/`, `components/layout/`, `components/ui/`
- Komponenty niewystępujące w ComponentRegistry → pozostaw jako bezpośredni import (np. Calendar widget)
- Zmiana jest mechaniczna — nie zmienia logiki, nie dodaje features
- Jeśli komponent używa `cn()` — zachowaj, tylko podmień źródło komponentu
- Scope: components/calendar/, components/crm/ — te są w `components/`, ale pliki specyficzne dla modułu mogą wymagać migracji po przeniesieniu do `modules/`

## Scope audyt (przed dispatchem)

```bash
# Znajdź wszystkie pliki w modules/ z importami z @/components/ui
grep -r "from '@/components/ui" modules/ --include="*.tsx" --include="*.ts" -l
# Znajdź w components/calendar/ i components/crm/ (potencjalne przyszłe modules/)
grep -r "from '@/components/ui" components/calendar/ components/crm/ --include="*.tsx" -l
```

**Strategia**: Nie przenosimy plików — tylko zapewniamy, że NOWE pliki w `modules/*/components/`
(stworzone w AF-09, AF-10, AF-12) już używają useComponents(). Ten sprint audytuje i naprawia.

## Work packages

- ID: pkg-audit | Type: review | Worker: codex-dad (ephemeral)
  Output: raport plików naruszających regułę

- ID: pkg-fix | Type: implementation | Worker: codex-dad
  Inputs: pkg-audit raport
  Output: poprawione pliki

## Prompt — codex-dad (audit — ephemeral)

```bash
wsl -d worker-dad -e bash -c '
  /usr/local/bin/codex --dangerously-bypass-approvals-and-sandbox \
    --ephemeral \
    -C /mnt/d/SimpliSalonCLoud \
    --output-last-message /tmp/theme-audit-report.txt \
    exec "Read .workflow/skills/targeted-file-read.md and follow it.
Audit: find all .tsx files in modules/ directory that import from @/components/ui/*.
For each file: list the file path + which components are imported from @/components/ui.
Check if those components exist in ComponentRegistry (from docs/AppForge/THEME-SYSTEM.md).
Output: bulleted list — file | @/components/ui imports | in ComponentRegistry? (yes/no).
Do not fix anything."
  cat /tmp/theme-audit-report.txt
'
```

## Prompt — codex-dad (fix po audycie)

```bash
# Po przeczytaniu raportu z audytu:
DAD_PROMPT="Read .workflow/skills/scoped-implementation.md and follow it.
Read /mnt/d/SimpliSalonCLoud/docs/AppForge/THEME-SYSTEM.md for useComponents() pattern.
Read /mnt/d/SimpliSalonCLoud/lib/themes/types.ts for ComponentRegistry.

Goal: Migrate files in modules/ that import from @/components/ui/* to use useComponents().

For each file identified in audit:
1. Add import: import { useComponents } from '@/lib/themes'
2. Add at top of component: const { Button, Card, ... } = useComponents()
3. Replace: import { Button } from '@/components/ui/button' with destructured useComponents()
4. Keep any @/components/ui imports for components NOT in ComponentRegistry

Files to fix: [LISTA Z AUDYTU]

Constraints:
- Do NOT change any logic, only the import source
- Do NOT migrate files in app/ or components/layout/ or components/ui/
- If file is a Server Component, it cannot use useComponents() — skip it (log as manual fix needed)
Done when: tsc passes for all modified files." bash ~/.claude/scripts/dad-exec.sh
```

## Verification

```bash
npx tsc --noEmit
# Sprawdź: brak @/components/ui/* importów w modules/*/components/
grep -r "from '@/components/ui" modules/ --include="*.tsx" --include="*.ts"
# Oczekiwany output: empty (lub tylko Server Components z notatką)
```

## Acceptance criteria

- [ ] Audit raport: lista plików z naruszeniami
- [ ] Po fix: `grep -r "from '@/components/ui" modules/` → empty lub tylko Server Components
- [ ] Logika komponentów niezmieniona
- [ ] `npx tsc --noEmit` → clean
