# skill:safe-sensitive-change

## Purpose
Apply additional discipline to high-risk domains. Standard coding tempo must never be applied blindly to sensitive work.

## Use When
- Auth, session management, JWT tokens
- Permissions, RLS policies, RBAC role logic
- Billing, payments, Stripe webhooks
- Secrets, API keys, environment variable handling
- Irreversible state transitions or deletion logic
- Production data operations
- Compliance-sensitive code

## Do Not Use When
- Work is clearly non-sensitive (UI layout, copy, config keys without secrets)
- Schema changes — `skill:sql-migration-safe` already covers those safety constraints

## Required Inputs
- Target files and change description
- Explicit list of what "bad" looks like (what must not happen as a result)
- Prior behavior (what currently works and must keep working)

## Procedure
1. State explicit assumptions before writing any code — write them down
2. Identify danger points: what can break badly, silently, or irreversibly
3. Implement with minimal blast radius — no opportunistic cleanup in sensitive areas
4. For each danger point: implement the negative check (what must NOT happen)
5. Run `npx tsc --noEmit` + relevant tests via `skill:test-impact-check`
6. Produce explicit risk register (bullet list, not prose)
7. Return to Claude — do not self-approve sensitive changes

## Expected Outputs
Implementation result + explicit risk register:
```
Changed files: [list]

Risk register:
- Danger point: [specific location/behavior]
  Mitigation: [what was done]
  Residual risk: [what remains open or "none"]

Validation:
- tsc: clean | errors: [list]
- Tests: [results]
```

## Validation
```bash
npx tsc --noEmit
# Auth: verify getUser() not replaced with getSession()
# RLS: verify salon_id filter on all tenant-scoped queries
# Billing: verify webhook signature validation present
# JWT: verify jose library used, not jsonwebtoken
```

## Escalate When
- Any irreversible operation is required (data deletion, schema drop) — stop and get Claude approval
- Risk register has unmitigated danger points
- Assumption about current behavior was wrong
- Change scope grew beyond originally assigned files

## Context Budget Guidance
- For auth/RLS changes: consult `docs/architecture/security-model.md` before implementing
- Read: target file + relevant auth context (`lib/supabase/get-auth-context.ts`) + RLS migration
- Do not skip architecture docs for this skill — risk of silent regression is high

## Safety Constraints
- **Claude must explicitly approve before any irreversible operation**
- `supabase.auth.getUser()` — never replace with `getSession()` (getSession trusts JWT without server-side verification)
- Service role key: never expose client-side
- Secrets: never hardcoded, never logged, never in response bodies
- JWT library: `jose` only (edge runtime compatible) — `new SignJWT(payload as unknown as JWTPayload)`
- Every risk register item must have a mitigation or escalation — silent acceptance is forbidden
