# skill:parallel-work-split

## Purpose
Split a task into independent worker slices that can run in parallel without merge chaos.
Parallelism is useful only when the split is clean. This skill makes it deliberate instead of impulsive.

## Use When
- Task has 2+ separable subproblems
- Multiple workers can progress independently (no shared file writes)
- Sprint prep requires parallel dispatch planning
- Orchestration overhead is justified by the speedup

## Do Not Use When
- Task is sequential by nature (B depends on A's output type or file)
- Only one file or area is involved — single worker is simpler
- Parallelism would create race conditions on shared files
- Split boundary is unclear — prefer sequential until it becomes obvious

## Required Inputs
- Full task description
- Target files with exact paths
- Dependency notes (which files import from which — even partial)

## Procedure
1. List all target files
2. Map imports: A → B means B must wait for A's exports to be stable
3. Identify independent groups: no shared imports, no shared writes
4. Assign workers:
   - codex-main: implementation-heavy slices (API routes, components, logic)
   - codex-dad: analysis/migration slices (`skill:large-context-analysis`, `skill:sql-migration-safe`)
5. Define interface contracts: what types/exports each slice produces for the other
6. Write recombination instructions: what Claude checks at the Integrate phase

## Expected Outputs
```
Worker A (codex-main):
  Files: [list]
  Task: [description]
  Constraints: [what must not change]
  Produces: [exports/types needed by Worker B, if any]

Worker B (codex-dad):
  Files: [list]
  Task: [description]
  Constraints: [what must not change]
  Produces: [exports/types needed by Worker A, if any]

Shared assumptions:
- [type name, function signature, or behavior contract]

Interface contracts:
- Worker A exports X → Worker B expects X with shape Y

Recombination instructions (for Claude at Integrate):
- Run npx tsc --noEmit — catches interface violations
- Verify [specific shared assumption]
```

## Validation
```bash
npx tsc --noEmit   # catches interface contract violations between slices
```

## Escalate When
- Dependency discovered mid-task that invalidates the split
- Worker scope grew to overlap with the other worker's files
- Interface contract was not honored by one worker — do not patch silently, escalate

## Context Budget Guidance
- Dependency mapping: read only file headers and import lines, not full implementations
- Export lists only — not full function bodies
- This is a planning skill — keep output lean, not exhaustive

## Safety Constraints
- **Never assign the same file to two workers simultaneously** — race condition
- DB migration always sequential: migration → type generation → code that uses new types
- If split is uncertain, default to sequential over parallel — clean parallelism only
- Worker scope must be bounded before dispatch, not discovered during execution
