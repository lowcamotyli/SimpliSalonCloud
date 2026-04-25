# Sprint AF-15 — Data Gathering Workbook — Steps 1–3

> **⚡ Dispatch równolegle z:** [AF-14](AF-14-usecomponents-migration.md)
> AF-15 (wizard `app/setup/`) i AF-14 (migracja UI w `modules/`) dotyczą osobnych części kodu.

## Cel
(P1) Wizard UI Steps 1–3: wybór profilu biznesowego, selekcja modułów
z rozwiązywaniem zależności, konfiguracja każdego modułu (Zod-driven formularze).

## Architektura — dokumenty referencyjne

```bash
DAD_PROMPT="Read /mnt/d/SimpliSalonCLoud/docs/AppForge/WIZARD.md and /mnt/d/SimpliSalonCLoud/docs/AppForge/APP-CONFIG.md. List: (1) wizard flow steps 1-3, (2) module pre-selection per business profile, (3) AppConfig.moduleConfigs structure, (4) validation rules (Zod schema from each module). FORMAT: Bulleted list." bash ~/.claude/scripts/dad-exec.sh
```

| Dokument | Dlaczego |
|----------|----------|
| `docs/AppForge/WIZARD.md` | Flow steps 1-3, UI requirements, output format |
| `docs/AppForge/APP-CONFIG.md` | AppConfig kontrakt, moduleConfigs structure |
| `docs/AppForge/MODULE-SYSTEM.md` | resolveWithDependencies(), detectConflicts(), manifest.configSchema |

**Kluczowe constraints:**
- Wizard route: `app/setup/` — osobna layout (bez dashboard sidebar/nav)
- Krok 2: `resolveWithDependencies()` auto-dodaje requires[], grayed-out + checked
- Krok 3: formularz per moduł renderowany z Zod schema (dynamiczny — nie hardcoded fields)
- State wizarda: React useState na stronie parent, przekazywane przez props
- Brak zapisu do DB w krokach 1-3 — tylko stan lokalny → zapis w kroku 5 (AF-16)
- Wizard jest dostępny bez auth (setup nowej aplikacji) ORAZ dla authed owner (reconfiguracja)

## Zakres

| Plik | Worker | Zawartość |
|------|--------|-----------|
| `app/setup/page.tsx` | codex-main | WizardContainer, step state machine |
| `app/setup/layout.tsx` | codex-main | Minimalna layout (logo + progress bar) |
| `app/setup/_steps/BusinessProfile.tsx` | codex-main | Step 1 UI |
| `app/setup/_steps/ModuleSelection.tsx` | codex-dad | Step 2 UI (dependency resolution) |
| `app/setup/_steps/ModuleConfiguration.tsx` | codex-dad | Step 3 UI (Zod-driven forms) |
| `app/setup/_lib/wizard-state.ts` | codex-main | WizardState type + helpers |
| `app/setup/_lib/module-resolver.ts` | codex-main | Profile → modules, dependency graph |

## Work packages

- ID: pkg-wizard-core | Type: implementation | Worker: codex-main
  Outputs: page.tsx, layout.tsx, BusinessProfile.tsx, wizard-state.ts, module-resolver.ts

- ID: pkg-wizard-modules | Type: implementation | Worker: codex-dad
  Outputs: ModuleSelection.tsx, ModuleConfiguration.tsx

## Prompt — codex-main (wizard core + Step 1)

