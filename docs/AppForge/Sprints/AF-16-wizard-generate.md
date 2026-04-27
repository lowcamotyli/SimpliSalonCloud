# Sprint AF-16 — Wizard Steps 4–5 + Generowanie app-config

## Cel
(P1) Wizard Steps 4-5: wybór theme + brandingu, podsumowanie i generowanie.
Output: zapisanie `app-config.ts` + uruchomienie wybranych migracji DB.

## Architektura — dokumenty referencyjne

```bash
DAD_PROMPT="Read /mnt/d/SimpliSalonCLoud/docs/AppForge/WIZARD.md and /mnt/d/SimpliSalonCLoud/docs/AppForge/APP-CONFIG.md. List: (1) wizard steps 4 and 5 requirements, (2) full AppConfig example to generate, (3) migration manifest format, (4) seed data approach. FORMAT: Bulleted list." bash ~/.claude/scripts/dad-exec.sh
```

| Dokument | Dlaczego |
|----------|----------|
| `docs/AppForge/WIZARD.md` | Steps 4-5 requirements, output artefacts |
| `docs/AppForge/APP-CONFIG.md` | AppConfig interface + pełny przykład do wygenerowania |

**Kluczowe constraints:**
- `app-config.ts` generowany jako plik tekstowy (file write przez Server Action lub API route)
- Migracje SQL: uruchamiane przez `supabase db push` — wizard uruchamia je przez shell exec lub wypisuje instrukcje
- W środowisku produkcyjnym: wizard NIE uruchamia `supabase db push` bezpośrednio — generuje SQL plik do ręcznego pushowania
- Theme selection: tylko zainstalowane themes (sprawdź `themes/` directory)
- Branding: nazwa + logo (URL lub placeholder) + primary color
- Krok 5 (Generate): zawiera progress steps z ✓/✗ per akcja

## Zakres

| Plik | Worker | Zawartość |
|------|--------|-----------|
| `app/setup/_steps/ThemeSelection.tsx` | codex-main | Step 4 UI |
| `app/setup/_steps/GenerateApp.tsx` | codex-main | Step 5 UI (progress + result) |
| `app/setup/_actions/generate-config.ts` | codex-dad | Server Action: generuje app-config.ts |
| `app/setup/_actions/build-migration.ts` | codex-dad | Server Action: zbiera SQL z modułów |
| `app/setup/_lib/config-generator.ts` | codex-main | buildAppConfig(state) → AppConfig string |

## Work packages

- ID: pkg-steps-4-5 | Type: implementation | Worker: codex-main
  Outputs: ThemeSelection.tsx, GenerateApp.tsx, config-generator.ts

- ID: pkg-actions | Type: implementation | Worker: codex-dad
  Outputs: generate-config.ts, build-migration.ts

Oba równolegle.

## Prompt — codex-main (Steps 4-5 + config generator)

```bash
codex exec --dangerously-bypass-approvals-and-sandbox "Read .workflow/skills/scoped-implementation.md and follow it.
Read docs/AppForge/APP-CONFIG.md for AppConfig interface and full example.
Read docs/AppForge/WIZARD.md for steps 4 and 5 requirements.
Read app/setup/_lib/wizard-state.ts for WizardState type.
Do NOT use Gemini — write directly.

Goal: Create wizard Steps 4-5 and config generator.

File 1: app/setup/_lib/config-generator.ts
- Import AppConfig from lib/config/types
- Export buildAppConfig(state: WizardState, appId: string): AppConfig
  Map state fields to AppConfig structure
- Export buildAppConfigFileContent(config: AppConfig): string
  Returns TypeScript source code string for app-config.ts
  Format: 'import { type AppConfig } from \"@/lib/config/types\"\n\nexport const APP_CONFIG: AppConfig = ' + JSON.stringify(config, null, 2)

File 2: app/setup/_steps/ThemeSelection.tsx ('use client')
- Props: state: WizardState, dispatch: Dispatch
- Show available themes as cards with visual preview (colored circle + name):
  _default: gray/neutral, simplisalon: rose/coral, gymease: blue/dark (add more as implemented)
- Branding section:
  Input: App Name (required)
  Input: App URL (optional)
  ColorPicker: Primary Color (input[type=color] + hex input)
  Input: Logo URL (optional, placeholder for now)
- On theme select: dispatch SET_THEME
- On branding change: dispatch SET_BRANDING (add to WizardState if missing)
- 'Wstecz' → step 3, 'Dalej' → step 5

File 3: app/setup/_steps/GenerateApp.tsx ('use client')
- Props: state: WizardState, dispatch: Dispatch
- Summary section:
  Show: app name, business profile, selected modules count, theme
  Module list with icons
- Progress steps (shown during generation):
  ✓ Generating app-config.ts
  ✓ Building migration SQL
  ✓ Ready to deploy
- 'Generuj aplikację' button → calls Server Actions:
  1. generateConfig(state) → saves app-config.ts
  2. buildMigration(state.selectedModules) → returns SQL file path
- After success: show download button for migration SQL + next steps instructions
  Next steps: 1. supabase db push, 2. supabase gen types, 3. vercel deploy
- Error handling: show error message per failed step

Constraints: GenerateApp uses async Server Actions — show loading state during execution.
Done when: tsc passes."
```

