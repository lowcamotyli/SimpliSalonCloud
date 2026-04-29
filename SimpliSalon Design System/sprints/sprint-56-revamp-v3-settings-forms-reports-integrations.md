# Sprint SS2.4-56 - Revamp v3 settings, forms, reports + integrations

## Cel

Dopasowac ekrany drugiego poziomu: settings, forms, reports, Booksy/integrations, billing oraz publiczne formularze.
Te widoki maja byc funkcjonalnie bez zmian, ale wizualnie musza korzystac z tego samego v3 systemu.

Zaleznosc: Sprinty 50-55 zamkniete.

## Architektura - dokumenty referencyjne

```bash
DAD_PROMPT="Read /mnt/d/SimpliSalonCLoud/SimpliSalon Design System/revamp/revamp.html. Extract specs for dense settings forms, tabs, cards, tables, alerts/toasts, modals, section headers, input states and empty/loading states. FORMAT: concise bullet list by pattern." bash ~/.claude/scripts/dad-exec.sh
```

| Dokument | Dlaczego |
|----------|----------|
| `SimpliSalon Design System/revamp/revamp.html` | forms/settings/table/modal patterns |
| `app/(dashboard)/[slug]/settings/**` | settings screens |
| `components/settings/**` | settings components |
| `app/(dashboard)/[slug]/forms/**` | forms screens |
| `components/forms/**` | form dialogs/previews |
| `app/(dashboard)/[slug]/reports/**` | reports screens |
| `components/dashboard/*chart*.tsx` | chart wrappers |
| `app/(dashboard)/[slug]/booksy/page.tsx` | Booksy page |
| `components/integrations/booksy/**` | Booksy widgets |
| `app/(dashboard)/[slug]/billing/**` | billing screens |
| `app/forms/**`, `app/survey/**` | public form/survey pages |

## Zdiagnozowane problemy

- [ ] Settings maja wiele lokalnych kart/formularzy z rozbieznym stylem
- [ ] Reports/chart wrappers moga miec stare gradienty lub card shadows
- [ ] Booksy/integrations potrzebuja v3 table/card consistency
- [ ] Public forms/surveys powinny byc jasne i zgodne z marka bez dashboard shell
- [ ] Billing/payment UI jest sensitive: visual only, bez logiki platnosci

## Zakres

### A - Settings visual pass (codex-dad)

Pliki:
- `app/(dashboard)/[slug]/settings/**`
- `components/settings/**`

- [ ] Settings nav/tabs/cards/forms zgodne z v3
- [ ] Inputs/selects/buttons dziedzicza primitives
- [ ] Warnings/alerts/status badges v3
- [ ] No settings API/business changes

### B - Forms + public surfaces (codex-dad)

Pliki:
- `app/(dashboard)/[slug]/forms/**`
- `components/forms/**`
- `app/forms/pre/[token]/page.tsx`
- `app/forms/fill/[token]/page.tsx`
- `app/survey/[token]/page.tsx`

- [ ] Dashboard forms: v3 cards/tables/dialogs
- [ ] Public forms/survey: v3 typography/colors without dashboard sidebar
- [ ] Polish text encoding check after edits
- [ ] No submit/API changes

### C - Reports + integrations + billing (codex-dad)

Pliki:
- `app/(dashboard)/[slug]/reports/**`
- `app/(dashboard)/[slug]/booksy/page.tsx`
- `components/integrations/booksy/**`
- `app/(dashboard)/[slug]/billing/**`
- `components/billing/**`

- [ ] Reports: chart cards flat, headings/actions/tables v3
- [ ] Booksy widgets: tables/cards/statuses v3
- [ ] Billing: cards/buttons/banners v3, no logic changes
- [ ] Dunning banner: error/warning style v3, no payment behavior changes

## Dispatch commands

### Pkg A - settings

