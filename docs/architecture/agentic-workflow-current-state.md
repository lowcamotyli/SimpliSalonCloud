# Agentic Workflow - Current State

Last updated: 2026-04-08

## Purpose

This document captures the current agentic workflow used around Claude, Codex, `codex-main`, and `codex-dad` for the SimpliSalonCloud repository. It is intended as a compact context pack for Deep Research.

## Scope

This workflow is defined by a mix of:
- repository-local instructions,
- global Claude instructions,
- global Codex instructions,
- runtime hooks that enforce behavior,
- handoff conventions such as `TASK.md`.

This means the real workflow is not defined by a single file. It is an overlay of multiple instruction layers.

## Primary Sources Of Truth

### Repository-local

- `d:/SimpliSalonCLoud/AGENTS.md`
- `d:/SimpliSalonCLoud/CLAUDE.md`
- `d:/SimpliSalonCLoud/TASK.md`

### Global Claude layer

- `C:/Users/barto/.claude/CLAUDE.md`
- `C:/Users/barto/.claude/settings.json`
- `C:/Users/barto/.claude/hooks/enforce-delegation.py`
- `C:/Users/barto/.claude/hooks/enforce-codex-large-edits.py`
- `C:/Users/barto/.claude/hooks/token-watchdog.py`
- `C:/Users/barto/.claude/hooks/remind-codex-review.py`

### Global Codex layer

- `C:/Users/barto/.codex/AGENTS.md`
- `C:/Users/barto/.codex/config.toml`
- `C:/Users/barto/.codex/rules/default.rules`

## Executive Summary

The system currently operates in two modes:

1. Primary mode: Claude acts as orchestrator, while `codex-main` and `codex-dad` are delegated workers.
2. Fallback mode: Codex acts as orchestrator, with optional support from `codex-dad`.

In practice, the workflow is strongly shaped by Claude runtime hooks. Those hooks partially enforce delegation and partially limit direct reading/editing behavior inside Claude.

## Current Role Model

### Claude

Intended role:
- planning,
- architecture,
- orchestration,
- task dispatch,
- handoff preparation,
- limited direct edits only when faster than delegation.

Direct coding is supposed to be rare and limited to:
- very small fixes,
- imports/exports,
- small config changes,
- very small SQL,
- handoff docs like `TASK.md`.

### codex-main

Intended role:
- default implementation worker,
- new TS/TSX files,
- medium to large code generation,
- larger refactors that are not assigned to `codex-dad`.

### codex-dad

Intended role:
- large-file reading and summarization,
- first-pass drafts when useful,
- SQL and migrations,
- large business-logic handlers,
- architecture-document extraction,
- in some instructions also review and TS-error fixing.

### Codex as standalone orchestrator

Fallback role when Claude is unavailable or context is exhausted:
- reads local context,
- owns planning and sequencing,
- optionally delegates to `codex-dad`,
- keeps final ownership of technical direction and validation.

## Mode Split

### Mode A: Claude as orchestrator

Defined mainly in:
- `d:/SimpliSalonCLoud/AGENTS.md`
- `C:/Users/barto/.claude/CLAUDE.md`

Core idea:
- Claude plans,
- workers execute,
- handoff happens through `TASK.md` when context gets large.

### Mode B: Codex as orchestrator

Defined mainly in:
- `d:/SimpliSalonCLoud/AGENTS.md`
- `C:/Users/barto/.codex/AGENTS.md`

Core idea:
- Codex becomes the main operator,
- `codex-dad` remains optional support,
- final review and ship/no-ship decisions remain with Codex.

## Delegation Rules In The Repository Layer

From `d:/SimpliSalonCLoud/AGENTS.md`:

- SQL / migrations -> `codex-dad`
- new TS/TSX > 150 lines -> `codex-dad`
- new TS/TSX 20-150 lines -> Codex CLI
- edits to existing files -> Claude directly
- short fixes / snippets < 30 lines -> Claude directly
- code review after generation -> Codex CLI `--ephemeral`