## Prompt — codex-dad (Server Actions)

```bash
DAD_PROMPT="Read .workflow/skills/safe-sensitive-change.md and follow it.
Read /mnt/d/SimpliSalonCLoud/docs/AppForge/APP-CONFIG.md for AppConfig structure.
Read /mnt/d/SimpliSalonCLoud/app/setup/_lib/wizard-state.ts for WizardState.
Read /mnt/d/SimpliSalonCLoud/app/setup/_lib/config-generator.ts for buildAppConfigFileContent.

Goal: Create Server Actions for wizard generation step.

File 1: /mnt/d/SimpliSalonCLoud/app/setup/_actions/generate-config.ts
- 'use server'
- Import buildAppConfigFileContent, buildAppConfig from ../lib/config-generator
- Export async generateConfig(state: WizardState, appId: string): Promise<{ success: boolean; error?: string }>
  1. Build AppConfig from state
  2. Build file content string
  3. Write to process.cwd() + '/app-config.ts' using fs.writeFileSync
  4. Return { success: true } or { success: false, error: e.message }
  Security: only allow in development/setup mode (check process.env.ALLOW_CONFIG_WRITE === 'true')
  In production: return { success: false, error: 'Config generation only available in setup mode' }

File 2: /mnt/d/SimpliSalonCLoud/app/setup/_actions/build-migration.ts
- 'use server'
- Import path from 'path', fs from 'fs'
- Export async buildMigrationSQL(moduleIds: string[]): Promise<{ sql: string; filename: string }>
  1. For each moduleId: read files from modules/[id]/db/migrations/ (if directory exists)
     Use fs.readdirSync + fs.readFileSync
  2. Concatenate all SQL with -- Module: [id] comments between sections
  3. Generate filename: [timestamp]_appforge_init.sql
  4. Return { sql: concatenated string, filename }
  Note: returns SQL string — caller saves it or prompts download

Constraints:
- generateConfig: NEVER overwrite if file exists AND process.env.ALLOW_CONFIG_WRITE !== 'true'
- buildMigrationSQL: read-only — never executes SQL, only builds the string
- Both actions: no auth required (wizard is pre-auth setup)
Done when: tsc passes." bash ~/.claude/scripts/dad-exec.sh
```

## Verification

```bash
npx tsc --noEmit
# Test: pełny wizard flow steps 1-5 bez błędów TS
# Test: generateConfig() z ALLOW_CONFIG_WRITE=true → generuje app-config.ts
# Test: buildMigrationSQL(['calendar','employees']) → zwraca połączony SQL
# Test: bez ALLOW_CONFIG_WRITE → error message w UI
```

## Acceptance criteria

- [ ] Step 4: wybór theme + branding (name, color, logo URL)
- [ ] Step 5: podsumowanie + progress + generowanie
- [ ] `generateConfig()` Server Action: zapisuje `app-config.ts` (z env guard)
- [ ] `buildMigrationSQL()` Server Action: zwraca połączony SQL z wybranych modułów
- [ ] Po generowaniu: next steps instrukcje (supabase db push, gen types, deploy)
- [ ] Pełny flow 5 kroków bez reload strony
- [ ] `npx tsc --noEmit` → clean

## Done when (AppForge Platform — wszystkie sprinty)

```
[ ] AF-01: Module System Infrastructure
[ ] AF-02: Theme System Infrastructure
[ ] AF-03: workspace_modules + gating middleware
[ ] AF-04: Calendar manifest + public API
[ ] AF-05: Employees + CRM manifests
[ ] AF-06: Absence + Payroll manifests
[ ] AF-07: Dynamic navigation
[ ] AF-08: HCM DB migration
[ ] AF-09: HCM API
[ ] AF-10: HCM UI
[ ] AF-11: Time Tracking DB + API
[ ] AF-12: Time Tracking UI
[ ] AF-13: _default theme implementation
[ ] AF-14: useComponents() migration
[ ] AF-15: Wizard Steps 1-3
[ ] AF-16: Wizard Steps 4-5 + Generate

Platforma gotowa do pierwszego fork → nowa aplikacja.
```
