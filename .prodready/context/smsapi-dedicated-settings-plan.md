# Task: SMSAPI full integration + dedicated SMS settings domain

**Size:** M  
**Why:** Cross-cutting change across API/UI/validation/messaging/webhook flow, with security hardening and integration tests, but without mandatory schema rewrite.

**Risk surfaces:** auth/membership checks, encrypted secret handling, webhook authenticity, multi-tenant log updates, external API failure handling, CRM messaging path.

## Current-state findings

- SMS sending is already implemented through SMSAPI in `sendSmsMessage` (`lib/messaging/sms-sender.ts`).
- SMS credentials are currently persisted in `salon_settings` and edited on the generic integrations page.
- Webhook handler updates by `provider_id + channel` only, which risks cross-tenant updates in edge collision scenarios.
- No `Trillo` references were found in repository code (migration likely concerns historical/runtime config outside codebase).

## Target architecture (minimal, production-safe)

### Domain split (logical, not immediate physical split)

Create a dedicated SMS settings domain at API/UI/type level while reusing existing DB columns in `salon_settings` for this task:

- Dedicated API route family for SMS config and SMS test send:
  - `GET/PATCH /api/settings/sms?salonId=...`
  - `POST /api/settings/sms/test`
- Dedicated dashboard location:
  - `/{slug}/settings/sms`
- Dedicated validator/schema for SMS payload (`token`, `senderName`, optional test phone).
- Existing generic settings route keeps backward compatibility during rollout; SMS fields become deprecated there.

### Messaging delivery hardening

- Keep `lib/messaging/sms-sender.ts` as single sender adapter.
- Enforce callback correlation to a single tenant/message record:
  - include deterministic callback metadata (`messageLogId` and `salonId`) in callback URL/query or SMSAPI custom field.
  - webhook update must target one row (prefer by `message_logs.id`; fallback guarded by `provider_id + salon_id + channel`).
- Add webhook verification secret/token check before accepting status update.

### Migration path from Trillo

Because code has no `Trillo` references, migration is operational/config migration:

1. Add feature-flagged SMS settings page/API (`sms_settings_v2`).
2. Populate SMSAPI token per salon via dedicated endpoint (encrypted at write).
3. Enable SMSAPI sending path for selected salons (or all if no dual-run required).
4. Remove/deprecate Trillo UI mentions/config docs (if found outside repo/env).
5. Remove temporary compatibility writes in `/api/settings` once all clients use dedicated endpoint.

If a hidden Trillo credential store exists in DB/runtime, add one SQL migration to null/archive legacy fields after cutover (reversible by restore from backup snapshot).

## Stages

### Stage 0: Characterisation tests (brownfield safety)
1. Add tests covering current SMS behavior in sender + webhook + test endpoint.
   - **Acceptance:** baseline behavior documented and reproducible before refactor.
   - **Evidence:** unit test file(s) for sender normalization/error mapping + integration test for webhook update semantics.

### Stage 1: Introduce dedicated SMS settings API contract
1. Add dedicated DTO/validator and route handlers under `/api/settings/sms`.
2. Reuse existing encryption/masking conventions from `/api/settings`.
3. Restrict read/write by tenant membership; keep owner-only update enforced by existing RLS.
   - **Acceptance:** SMS config can be read/updated without touching non-SMS settings keys.
   - **Evidence:** integration tests for GET/PATCH auth matrix (401/403/200), secret masking (`has_smsapi_token`) and non-leak response.

### Stage 2: Move UI placement to dedicated Settings section
1. Add Settings nav item `SMS` and page `/{slug}/settings/sms`.
2. Move SMS token/sender/test UI from generic integrations page to dedicated SMS page.
3. Keep integrations page focused on external integrations list; no SMS credential form there.
   - **Acceptance:** user can fully configure/test SMS from dedicated page; integrations page no longer acts as SMS config dump.
   - **Evidence:** UI smoke checks + e2e/integration assertion for successful save + test-send path.

### Stage 3: Webhook and tenant-isolation hardening
1. Require webhook auth token (e.g., `X-SMSAPI-Webhook-Token` or signed query token).
2. Correlate callback to single `message_logs` record using message id metadata.
3. Update handler to refuse ambiguous updates (`updatedRows !== 1` -> ignore/error log).
   - **Acceptance:** forged callback without token is rejected; valid callback updates exactly one tenant row.
   - **Evidence:** integration tests for unauthorized webhook (401/403) and valid callback (200 + single-row update).