Additional repository rules:
- `codex-dad` first for files >= 300 lines or > 200 KB
- `codex-dad` first for pure business logic handlers > 150 lines
- `codex-dad` first for reading/summarizing files > 50 lines
- Codex keeps final ownership for auth, payments, permissions, webhooks, cron, and DB migrations

## Delegation Rules In The Global Claude Layer

From `C:/Users/barto/.claude/CLAUDE.md` and `d:/SimpliSalonCLoud/CLAUDE.md`:

- Claude is orchestrator, not primary coder
- new TS/TSX files are generally delegated to `codex-main`
- second and subsequent files may be split to `codex-dad` in parallel
- review and TS-error fixing after generation may go to `codex-dad`
- SQL / migrations go to `codex-dad`
- reading files > 50 lines should go to `codex-dad`

Operational sprint pattern:

1. Plan files and assign workers.
2. Dispatch all workers in parallel.
3. Wait and run `npx tsc --noEmit`.
4. Use `codex-dad` to fix TS issues.
5. Record lessons learned.
6. Compact / hand off when context grows.

## Delegation Rules In The Global Codex Layer

From `C:/Users/barto/.codex/AGENTS.md`:

- use Codex directly for planning, implementation, and final technical decisions
- use `codex-dad` only when it materially helps with large-context reading or first-pass drafts
- final review belongs to Codex
- final validation belongs to Codex
- default behavior should be direct Codex work unless delegation clearly saves time

This is more Codex-centric than the Claude layer.

## Runtime Enforcement Layer

The most important practical behavior comes from Claude hooks in `C:/Users/barto/.claude/settings.json`.

### PreToolUse: `Write`

Hook:
- `C:/Users/barto/.claude/hooks/enforce-delegation.py`

Behavior:
- if writing a code file with more than 20 lines, Claude is denied and told to delegate
- if writing a SQL file with more than 30 lines, Claude is denied and told to delegate

### PreToolUse: `Edit` / `MultiEdit`

Hook:
- `C:/Users/barto/.claude/hooks/enforce-codex-large-edits.py`

Behavior:
- if a code edit touches more than about 50 lines, Claude is denied and told to delegate

### PostToolUse: `Read`

Hook:
- `C:/Users/barto/.claude/hooks/token-watchdog.py`

Behavior:
- warns on wasteful reads
- warns on large reads
- counts source-file reads
- blocks after 4 source-file reads in one session window
- suggests using another model first for large-context reading

### Stop hook

Hook:
- `C:/Users/barto/.claude/hooks/remind-codex-review.py`

Behavior:
- if code work is detected, stopping the session triggers a review reminder/block asking for Codex review

## Handoff Protocol

The common handoff artifact is `d:/SimpliSalonCLoud/TASK.md`.

It is used when:
- the user starts directly with Codex,
- Claude hands off due to context pressure,
- an interrupted task needs to be resumed.

Expected fields:
- objective,
- context files,
- done / next / todo status,
- constraints,
- risks,
- resume command.

This makes `TASK.md` the operational bridge between orchestrators.

## Environment Assumptions

### Claude environment

- Windows 11 native, not WSL
- PowerShell as primary shell
- VS Code with Claude Code extension

### Codex environment

From `C:/Users/barto/.codex/config.toml`:

- model: `gpt-5.4`
- reasoning effort: `medium`
- approval mode: `never`
- sandbox mode: `workspace-write`
- Windows sandbox: `elevated`
- shell and git enabled

## Effective Workflow Today

In practical terms, the current workflow is:

1. Claude gathers enough context to plan the task.
2. Large reads are pushed away from Claude toward `codex-dad`.
3. Most medium or large writes are pushed away from Claude toward Codex workers.
4. `codex-main` is the general implementation worker.
5. `codex-dad` is the large-context / SQL / summarization specialist.
6. Type errors and generated output are reviewed after worker execution.
7. If Claude context becomes too large, a `TASK.md` handoff is written.
8. Codex can then continue as fallback orchestrator.

## Major Inconsistencies

These are the most important architectural tensions in the current setup.

### 1. Orchestrator ownership is inconsistent