```bash
DAD_PROMPT="Read .workflow/skills/scoped-implementation.md and follow it.
Read /mnt/d/SimpliSalonCLoud/app/(dashboard)/[slug]/settings pages and imported /mnt/d/SimpliSalonCLoud/components/settings components.
Read /mnt/d/SimpliSalonCLoud/SimpliSalon Design System/revamp/revamp.html form/card/tabs/settings patterns.

Goal: Align settings screens and settings components with Revamp v3.

Constraints:
- Do NOT change settings API calls, persistence, feature flags or validation.
- Visual className changes only unless className passthrough is required.

Done when: npm run typecheck passes and pwsh ./scripts/check-encoding.ps1 passes." bash ~/.claude/scripts/dad-exec.sh
```

### Pkg B - forms + public surfaces

```bash
DAD_PROMPT="Read .workflow/skills/scoped-implementation.md and follow it.
Read /mnt/d/SimpliSalonCLoud/app/(dashboard)/[slug]/forms pages, /mnt/d/SimpliSalonCLoud/components/forms components, /mnt/d/SimpliSalonCLoud/app/forms/pre/[token]/page.tsx, /mnt/d/SimpliSalonCLoud/app/forms/fill/[token]/page.tsx, /mnt/d/SimpliSalonCLoud/app/survey/[token]/page.tsx.
Read /mnt/d/SimpliSalonCLoud/SimpliSalon Design System/revamp/revamp.html form/modal/card/field patterns.

Goal: Align forms dashboard and public form/survey pages with Revamp v3.

Constraints:
- Do NOT change submit handlers, validation schemas, API routes or token behavior.
- Preserve public page accessibility.

Done when: npm run typecheck passes and pwsh ./scripts/check-encoding.ps1 passes." bash ~/.claude/scripts/dad-exec.sh
```

### Pkg C - reports/integrations/billing

```bash
DAD_PROMPT="Read .workflow/skills/scoped-implementation.md and follow it.
Read /mnt/d/SimpliSalonCLoud/app/(dashboard)/[slug]/reports, /mnt/d/SimpliSalonCLoud/app/(dashboard)/[slug]/booksy/page.tsx, /mnt/d/SimpliSalonCLoud/components/integrations/booksy, /mnt/d/SimpliSalonCLoud/app/(dashboard)/[slug]/billing, /mnt/d/SimpliSalonCLoud/components/billing.
Read /mnt/d/SimpliSalonCLoud/SimpliSalon Design System/revamp/revamp.html card/table/badge/stat/alert patterns.

Goal: Align reports, Booksy/integrations and billing surfaces with Revamp v3.

Constraints:
- Billing/payment code is sensitive: visual-only changes.
- Do NOT alter API calls, checkout, webhook, subscription state, or report calculations.

Done when: npm run typecheck passes and pwsh ./scripts/check-encoding.ps1 passes." bash ~/.claude/scripts/dad-exec.sh
```

## Work packages

- ID: pkg-56-settings | Type: implementation | Worker: codex-dad | Inputs: settings pages/components | Outputs: v3 settings
- ID: pkg-56-forms-public | Type: implementation | Worker: codex-dad | Inputs: forms/public pages/components | Outputs: v3 forms
- ID: pkg-56-reports-integrations-billing | Type: implementation | Worker: codex-dad | Inputs: reports/booksy/billing | Outputs: v3 secondary surfaces

## Verification

```bash
npm run typecheck
pwsh ./scripts/check-encoding.ps1
# Manual:
# settings business/forms/sms/integrations, forms templates/submissions, public form fill, survey,
# reports, Booksy, billing upgrade/invoices.
```

## Acceptance criteria

- [ ] Settings screens use v3 cards/forms/tabs
- [ ] Dashboard forms and public forms use v3 typography/surfaces
- [ ] Reports and chart wrappers use flat v3 cards
- [ ] Booksy/integration widgets use v3 tables/statuses
- [ ] Billing visual update does not change payment logic
- [ ] `npm run typecheck` -> clean
- [ ] `pwsh ./scripts/check-encoding.ps1` -> clean
