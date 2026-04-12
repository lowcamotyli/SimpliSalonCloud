# skill:large-context-analysis

## Purpose
Analyze large or unfamiliar code areas to produce a compact, actionable Context Pack — without brute-force full-repo reading.
This is the clean replacement for the overloaded "reader" behavior. Primary skill of codex-dad.

## Use When
- Task spans many files or modules and ownership is unclear
- Request path must be traced before planning (e.g. "how does booking creation work?")
- Claude needs a compact map before delegating implementation
- Risk surface must be understood before a refactor or migration
- Dependency surface mapping required

## Do Not Use When
- File count is small (≤ 3) and paths are known — read directly
- Task is purely implementation-ready with known scope — use `skill:scoped-implementation`
- SQL-only schema analysis — use `skill:sql-migration-safe`

## Required Inputs
- Question or concern to resolve (1–2 sentences)
- Entry point: specific file, API route, or feature name
- Known relevant files (if any)

## Procedure
1. Identify entry point and trace outward: imports → callers → DB access
2. Stop at known stable boundaries (shared UI components, external APIs, auth layer)
3. Map: affected areas → probable change points → risky dependencies
4. Assess confidence level per area (high / medium / low)
5. Identify unknowns that would change the picture
6. Recommend the next concrete action slice for Claude

## Expected Outputs
- Affected areas: file paths + 1-line role description each
- Probable change points: specific locations, not vague module names
- Confidence level per area (high / medium / low)
- Unknowns that affect planning
- Recommended next slice (implementation spec or further analysis target)

## Validation
N/A — analysis only, no code changes. Output reviewed by Claude.

## Escalate When
- Trace reveals security-sensitive area (auth, billing, RLS) — flag before proceeding
- Trace leads to external integration (Supabase RLS, webhooks, payment processor)
- Circular dependencies or unclear ownership found
- Context pack would exceed 30 lines without losing critical information

## Context Budget Guidance
- Start with file listing and import headers — not full file content
- Read only files on the critical path; skip test files, mocks, and generated files
- Hard cap: 10 files before summarizing — do not expand indefinitely
- Output must fit in ~30 lines; prune ruthlessly
- For arch docs: use full content, no line limit (exceptions are critical)

## Safety Constraints
- Output only — no code changes, no "quick fixes while I'm here"
- Do not produce draft implementations as part of analysis
- Flag any auth / billing / permissions touchpoints explicitly in output
