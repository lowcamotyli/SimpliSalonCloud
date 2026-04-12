# Handoff Contract

The durable handoff artifact for this workflow is `WORK.md` (project root) or `work/WORK-<slug>.md` for concurrent tasks.

## Fixed schema — no deviations

```
# Work Item: <slug>
## Owner
- Orchestrator: Claude | Workers: [list] | Status: intake | plan | dispatch | execute | integrate | review | closed

## Intent
One paragraph: goal + why.

## Constraints
- bullets

## Acceptance criteria
- [ ] verifiable statement

## Verification
    npx tsc --noEmit   # exact commands to verify completion

## Work packages
- ID: pkg-1 | Type: implementation | Inputs: [...] | Outputs: [...]
- Type enum: context-pack | implementation | migration | refactor | docs | review
- Skill: scoped-implementation | large-context-analysis | ... (optional, per package)

## Evidence log   <!-- append-only -->
[YYYY-MM-DD HH:MM] pkg-1 -- files: [...] -- npx tsc --noEmit -> clean

## Decision
Ship: yes/no -- reason -- accepted risks
```

## Rules
- Append-only evidence log — never edit past entries
- Status must be updated on every state transition
- Claude is the only one who can set Status: closed
- If Claude context is exhausted mid-task: update Status + Evidence log, then hand off
- Codex resumes by reading WORK.md first, then referenced files

## Resume command template
```powershell
codex exec --dangerously-bypass-approvals-and-sandbox 'Read WORK.md, [file1], [file2] for context. Do NOT use Gemini -- write directly. Continue from Status in WORK.md. Write directly.'
```
