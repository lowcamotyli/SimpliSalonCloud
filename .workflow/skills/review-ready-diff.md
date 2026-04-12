# skill:review-ready-diff

## Purpose
Prepare a compact review packet from completed work so Claude can review it fast with low token waste.
Not a diary. Not raw chain-of-thought. Not full file restatement.

## Use When
- Implementation is complete and ready for Claude's final acceptance
- Worker touched multiple files or made non-trivial logic changes
- Any task where risk hotspots need explicit surfacing

## Do Not Use When
- Change is trivial (single line, obvious config) — just list the file and result
- Task was analysis-only — use `skill:large-context-analysis` output format instead

## Required Inputs
- List of changed files
- Original task intent (1 sentence)
- tsc result
- Test results (or explicit statement that tests were skipped + why)

## Procedure
1. For each changed file: 1–2 sentence rationale (why it changed, what risk it carries)
2. Identify risk hotspots: auth paths, DB queries without salon_id, state mutations, external calls
3. State test coverage: what was run, what passed, what was skipped + why
4. List known assumptions made during implementation
5. List explicit unresolved items (or state "none")

## Expected Outputs
```
Changed files:
- path/to/file.ts — [what changed, why, risk level if notable]

Risk hotspots:
- [specific location + risk type] or "none"

Test status:
- tsc: clean | errors: [list]
- Tests run: [command + result] | skipped: [why]

Assumptions:
- [assumption] or "none"

Unresolved:
- [item] or "none"
```

## Validation
- tsc must be run and result explicitly stated
- Do not write "I assume tests pass" — run them or state explicitly they were skipped

## Escalate When
- Risk hotspot involves auth, billing, or permissions without mitigation
- tsc has errors that require upstream interface changes
- Assumption discovered to be wrong during implementation

## Context Budget Guidance
- Summary skill — do not restate full file content
- One line per changed area unless risk justifies more detail
- Risk hotspots: be specific about location, not vague about area

## Safety Constraints
- Do not mark as ready if tsc has unresolved errors
- Risk hotspots must be explicitly called out — not buried in prose
- Missing `salon_id` filter is always a risk hotspot — never omit it
