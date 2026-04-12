# AGENTS.md

## Primary Mode: Claude as Orchestrator

Claude Code is the primary orchestrator. Codex CLI and codex-dad are the delegated tools.

### Skills layer
Skills are the specialization layer — they define how repeatable work types are executed.
Skill files live in `.workflow/skills/`. Workers select the appropriate skill per task.

**Skill → Worker mapping:**
| Skill | Primary worker | Notes |
|-------|---------------|-------|
| `scoped-implementation` | codex-main | Default for all concrete coding tasks |
| `typescript-repair` | codex-dad (fixer) | After tsc errors post-generation |
| `test-impact-check` | codex-main | After every implementation |
| `review-ready-diff` | codex-main | Before returning to Claude for review |
| `large-context-analysis` | codex-dad | Before planning complex tasks |
| `sql-migration-safe` | codex-dad | All schema/data changes |
| `safe-sensitive-change` | codex-main + Claude approval | Auth, billing, permissions, secrets |
| `runtime-debug-triage` | codex-main | Reproduce, isolate, and confirm runtime failures before fixing |
| `parallel-work-split` | Claude | Sprint planning, multi-worker dispatch |

**Common skill sequences:**
- Normal task: `scoped-implementation` → `test-impact-check` → `review-ready-diff`
- Complex area: `large-context-analysis` → `scoped-implementation` → `review-ready-diff`
- Broken behavior: `runtime-debug-triage` → `scoped-implementation` → `review-ready-diff`
- DB change: `sql-migration-safe` → `scoped-implementation` → `review-ready-diff`
- Sensitive: `safe-sensitive-change` (overlays on top of scoped-implementation)

### Claude Delegation Rules
| Task | Tool | Why |
|------|------|-----|
| SQL / migrations | codex-dad | Better repo-aware worker for larger or sensitive tasks |
| New TS/TSX > 150 lines | codex-dad | Better for large-file drafting and local-project reading |
| New TS/TSX 20-150 lines | Codex CLI | Reads local context automatically |
| Edits to existing files | Claude directly | Edit tool is cheapest |
| Short fixes / snippets < 30 lines | Claude directly | Always |
| Code review after generation | Codex CLI (`--ephemeral`) | Read-only, no changes |

### codex-dad Prompt Rules
> codex-dad runs through Claude's wrapper via Git Bash on Windows:
> `$env:DAD_PROMPT='...'; & 'D:\Git\bin\bash.exe' "$HOME/.claude/scripts/dad-exec.sh"`.
> Keep prompts task-focused: target file path, needed context paths, and the exact specification.
> Do not add stack boilerplate when repo context is already present in `AGENTS.md`.

### codex-dad First Triggers
- File length >= 300 lines or size > 200 KB
- Combined analysis context > 300 KB
- Pure business logic handlers > 150 lines (no UI)
- Reading or summarizing files > 50 lines when line-precise `view_range` is not needed

### codex-dad Usage Modes
- `summary`: default for large-file reading and extraction
- `draft`: first-pass code only when the task explicitly needs generation
- `direct`: Codex can write directly for small/local edits or when dad output is unnecessary

### codex-dad Draft-First
- Use `draft` by default for:
1. New or heavily refactored UI/API files >= 150 lines.
2. Large existing files >= 300 lines when changes span multiple sections.
3. Repetitive CRUD/forms/settings implementations where first-pass speed matters.
- Keep Codex as final owner for:
1. Auth, payments, permissions, webhooks, cron, DB migrations.
2. Final validation: `typecheck`, lint, migration state, and ship/no-ship decision.

### Workflow states (explicit state machine)
`Intake → Plan → Dispatch → Execute → Integrate → Review → Close`

### Evidence requirement (every work package must return)
- Files changed (list of paths)
- Commands run + results (e.g. `npx tsc --noEmit` → clean)
- Open issues if anything is unverifiable

### Responsibility Split
1. **Claude** — sole orchestrator and ship gate: intake → plan → dispatch → integrate → final review → ship/no-ship. Only Claude declares "done".
2. **codex-main** — bounded implementation worker: executes work packages, runs verification, returns diff + evidence.
3. **codex-dad** — Context Steward (primary) + second parallel worker: reads large contexts as Context Packs (file anchors, hotspots, risk notes). Also handles SQL/migrations and TS error fixes in this project.
4. Claude is the final reviewer — codex-main pre-review is allowed but non-authoritative.
5. **Sensitive domains** (auth, payments, permissions, schema drops): codex-main proposes + evidence; Claude explicitly approves before any irreversible step.

### Review and Safety
- Every delegated code change must receive Codex review before merge.
- For auth, payments, permissions, webhooks, and DB migrations, delegated output is advisory until validated against source.
- Force direct source verification when:
  - line-level precision is required
  - delegated output is inconsistent with repository state
  - security-sensitive behavior is involved

### Supabase Migration History Playbook
- If `migration up` fails with `relation already exists` or similar drift symptoms:
1. Confirm drift source with `supabase migration list --linked`.
2. Repair only the conflicting version with:
   `supabase migration repair <version> --status applied --linked --yes`
