# AGENTS.md

## Primary Mode: Claude as Orchestrator

Claude Code is the primary orchestrator. Codex and Gemini are delegated tools.

### Claude Delegation Rules
| Task | Tool | Why |
|------|------|-----|
| SQL / migrations | Gemini CLI | Deterministic output |
| New TS/TSX > 150 lines | Gemini CLI | Token efficiency |
| New TS/TSX 20–150 lines | Codex CLI | Reads local context automatically |
| Edits to existing files | Claude directly | Edit tool is cheapest |
| Short fixes / snippets < 30 lines | Claude directly | Always |
| Code review after generation | Codex CLI (`--ephemeral`) | Read-only, no changes |

### Gemini Prompt Rules (when invoked by Claude or Codex)
> Coding conventions and output format are in `~/.gemini/GEMINI.md` and `GEMINI.md` (project root).
> Gemini loads them automatically — do NOT repeat them in prompts.
> Prompts should contain ONLY: target file path + types/interfaces needed + task specification.

### Gemini-First Triggers
- File length >= 300 lines or size > 200 KB
- Combined analysis context > 300 KB
- Pure business logic handlers > 150 lines (no UI)

### Gemini Usage Modes
- `summary`: default for large-file reading and extraction.
- `draft`: first-pass code only when the task explicitly needs generation.
- `direct`: Codex can write directly for small/local edits or when Gemini output is inconsistent.

### Gemini Draft-First (recommended)
- Use `draft` by default for:
1. New or heavily refactored UI/API files >= 150 lines.
2. Large existing files >= 300 lines when changes span multiple sections.
3. Repetitive CRUD/forms/settings implementations where first-pass speed matters.
- Keep Codex as final owner for:
1. Auth, payments, permissions, webhooks, cron, DB migrations.
2. Final validation: `typecheck`, lint, migration state, and ship/no-ship decision.

### Responsibility Split
1. Claude owns planning, architecture, and orchestration.
2. Gemini owns large-file reading, summarization, and first-pass code drafts.
3. Codex owns final review of Gemini-generated code before acceptance.
4. Codex owns critical debugging for auth, payments, permissions, and DB migrations.
5. Codex owns final typecheck interpretation and ship/no-ship decision.

### Review and Safety
- Every Gemini-generated code change must receive Codex review before merge.
- For auth, payments, permissions, webhooks, and DB migrations -- Gemini output is advisory only.
- Force direct source verification when:
  - line-level precision is required
  - Gemini output is inconsistent with repository state
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

## Fallback Mode: Codex + Gemini (when Claude is unavailable)

Use this mode when Claude context window is exhausted. Codex takes the orchestrator role.

### Codex as Orchestrator
- Codex reads `AGENTS.md` (this file) and `CLAUDE.md` for project context.
- Codex reads local project files -- always tell it which files to read for context.
- Codex delegates large/complex generation to Gemini.

### Codex Invocation (Windows, project directory)
```powershell
codex exec --dangerously-bypass-approvals-and-sandbox 'Read [file1], [file2] for context.
Do NOT use Gemini -- write the files directly yourself.
Create FILE: [path]
[requirements]
Write directly.'
```

### Codex -> Gemini Delegation (for large files)
```powershell
gemini -p "Generate [path]. Types: [paste interfaces]. Requirements: [spec]" --output-format text 2>/dev/null | grep -v "^Loaded" > [path]
```
Then: `head -3 [path]` to verify no prose prefix, `npx tsc --noEmit` for type errors.

### Codex Review (after Gemini output)
```powershell
codex exec --ephemeral 'Review [path]. Focus: bugs, security, type correctness. No file modifications.'
```

### TASK.md — universal task brief

`TASK.md` in project root is the standard way to define work for Codex+Gemini stack.
Used in three scenarios:
- **User starts a task directly** with Codex (no Claude involved)
- **Claude hands off** mid-task when context window is ~70-80% full
- **User resumes** an interrupted task

**Format:**
```markdown
# TASK — [task name] — [date]

## Objective
[1-2 sentences: what we are building / fixing]

## Context files to read
- [path] — [why relevant]

## Status
[x] Done: [file/step]
[ ] NEXT: [file/step] — [exact spec]
[ ] TODO: [file/step] — [exact spec]

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
- Claude says: "Kontekst się kończy — zapisałem TASK.md. Uruchom komendę z sekcji Resume command."
- User copies the command and runs it in terminal

---

## Encoding Discipline
- Prefer ASCII-only edits by default.
- Use non-ASCII only if the target file already uses it or there is explicit product/content need.

## Output Discipline
- When Gemini is used, state it briefly and list analyzed files.
- Keep extracted snippets minimal and focused on decisions, patching, and validation.

## Context Handoff (Claude -> user)
- When conversation context becomes long, Claude proactively warns before quality degrades.
- Provides a ready-to-paste handoff summary for a new chat window.
- Handoff summary includes: objective, completed work, pending work, key files changed, key commands run, open risks/assumptions.