Global Claude layer says:
- Claude is the orchestrator.

Global Codex layer says:
- Codex should handle planning, implementation, and final technical decisions directly.

Repository layer says:
- Claude is primary orchestrator,
- but fallback orchestration belongs to Codex.

Net effect:
- there is no single stable top-level owner across all instruction layers.

### 2. Review ownership is inconsistent

Repository layer:
- delegated output should receive Codex review,
- critical validation belongs to Codex.

Global Claude layer:
- review and TS fixes after generation can go to `codex-dad`.

Net effect:
- the final reviewer is not consistently defined.

### 3. Thresholds differ by layer

Examples:
- repo: new TS/TSX 20-150 lines -> Codex CLI, >150 -> `codex-dad`
- global Claude: new TS/TSX of any size -> `codex-main`
- hooks: any code write >20 lines is blocked and must be delegated
- hooks: code edit >50 lines is blocked and must be delegated

Net effect:
- delegation logic depends on which layer is consulted first.

### 4. `codex-dad` has overlapping responsibilities

Depending on the file:
- reader,
- summarizer,
- SQL specialist,
- first-pass drafter,
- TS fixer,
- sometimes reviewer.

Net effect:
- `codex-dad` is both analysis worker and quality gate candidate, which blurs ownership.

### 5. Runtime hooks contain stale or conflicting assumptions

Notable examples:
- hook messages still suggest old Codex invocation patterns
- token watchdog suggests a different first-reader model strategy than current project guidance
- project guidance says not to use Gemini-first, but watchdog text still references a Gemini-first path

Net effect:
- enforced behavior and documented behavior are partially out of sync.

### 6. The workflow depends on files outside the repository

Critical instructions live in:
- `C:/Users/barto/.claude/*`
- `C:/Users/barto/.codex/*`

Net effect:
- repository-only analysis is incomplete,
- portability is low,
- reproduction by another machine or teammate is harder.

### 7. Encoding quality is inconsistent

Observed during inspection:
- some local markdown content displayed with mojibake / encoding artifacts

Net effect:
- human readability drops,
- parsing and reuse in research or automation becomes less reliable.

## Strengths Of The Current Setup

- strong separation between orchestration and execution
- explicit protection against wasting Claude context on large reads
- explicit handoff protocol via `TASK.md`
- useful specialization of `codex-dad` for large context and SQL
- clear awareness of sensitive domains such as auth, payments, permissions, and migrations
- practical emphasis on post-generation validation

## Main Weaknesses Of The Current Setup

- too many overlapping instruction layers
- inconsistent ownership of planning and review
- stale hook guidance relative to current preferred commands
- mixed thresholds and split logic across files
- operational dependency on personal global config outside the repo
- some workflow rules are documented, others are actually enforced, and they do not fully match

## Questions Worth Sending To Deep Research

- What is the cleanest single-owner orchestration model for this setup: Claude-first or Codex-first?
- Should `codex-dad` remain a mixed role, or should it be narrowed to reader/drafter only?
- What is the best stable split between `codex-main` and `codex-dad` for TS/TSX, SQL, and large-file analysis?
- Which rules should remain runtime-enforced by hooks, and which should become soft guidance only?
- How should review ownership be simplified so there is one unambiguous final quality gate?
- How can global-machine instructions be minimized or mirrored into the repository for portability?
- What is the best replacement for the current read-token watchdog behavior?

## Recommended Research Angles

- orchestration model simplification
- hook policy redesign
- delegation threshold normalization
- review ownership model
- repository-portable agent config strategy
- handoff contract design between orchestrators and workers
- observability for agent task execution and post-task learning loops

## Bottom Line

The current architecture is functional and fairly sophisticated, but it has drifted into a layered system with multiple overlapping control planes:
- repo instructions,
- global Claude instructions,
- global Codex instructions,
- runtime hooks.

The most important improvement opportunity is not adding more rules. It is reducing ambiguity by selecting one primary orchestrator model, one final reviewer, one delegation threshold map, and one synchronized enforcement layer.
