# AGENTS.md

## Global Preferences

### Operating Mode
- Use `Gemini-first` execution for context-heavy work and draft implementation.
- Keep planning and final technical decision-making with Codex.
- Keep final code review with Codex after Gemini output.

### Gemini-First Triggers
- Assume `gemini` CLI is installed, authenticated, and available in PATH.
- Route work to `gemini` CLI first when at least one condition is true:
  - file length is 300 lines or more
  - file size is more than 200 KB
  - combined analysis context is more than 300 KB
  - log/report payload is large enough that direct full read is inefficient

### Responsibility Split
1. Codex owns planning, solution strategy, and implementation sequencing.
2. Gemini owns large-file reading, extraction, summarization, and first-pass code drafts/patch drafts.
3. Codex owns final review of Gemini-generated code before acceptance.
4. Codex owns critical debugging and validation for auth, payments, permissions, and DB migrations.
5. Codex owns final test/lint/typecheck interpretation and ship/no-ship decision.

### Implementation Policy
- Default: ask Gemini for draft code or patch proposal first.
- For implementation requests, require Gemini output as `unified diff` or minimal patch hunks that can be applied directly.
- Avoid narrative-only "patch proposals" when concrete edits are requested.
- Codex writes code directly only when Gemini draft fails, is ambiguous, or is lower quality than required.
- For small and localized edits, Codex may implement directly without Gemini roundtrip.

### Encoding Discipline
- Prefer ASCII-only edits by default.
- Use non-ASCII only if the target file already uses it or there is explicit product/content need.

### Review And Safety
- Every Gemini-generated code change must receive Codex review before merge.
- For auth, payments, permissions, webhooks, and DB migrations, Gemini output is advisory only until Codex performs direct source verification and final acceptance.
- Force direct source verification when:
  - line-level precision is required for exact patching
  - Gemini output is inconsistent with repository state
  - security-sensitive or correctness-critical behavior is involved

### Output Discipline
- When Gemini is used, state it briefly and list analyzed files.
- Keep extracted snippets minimal and focused on decisions, patching, and validation.

### Context Handoff
- When conversation context becomes long and there is risk of context-window loss, proactively warn the user before quality degrades.
- Provide a ready-to-paste handoff summary for a new chat window.
- Handoff summary should include: objective, completed work, pending work, key files changed, key commands/tests run, and open risks/assumptions.