3. Re-run:
   `supabase migration up --linked --yes`
4. If multiple versions are inconsistent, stop and run `supabase db pull` before further pushes.
- Never run broad `repair` for many versions without explicit user approval.

---

## Fallback Mode: Codex + codex-dad (when Claude is unavailable)

Use this mode when Claude context window is exhausted. Codex takes the orchestrator role.

### Codex as Orchestrator
- Codex reads `AGENTS.md` (this file) and `CLAUDE.md` for project context.
- Codex reads local project files -- always tell it which files to read for context.
- Codex delegates large-file reading or heavy first-pass drafting to codex-dad when useful.
- Codex should do this proactively without requiring repeated user reminders; for large-file reads and large-context summaries, prefer `codex-dad` via the documented Git Bash / WSL-style `/mnt/d/SimpliSalonCLoud/...` paths.

### Codex Invocation (Windows, project directory)
```powershell
codex exec --dangerously-bypass-approvals-and-sandbox 'Read [file1], [file2] for context.
Do NOT use Gemini -- write the files directly yourself.
Create FILE: [path]
[requirements]
Write directly.'
```

### Codex -> codex-dad Delegation (for large files)
```powershell
$env:DAD_PROMPT="Read /mnt/d/SimpliSalonCLoud/[file]. TASK: [what to summarize or generate]. FORMAT: Bullet list. LIMIT: Max 20 lines unless architecture or security context requires full coverage."; & 'D:\Git\bin\bash.exe' "$HOME/.claude/scripts/dad-exec.sh"
```
For dad paths use `/mnt/d/SimpliSalonCLoud/...`, not `d:\...`.

### codex-dad Reading Pattern
```powershell
$env:DAD_PROMPT="Read /mnt/d/SimpliSalonCLoud/[path1] and /mnt/d/SimpliSalonCLoud/[path2]. TASK: [question]. FORMAT: Bulleted list. LIMIT: Max 20 lines per file."; & 'D:\Git\bin\bash.exe' "$HOME/.claude/scripts/dad-exec.sh"
```

### Codex Review (after delegated output)
```powershell
codex exec --ephemeral 'Review [path]. Focus: bugs, security, type correctness. No file modifications.'
```

### WORK.md -- universal handoff artifact

`WORK.md` in project root (or `work/WORK-<slug>.md` for concurrent tasks) is the durable ledger for all work.
Used in three scenarios:
- **User starts a task directly** with Codex (no Claude involved)
- **Claude hands off** mid-task when context window is ~70-80% full
- **User resumes** an interrupted task

**Fixed schema (no deviations):**
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
    npx tsc --noEmit   # or other verification commands

## Work packages
- ID: pkg-1 | Type: implementation | Inputs: [...] | Outputs: [...]
- Type enum: context-pack | implementation | migration | refactor | docs | review

## Evidence log   <!-- append-only, one entry per package -->
[YYYY-MM-DD HH:MM] pkg-1 -- files: [...] -- npx tsc --noEmit -> clean

## Decision
Ship: yes/no -- reason -- accepted risks
```

**Starting fresh (user writes WORK.md):**
- Fill Intent + Constraints + Acceptance criteria + Work packages
- Leave Evidence log empty
- Set Status: plan

**Claude handoff (context ~70-80% full):**
- Claude updates WORK.md with current Status + Evidence log entries
- Claude says: "Kontekst sie konczy -- zapisalem WORK.md."
- Codex resumes by reading WORK.md first, then referenced files

**Codex resume command:**
```powershell
codex exec --dangerously-bypass-approvals-and-sandbox 'Read WORK.md, [file1], [file2] for context. Do NOT use Gemini -- write directly. Continue from Status in WORK.md. Write directly.'
```

---

## Encoding Discipline
- Prefer ASCII-only edits by default.
- Use non-ASCII only if the target file already uses it or there is explicit product/content need.
- Never use lossy re-encoding passes on source files (no ad-hoc charset conversions).
- CRITICAL: never use `Set-Content` (or any full-file rewrite command) for source edits; use `apply_patch` or line-scoped edits only.
- Always write edited files as UTF-8 (without BOM when tooling allows).
- After editing UI text, run a mojibake check before finishing:
  - `pwsh ./scripts/check-encoding.ps1` -- exits 1 on Polish mojibake sequences
  - if found, fix strings in the same work package before returning results.
- Avoid broad text replacement scripts for multilingual content unless line-scoped and reviewed.
- lib/booksy/processor.ts intentionally contains mojibake pattern strings (email normalization) -- excluded from encoding checks.
## Output Discipline
- When codex-dad is used, state it briefly and list analyzed files.
- Keep extracted snippets minimal and focused on decisions, patching, and validation.

## Context Handoff (Claude -> user)
- When conversation context becomes long, Claude proactively warns before quality degrades.
- Claude writes/updates `WORK.md` (or `work/WORK-<slug>.md`) with current Status + Evidence log.
- Says: "Kontekst sie konczy -- zapisalem WORK.md."
- User resumes via the Codex resume command in WORK.md.
