# skill:runtime-debug-triage

## Purpose
Diagnose why a broken flow fails before anyone starts patching code.
This skill turns "it does not work" into a bounded debug loop: reproduce, narrow, confirm, then propose the smallest fix.

## Use When
- A route, page, action, webhook, or server function fails unexpectedly
- User report is vague ("broken", "stuck", "loading forever", "500", "wrong data")
- Regression source is unknown
- A change passed typecheck but behavior is still wrong
- Logs, request path, or environment assumptions must be checked before implementation

## Do Not Use When
- Task is clearly implementation-ready with known scope -> use `skill:scoped-implementation`
- Problem is only TypeScript/compiler output -> use `skill:typescript-repair`
- Problem is only schema/migration drift -> use `skill:sql-migration-safe`
- Task is broad architecture discovery with no concrete failing behavior -> use `skill:large-context-analysis`

## Required Inputs
- Observed symptom in 1-2 sentences
- Entry point: route, page, job, component, or command
- Expected behavior
- Actual behavior
- Known recent change if any

## Procedure
1. Re-state the failure precisely: expected vs actual
2. Reproduce with the smallest reliable trigger
3. Identify failure layer:
   - UI rendering/state
   - API/Server Action
   - database/query/RLS
   - external integration
   - environment/configuration
4. Trace only the critical path from entry point to failure point
5. Gather evidence:
   - exact error text
   - failing condition
   - relevant logs or response payload
   - whether issue is deterministic or intermittent
6. Form the top 1-3 hypotheses and eliminate them one by one
7. Stop once root cause is confirmed or the remaining unknown requires Claude decision
8. If fix is obvious and in-bounds, continue with `skill:scoped-implementation`
9. Run right-sized validation via `skill:test-impact-check`
10. Return diagnosis plus fix status, not a stream-of-consciousness diary

## Expected Outputs
```
Symptom:
- Expected: [...]
- Actual: [...]

Reproduction:
- Trigger: [...]
- Repro status: always | intermittent | unable to reproduce

Failure layer:
- UI | API | DB/RLS | external integration | env/config

Evidence:
- [exact error / log / response / condition]

Root cause:
- [confirmed cause] or "not yet confirmed"

Fix status:
- applied | not applied
- If applied: changed files + why
- If not applied: next best action

Validation:
- [commands run + results]

Open risks:
- [item] or "none"
```

## Validation
```bash
npx tsc --noEmit
# plus the smallest command or manual smoke test that reproduces the broken flow
```

## Escalate When
- Failure involves auth, billing, permissions, secrets, or irreversible data operations
- Reproduction depends on missing credentials, production-only data, or inaccessible environment state
- Root cause spans multiple ownership areas and scope is no longer bounded
- Two or more plausible causes remain and code changes would be speculative
- Fix would require changing shared interfaces across many callers

## Context Budget Guidance
- Start with the failing entry point and immediate callees only
- Prefer logs, error text, route handlers, and query sites over broad repo reading
- Do not read full feature areas unless the reproduction trace requires it
- Keep hypothesis list to 3 max; debug by elimination, not brainstorming theater
- If trace expands beyond 5-7 files, switch to `skill:large-context-analysis`

## Safety Constraints
- Do not patch before reproducing or identifying a concrete failing condition, unless the issue is trivially obvious
- Do not hide uncertainty: if root cause is not confirmed, say so explicitly
- `salon_id` filters must remain intact on tenant-scoped queries during debugging
- `supabase.auth.getUser()` must not become `getSession()` during quick fixes
- Never log or expose secrets while collecting evidence
