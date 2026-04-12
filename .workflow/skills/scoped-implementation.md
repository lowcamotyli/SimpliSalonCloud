# skill:scoped-implementation

## Purpose
Default implementation skill for concrete, bounded coding tasks. The standard muscle of codex-main.

## Use When
- Task has a clear objective and bounded file scope
- Work type: feature implementation, bug fix, small refactor, test update, wiring change
- Normal engineering risk (not auth / billing / migrations)

## Do Not Use When
- Scope is ambiguous or cross-cutting → return to Claude for planning
- Task touches auth, billing, permissions, secrets → use `skill:safe-sensitive-change`
- Task involves schema changes → use `skill:sql-migration-safe`
- Context across many files is needed before editing → use `skill:large-context-analysis` first

## Required Inputs
- Target file(s) with exact paths
- 1-sentence goal
- Constraints (what must not change)
- One testable acceptance criterion

## Procedure
1. Read target files and direct imports (max 3 files total)
2. Identify the minimal change that satisfies the criterion
3. Implement — smallest change, no opportunistic cleanup
4. Run `npx tsc --noEmit`
5. Run relevant tests via `skill:test-impact-check`
6. Produce `skill:review-ready-diff` output before returning

## Expected Outputs
- Changed files (list of paths)
- Concise change summary (what changed + why, not how)
- Validation results (tsc, tests)
- Open risks or follow-ups (if any)

## Validation
```bash
npx tsc --noEmit
# If test file exists for changed area:
pnpm test -- --testPathPattern=[affected file basename]
```

## Escalate When
- Scope grew beyond initial files
- Logic change conflicts with stated constraints
- Type fix requires upstream interface change
- Unexpected dependency discovered that changes the approach

## Context Budget Guidance
- Read only files directly relevant to the task
- Do not read entire modules "for context" — ask Claude if context is unclear
- Maximum: target file + 2 immediate dependencies before starting

## Safety Constraints
- Do not broaden scope beyond the assigned package
- Do not fix unrelated issues in the same commit
- `salon_id` filter MUST be present on all tenant-scoped queries
- `supabase.auth.getUser()` — never replace with `getSession()`
- `noUncheckedIndexedAccess` is enabled — do NOT use `for (let i = 0; ...)` index loops; use `for...of` with `.entries()` instead
