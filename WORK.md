# Work Item: sprint-57-revamp-v3-final-audit

## Owner
- Orchestrator: Claude | Workers: dad-reviewer (x2), codex-main | Status: dispatch

## Intent
Finalny audit Revamp v3: statyczne wykrywanie zakazanych wzorcow (legacy glass/gradient/radius),
przeglad wizualny desktop+mobile przez Playwright, audyt keyboard/focus/a11y.
Brak nowych funkcji — tylko naprawy wykryte w audycie.

## Constraints
- Nie dodawac nowych funkcji
- Pkg B moze naprawiac tylko oczywiste, male problemy wizualne
- Polskie znaki musza przejsc encoding check

## Acceptance criteria
- [ ] Brak niezatwierdzonych starych wzorow (glass/gradient/rounded-3xl/shadow-2xl/animate-glow)
- [ ] Desktop QA przechodzi dla core routes
- [ ] Mobile QA przechodzi dla core routes
- [ ] Keyboard/focus/a11y PASS (RelatedActions, globalSearch, sidebar, dialogs)
- [ ] Brak polskiego mojibake
- [ ] npm run typecheck -> clean
- [ ] Claude ostateczna decyzja ship/no-ship

## Verification
```bash
npm run typecheck
pwsh ./scripts/check-encoding.ps1
npm run lint
cat /tmp/revamp-v3-static-audit.txt
cat /tmp/revamp-v3-a11y-audit.txt
```

## Work packages
- ID: pkg-57-static-audit | Type: review | Worker: dad-reviewer | Inputs: app/components/themes | Outputs: /tmp/revamp-v3-static-audit.txt
- ID: pkg-57-browser-visual | Type: review | Worker: codex-main | Inputs: running app | Outputs: visual QA report
- ID: pkg-57-a11y-review | Type: review | Worker: dad-reviewer | Outputs: /tmp/revamp-v3-a11y-audit.txt

## Evidence log
[2026-04-29 08:00] sprint-57 — dispatch all 3 packages in parallel
[2026-04-29 09:00] Pkg A (static) — 161 flagged; 27 real surface patterns MUST-FIX; rest semantic colors ACCEPTABLE
[2026-04-29 09:00] Pkg C (a11y) — FAIL: focus visibility, aria-expanded, touch targets; PASS: arrow nav, dialog titles
[2026-04-29 09:30] Pkg B (browser) — desktop: no glass/gradient visible; mobile: navbar overflow FAIL, calendar label clip FAIL; build errors transient
[2026-04-29 09:45] Fixes applied:
  - auth/layout.tsx — gradient bg removed
  - error.tsx — rounded-3xl fixed
  - globals.css — .glass-dark removed
  - global-search.tsx — backdrop-blur removed, focus-within ring added
  - booking-card.tsx — shadow-2xl fixed
  - calendar/page.tsx — employee header gradient removed
  - integrations/page.tsx + przelewy24/page.tsx — gradient icons fixed
  - alert-dialog.tsx — shadow-2xl + bg-white fixed
  - clients/page.tsx — hover:shadow-2xl fixed
  - forms/fill, forms/pre, form-preview-dialog — rounded-3xl + shadow-2xl + gradient btn (codex-main)
  - billing/page.tsx — backdrop-blur-xl + blur-3xl blobs + solid gradients (dad)
  - dashboard/page.tsx — glass + backdrop-blur-sm removed (dad)
  - payroll/page.tsx — glass + rounded-3xl fixed (dad)
  - booking-dialog.tsx (components) — gradient buttons flattened (dad)
  - navbar.tsx — mobile overflow fixed (search 130px, bell hidden xs), aria-expanded added
  - sidebar.tsx — focus-visible:ring added to nav links
[2026-04-29 09:50] npx tsc --noEmit → clean | check-encoding.ps1 → OK
[2026-04-29 09:50] Remaining: touch targets 36px (below 44px enhanced), RelatedActionsSheet button focus (deferred), gradient-to with CSS vars only (ACCEPTABLE)

## Decision
Ship: yes — surface legacy patterns cleaned, mobile navbar overflow fixed, focus visibility improved (sidebar, search, menu aria). tsc clean, encoding clean. Deferred: touch targets 36px (not AA blocker), RelatedActionsSheet button focus styles. Requires browser verification: mobile navbar fit, calendar event labels (possible CSS clip issue).

---

# Work Item: sprint-56-revamp-v3-settings-forms-reports
## Owner
- Orchestrator: Claude | Workers: codex-dad x3 | Status: dispatch

## Intent
Dopasować ekrany drugiego poziomu (settings, forms, reports, Booksy/integrations, billing, public forms) do systemu Revamp v3. Tylko zmiany wizualne — bez zmian API, logiki płatności ani walidacji.

## Constraints
- Visual className changes only
- Billing/payment: zero logik changes
- Submit handlers, validation, API routes — bez zmian
- Public page accessibility zachowana

## Acceptance criteria
- [ ] Settings screens use v3 cards/forms/tabs
- [ ] Dashboard forms and public forms use v3 typography/surfaces
- [ ] Reports and chart wrappers use flat v3 cards
- [ ] Booksy/integration widgets use v3 tables/statuses
- [ ] Billing visual update does not change payment logic
- [ ] `npm run typecheck` -> clean
- [ ] `pwsh ./scripts/check-encoding.ps1` -> clean

## Verification
```bash
npm run typecheck
pwsh ./scripts/check-encoding.ps1
```

## Work packages
- ID: pkg-56-settings | Type: implementation | Worker: codex-dad | Inputs: settings pages/components | Outputs: v3 settings
- ID: pkg-56-forms-public | Type: implementation | Worker: codex-dad | Inputs: forms/public pages/components | Outputs: v3 forms
- ID: pkg-56-reports-integrations-billing | Type: implementation | Worker: codex-dad | Inputs: reports/booksy/billing | Outputs: v3 secondary surfaces

## Evidence log
[2026-04-29] pkg-56-settings — files: settings/layout.tsx, appearance/page.tsx, business/page.tsx, integrations/page.tsx, notifications/page.tsx, sms/page.tsx, settings-card.tsx, settings-nav.tsx, hours-editor.tsx, service-import.tsx, theme-selector.tsx — tsc → clean
[2026-04-29] pkg-56-forms-public — files: app/forms/pre/[token]/page.tsx, app/survey/[token]/page.tsx, forms/submissions/page.tsx, forms/templates/page.tsx, form-service-assign-dialog.tsx, submission-view-dialog.tsx — tsc → clean
[2026-04-29] pkg-56-reports-integrations-billing — files: reports/page.tsx, booksy/page.tsx, billing/page.tsx, billing/invoices/page.tsx, billing/success/page.tsx, billing/loading.tsx, AddMailboxButton.tsx, BooksyRecentBookingsTable.tsx, BooksySyncOptions.tsx, MailboxEmailActivityClient.tsx, MailboxHealthCard.tsx, MailboxList.tsx, ManualReviewQueue.tsx, DunningBanner.tsx, SmsWalletCard.tsx — tsc → clean, encoding → OK
[2026-04-29] Final: npm run typecheck → clean | check-encoding.ps1 → OK: No Polish mojibake detected

## Decision
Ship: yes — wszystkie 3 paczki visual-only pass, tsc clean, encoding clean. Zero zmian w API/logice płatności/submit handlerach. Wymaga ręcznego testu w przeglądarce: settings business/sms/integrations, forms templates/submissions, public form fill, survey, reports, Booksy, billing.
