# skill:typescript-repair

## Purpose
Fix TypeScript errors safely with minimal blast radius — without turning a type fix into a broad refactor.

## Use When
- `npx tsc --noEmit` produces errors
- Type drift after refactor or code generation
- Interface mismatch or generic misuse
- Import/export type breakage
- Unsafe inference introduced by codex output

## Do Not Use When
- Error is logic-level, not type-level → escalate to Claude
- Fix requires changing a shared interface used by 3+ files → escalate to Claude for impact assessment first
- Error is in `types/supabase.ts` (generated file) → run `supabase gen types typescript --linked > types/supabase.ts` instead

## Required Inputs
- Full `npx tsc --noEmit` output (exact error list with file paths and line numbers)
- Target files to fix (from error output — do not expand scope)

## Procedure
1. Parse tsc output — group errors by file and error class
2. Fix in priority order (see below)
3. For each fix: smallest change that resolves the error, no logic changes
4. Re-run `npx tsc --noEmit` after each file
5. Stop if new errors appear in previously clean files — escalate
6. Report: fixed list, remaining list with reasons

## Priority order
1. `Cannot find module '@/components/ui'` → replace barrel import with individual path (`@/components/ui/button`)
2. `Parameter 'X' implicitly has 'any' type` → `React.ChangeEvent<HTMLInputElement>` or appropriate event type
3. `Cannot find name 'X'` in route → missing import (usually `createAdminSupabaseClient`)
4. `Type '...' is not assignable` in Supabase insert → check if trigger-generated field needs `as any` (e.g. `invoice_number`)
5. Generic type errors → add explicit type parameter or `as unknown as TargetType`

## Expected Outputs
- List of fixed type errors: file + line + what changed
- Remaining errors (if any) with reason not fixable here
- Final `npx tsc --noEmit` result

## Validation
```bash
npx tsc --noEmit   # must be clean or show only pre-existing, unrelated errors
```

## Escalate When
- Fix requires changing a shared type or interface used in many files
- Error is in `types/supabase.ts` — regenerate, do not hand-edit
- Resolving error requires changing logic, not just types
- `as any` is the only option found — flag to Claude before applying

## Context Budget Guidance
- Read only files listed in tsc error output
- Use `view_range` (exact line from error) — do not read full files
- Do not read files that have no errors

## Safety Constraints
- Do not change logic — only types, imports, and type annotations
- Do not add `as any` without documenting it in the output
- `supabase.auth.getUser()` must not become `getSession()` during repair
- `salon_id` filters must not be removed during type cleanup
- Do not use `for (let i = 0; ...)` index loops — use `for...of` with `.entries()` (`noUncheckedIndexedAccess`)