```bash
codex exec --dangerously-bypass-approvals-and-sandbox "Read .workflow/skills/scoped-implementation.md and follow it.
Read docs/AppForge/WIZARD.md for wizard flow.
Read docs/AppForge/APP-CONFIG.md for AppConfig structure.
Read lib/modules/registry.ts for MODULE_REGISTRY and resolveWithDependencies.
Read lib/modules/types.ts for ModuleManifest and BusinessProfile types.
Do NOT use Gemini — write directly.

Goal: Create wizard container, state management, and Step 1.

File 1: app/setup/_lib/wizard-state.ts
- Export WizardState interface:
  { step: 1|2|3|4|5; businessProfile: BusinessProfile | null;
    selectedModules: string[]; moduleConfigs: Record<string, unknown>;
    themeId: string; branding: { name: string; logoUrl: string; primaryColor: string }; }
- Export initialWizardState: WizardState
- Export wizardStateReducer(state, action) with actions: SET_PROFILE, SET_MODULES, SET_CONFIG, SET_THEME, SET_STEP

File 2: app/setup/_lib/module-resolver.ts
- Import MODULE_REGISTRY, resolveWithDependencies, detectConflicts from lib/modules
- Export PROFILE_DEFAULT_MODULES: Record<BusinessProfile, string[]>
  beauty_salon: ['calendar','employees','crm','notifications','forms','surveys']
  gym: ['calendar','employees','absence','time-tracking','crm']
  medical: ['calendar','employees','forms','notifications']
  workshop: ['calendar','employees','crm','forms']
  agency: ['employees','absence','time-tracking','payroll','crm']
  custom: []
- Export getModulesForProfile(profile: BusinessProfile): string[]
- Export resolveModulesWithDeps(selectedIds: string[]): { resolved: string[]; autoAdded: string[] }
- Export getAvailableModules(): ModuleManifest[] (from MODULE_REGISTRY, exclude _core)

File 3: app/setup/layout.tsx
- Minimal layout: white background, centered max-w-3xl, logo top-left, progress bar (step/5)
- No sidebar, no dashboard navigation
- Accept: children, step: number prop

File 4: app/setup/page.tsx ('use client')
- WizardContainer with useReducer(wizardStateReducer, initialWizardState)
- Render current step component based on state.step
- Pass state + dispatch to each step
- Steps: 1=BusinessProfile, 2=ModuleSelection, 3=ModuleConfiguration, 4=ThemeSelection (AF-16), 5=Generate (AF-16)

File 5: app/setup/_steps/BusinessProfile.tsx ('use client')
- Props: state: WizardState, dispatch: Dispatch
- Show 6 business profile cards (icon + name + description)
- On click: dispatch SET_PROFILE + SET_MODULES with profile defaults + resolve dependencies
- Selected card highlighted
- 'Dalej' button → dispatch SET_STEP(2)
- Profiles: beauty_salon (Scissors), gym (Dumbbell), medical (Stethoscope), workshop (Wrench), agency (Building), custom (Settings2)
- Use direct imports from @/components/ui/* (app/ files are exempt from useComponents rule)

Constraints: wizard state uses useReducer (not useState) for complex state updates.
Done when: tsc passes."
```

## Prompt — codex-dad (Steps 2 + 3)

```bash
DAD_PROMPT="Read .workflow/skills/scoped-implementation.md and follow it.
Read /mnt/d/SimpliSalonCLoud/docs/AppForge/WIZARD.md for steps 2 and 3 requirements.
Read /mnt/d/SimpliSalonCLoud/lib/modules/registry.ts and /mnt/d/SimpliSalonCLoud/lib/modules/types.ts.
Read /mnt/d/SimpliSalonCLoud/app/setup/_lib/module-resolver.ts for resolveModulesWithDeps.

Goal: Create wizard Steps 2 (Module Selection) and 3 (Module Configuration).

File 1: /mnt/d/SimpliSalonCLoud/app/setup/_steps/ModuleSelection.tsx ('use client')
- Props: state: WizardState, dispatch: Dispatch
- Shows all available modules from getAvailableModules()
- Each module: checkbox + icon + name + description + category badge + 'wymaga: X' if has requires[]
- Auto-checked and grayed-out modules added by resolveModulesWithDeps() (auto-added deps)
- Conflict detection: detectConflicts() → show warning badge on conflicting pairs
- 'Zaznacz wszystkie' / 'Odznacz wszystkie' buttons
- On checkbox change: dispatch SET_MODULES with resolveModulesWithDeps result
- 'Wstecz' → step 1, 'Dalej' → step 3

File 2: /mnt/d/SimpliSalonCLoud/app/setup/_steps/ModuleConfiguration.tsx ('use client')
- Props: state: WizardState, dispatch: Dispatch
- For each selected module (from state.selectedModules):
  Show accordion panel with module name
  Inside: render config form from module's configSchema
  Dynamic field rendering from Zod schema shape:
    z.string() → Input
    z.number() → Input[type=number]
    z.boolean() → Switch with label
    z.enum() → Select with options
    z.array(z.string()) → tag input (comma-separated Input)
    z.array(z.object()) → simple list with add/remove
  Show defaults from manifest.defaultConfig as initial values
  On change: dispatch SET_CONFIG for that module
- 'Wstecz' → step 2, 'Dalej' → step 4

Constraints:
- configSchema comes from: import(module manifest).configSchema._def.shape (Zod introspection)
- If configSchema is empty → show 'Ten moduł nie wymaga konfiguracji'
- Use direct @/components/ui/* (app/setup/ is exempt from useComponents rule)
Done when: tsc passes." bash ~/.claude/scripts/dad-exec.sh
```

## Verification

```bash
npx tsc --noEmit
# Test: /setup → Step 1 wyświetla 6 kart profili
# Test: wybór 'beauty_salon' → Step 2 z pre-selected modułami
# Test: odznaczenie 'employees' gdy 'absence' zaznaczone → auto-odznacza 'absence' (dependency)
# Test: Step 3 → accordion per moduł z dynamicznym formularzem
```

## Acceptance criteria

- [ ] `/setup` dostępna bez auth
- [ ] Step 1: 6 profili, klik → pre-selekcja modułów
- [ ] Step 2: dependency auto-check, conflict warnings, resolved deps grayed
- [ ] Step 3: dynamiczny formularz z Zod schema per moduł
- [ ] WizardState persystuje przez kroki (useReducer)
- [ ] `npx tsc --noEmit` → clean
