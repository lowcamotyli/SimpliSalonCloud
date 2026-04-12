# skill:test-impact-check

## Purpose
Determine the right validation scope for a given change — serious but lightweight.
Not "run everything." Not "skip everything." Right-sized.

## Use When
- Worker changed logic, interfaces, persistence, or request flow
- Test scope needs deliberate selection after `skill:scoped-implementation` or `skill:typescript-repair`
- Critical-path code was touched (auth, billing, booking flow, CRM)

## Do Not Use When
- Change is documentation-only or pure config — skip validation entirely
- Change is type-only fix with no logic change — `npx tsc --noEmit` is sufficient

## Required Inputs
- List of changed files
- Type of change: logic | interface | persistence | routing | type-only

## Procedure
1. For each changed file, check for a test counterpart (`*.test.ts` same basename)
2. Determine if changed code is on a critical path:
   - Critical: auth, billing, booking creation/edit, RLS-affecting, CRM automations
   - Normal: UI components, settings, display logic
3. Select validation commands:
   - Always: `npx tsc --noEmit`
   - Test counterpart exists: `pnpm test -- --testPathPattern=[basename]`
   - API route changed: note manual smoke test recommendation
   - Persistence changed (DB queries): note integration test or manual verification
4. Run selected commands
5. Report: what ran + results, what was skipped + explicit reason

## Expected Outputs
- Commands run + pass/fail results
- Tests passed / failed / skipped with explicit reason per skip
- Recommendation if broader testing is warranted (e.g. "no unit tests for this auth path — manual smoke test advised")

## Validation
```bash
npx tsc --noEmit
pnpm test -- --testPathPattern=[changed file basename]
```

## Escalate When
- Tests fail with errors unrelated to the change (pre-existing failures)
- No tests exist for critical-path logic (auth, billing) → flag explicitly to Claude
- Changed interface affects many callers with no test coverage

## Context Budget Guidance
- Check test file existence with `ls` — do not read test files in full
- Run tests, do not read them
- Report only: command + result + skip reason

## Safety Constraints
- Do not skip tests on auth, billing, or booking flow changes without explicit documented reason
- Silent skips are forbidden — every skip must be stated and justified
- If no tests exist for a critical path: state this explicitly — it is important information for Claude
