# Review Policy

## Decision-maker: Claude (sole)
Claude is the only final reviewer. codex-main pre-review is allowed but non-authoritative.

## Claude final acceptance order
1. Acceptance criteria satisfied (from WORK.md)
2. Evidence present (files changed + commands + results)
3. Diff sanity: scope bounded, layering correct, conventions followed, no unrelated changes
4. tsc clean
5. Tests pass or skip documented

## When to use `skill:review-ready-diff`
Always when worker touched multiple files or made non-trivial logic changes.
Trivial single-line changes do not need it.

## Sensitive domain review (additional gate)
For auth, billing, permissions, migrations:
- Risk register must be present (from `skill:safe-sensitive-change`)
- Claude reads risk register before approving — not just diff
- Irreversible steps require explicit "approved" statement from Claude before execution

## What Claude does NOT do during review
- Does not re-read full implementation files — reads the review packet
- Does not run tsc — evidence must include tsc result from worker
- Does not second-guess worker line-by-line — trusts evidence, checks hotspots

## Merge policy
- Protected branches require CI green before merge
- No exceptions to CI requirement
- Ship/no-ship recorded in WORK.md Decision section