### Stage 4: Controlled deprecation of old path
1. Mark SMS fields in `/api/settings` as deprecated compatibility path.
2. Optional cleanup migration/code removal after rollout window.
   - **Acceptance:** no UI dependency on deprecated path; backward compatibility preserved during rollout.
   - **Evidence:** grep checks + passing tests after toggling new page/API path.

## Acceptance criteria checklist

- [ ] Dedicated SMS settings page exists at `/{slug}/settings/sms` and is linked in settings nav.
- [ ] SMS token is never returned in plaintext from API responses.
- [ ] SMS token is encrypted on write and supports unchanged masking semantics.
- [ ] SMS sender name validation is enforced (max length + charset) in dedicated validator.
- [ ] Test SMS endpoint uses dedicated SMS config path and enforces auth, tenant membership, rate limit, plan gate.
- [ ] SMS webhook requires authenticity check (token/signature) and rejects unauthorized calls.
- [ ] Webhook status update cannot affect multiple tenants/rows.
- [ ] CRM quick-send and campaign worker continue to send SMS through unified sender adapter.
- [ ] Integrations page no longer stores/presents SMS credentials.
- [ ] Integration tests cover happy path + auth failures + webhook isolation.

## Security requirements

- **Secrets:** token written encrypted, read masked, never logged.
- **Validation:** strict DTO schema for sender/test phone/token semantics.
- **Masking:** UI/API support `has_smsapi_token` + unchanged sentinel; no token echo.
- **Multi-tenant isolation:** membership check on settings API + RLS for writes + webhook single-record correlation by tenant/message.
- **Abuse controls:** retain protected API rate limiting for test sends.

## Proposed file change list (minimal)

Core API/domain:
- `app/api/settings/sms/route.ts` (new)
- `app/api/settings/sms/test/route.ts` (new or move logic from existing CRM test route)
- `lib/validators/settings.validators.ts` (extract/add dedicated SMS schema)
- `lib/types/settings.ts` (SMS settings DTO/types and nav metadata adjustments)
- `hooks/use-settings.ts` (add `useSmsSettings` + `useUpdateSmsSettings`)

UI:
- `app/(dashboard)/[slug]/settings/sms/page.tsx` (new)
- `components/settings/settings-nav.tsx` (add SMS tab)
- `app/(dashboard)/[slug]/settings/integrations/page.tsx` (remove SMS credential block)

Messaging/webhook hardening:
- `lib/messaging/sms-sender.ts` (callback correlation metadata)
- `app/api/webhooks/smsapi/route.ts` (auth + scoped/single-row update)
- `app/api/crm/test-sms/route.ts` (optionally call new SMS test service/route)

Tests:
- `tests/unit/messaging/sms-sender.test.ts` (new)
- `tests/integration/sms-settings-api.test.ts` (new)
- `tests/integration/smsapi-webhook.test.ts` (new)

Optional docs/context:
- `.prodready/context/security.md` (update SMS webhook threat notes)

## Diff budget estimate

- **Files touched:** 10–14
- **Estimated LOC:** +350 to +650 / -120 to -260
- **Rationale:** mostly new dedicated route/page/tests, limited churn in existing core flows.

## Rollback

1. Disable new SMS settings route/page via feature flag and hide nav entry.
2. Re-enable previous SMS form path on integrations page (kept for compatibility in rollout window).
3. Revert webhook strict-auth requirement only if delivery impact is confirmed (time-boxed emergency rollback).
4. Revert patch; no destructive DB operation required in minimal plan.

If cleanup migration was applied, rollback must restore archived legacy config from pre-cutover snapshot.

## Required quality gates and commands

Patch scope:
- `git diff --stat`

Lint/type:
- `npm run lint`
- `npm run typecheck`

Unit + integration:
- `npm run test -- tests/unit/messaging/sms-sender.test.ts`
- `npm run test -- tests/integration/sms-settings-api.test.ts tests/integration/smsapi-webhook.test.ts`
- `npm run test`

M-level requirement:
- Integration gate is **mandatory** and blocks merge on failure.

## Evidence required from Implementer

- Diff stat within budget.
- Test output logs showing passing unit + integration suites for SMS changes.
- API response samples proving token masking.
- Negative webhook auth test output (rejected unauthorized callback).
- Positive webhook callback output proving exactly one log row update.
