# SS2.3 Detailed Run Results

## Part 1

- Status: completed
- Command: `cmd /c scripts\playwright.cmd test tests/e2e/ss23-detailed-part1.spec.ts --workers=1`
- Passed: 8
- Failed: 0
- Skipped: 3
- Notes:
  - rerun after the `balance/debit` fix is green
  - skipped tests remain data/UI-conditional, not failing

## Part 2

- Status: completed
- Command: `cmd /c scripts\playwright.cmd test tests/e2e/ss23-detailed-part2.spec.ts --workers=1`
- Passed: 8
- Failed: 0
- Skipped: 5
- Notes:
  - rerun after the public booking contract update is green
  - skipped tests remain contextual

### Skipped / Contextual

- `S18 - public booking shows description expand when description is set`
  - skipped because the public booking flow did not expose the expected description-expander state
- `S19 - public booking confirm button disabled until terms checkbox checked`
  - skipped because the public booking flow / terms checkbox state was not available in this run
- `S20 - GET /api/services/[id]/media returns an array`
  - skipped because no first service id was available from the API in this run
- `S20 - POST /api/services/[id]/media rejects oversized file >2MB`
  - skipped because no first service id was available from the API in this run
- `S20 - POST /api/services/[id]/media rejects non-image MIME type`
  - skipped because no first service id was available from the API in this run

## Part 3

- Status: completed
- Command: `cmd /c scripts\playwright.cmd test tests/e2e/ss23-detailed-part3.spec.ts --workers=1`
- Passed: 10
- Failed: 0
- Skipped: 3
- Notes:
  - rerun after premium-hours locator and public availability contract updates is green
  - skipped tests remain data/UI-conditional

### Skipped / Contextual

- `S21 - gallery modal closes on Escape key press`
  - skipped because the expected gallery trigger state was not visible in the service editor
- `S21 - gallery modal shows next/prev navigation when service has 2+ images`
  - skipped because the current service did not expose a gallery state with at least 2 images
- `S23 - bulk action bar shows count=2 when two services selected`
  - skipped because fewer than 2 selectable services were available in this run

## Follow-up Fixes

- Updated `app/api/clients/[id]/balance/debit/route.ts` to read balances from `client_balance_summary` instead of PostgREST aggregate queries, fixing both overdraft handling and successful debit flow.
- Updated `app/api/clients/[id]/balance/deposit/route.ts` and `app/api/clients/[id]/balance/refund/route.ts` to use the same balance refresh path after writes.
- Updated `tests/integration/client-balance-api.test.ts` so the mocked balance summary matches the new post-write balance lookup.
- Updated `tests/e2e/ss23-detailed-part2.spec.ts` to use the current public booking contract:
  - `X-API-Key`
  - correct payload keys: `name`, `phone`, `serviceId`, `date`, `time`
  - unique `X-Forwarded-For` to avoid reusing a rate-limited client IP
- Updated `tests/e2e/ss23-detailed-part3.spec.ts` to use the current public availability contract and precise UI locators.
- Updated `tests/e2e/ss23-extended.spec.ts` to match the current UI and to verify balance changes through the authenticated API instead of brittle text matching.
