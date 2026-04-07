# AGENTS.md

## Primary Mode: Claude as Orchestrator

Claude Code is the primary orchestrator. Codex CLI and codex-dad are the delegated tools.

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

### Responsibility Split
1. Claude owns planning, architecture, and orchestration.
2. codex-dad owns large-file reading, summarization, and first-pass drafts when delegation is useful.
3. Codex owns final review of generated code before acceptance.
4. Codex owns critical debugging for auth, payments, permissions, and DB migrations.
5. Codex owns final typecheck interpretation and ship/no-ship decision.

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

### TASK.md -- universal task brief

`TASK.md` in project root is the standard way to define work for Codex plus codex-dad.
Used in three scenarios:
- **User starts a task directly** with Codex (no Claude involved)
- **Claude hands off** mid-task when context window is ~70-80% full
- **User resumes** an interrupted task

**Format:**
```markdown
# TASK -- [task name] -- [date]

## Objective
[1-2 sentences: what we are building / fixing]

## Context files to read
- [path] -- [why relevant]

## Status
[x] Done: [file/step]
[ ] NEXT: [file/step] -- [exact spec]
[ ] TODO: [file/step] -- [exact spec]

## Key decisions / constraints
- [decision or constraint Codex must respect]

## Open risks / assumptions
- [risk or assumption to verify]

## Resume command
codex exec --dangerously-bypass-approvals-and-sandbox 'Read TASK.md, [file1], [file2] for context. Do NOT use Gemini -- write directly. [task spec]. Write directly.'
```

**Starting fresh (user writes TASK.md):**
- Fill Objective + Context files + TODO items
- Leave Status empty (no Done items yet)
- Run the resume command from the bottom

**Claude handoff (context ~70-80% full):**
- Claude writes TASK.md with current Done/NEXT/TODO status
- Claude says: "Kontekst sie konczy -- zapisalem TASK.md. Uruchom komende z sekcji Resume command."
- User copies the command and runs it in terminal

---

## Encoding Discipline
- Prefer ASCII-only edits by default.
- Use non-ASCII only if the target file already uses it or there is explicit product/content need.

## Output Discipline
- When codex-dad is used, state it briefly and list analyzed files.
- Keep extracted snippets minimal and focused on decisions, patching, and validation.

## Context Handoff (Claude -> user)
- When conversation context becomes long, Claude proactively warns before quality degrades.
- Provides a ready-to-paste handoff summary for a new chat window.
- Handoff summary includes: objective, completed work, pending work, key files changed, key commands run, open risks/assumptions.
