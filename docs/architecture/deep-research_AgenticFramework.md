# Agentic Workflow Architecture

## Architectural principle

This workflow is **single-orchestrator, repo-first, enforcement-light-but-real**.

One agent owns the outcome end-to-end. Everyone else is a bounded worker with explicit inputs/outputs, no “soft ownership”, no surprise policy layers. The repository is the only durable source of truth for behaviour: if a rule matters, it lives in the repo, is reviewable, and travels with the codebase.

The system optimises for three things (in this order): **shipping correct code**, **not wasting context**, and **keeping the process teachable**. “Agentic” here means: deterministic guardrails + predictable artefacts + fast parallel execution, not vibes. The orchestration model intentionally resembles modern workflow engines (explicit state, resumability, fan-out/fan-in, human checkpoints) rather than a free-form group chat. citeturn0search8turn0search12turn0search9

## System roles

**Primary orchestrator (single owner): Claude.**  
Claude owns the task from intake to ship/no-ship. Claude creates/updates the handoff artefact, decides delegation, resolves conflicts, and is the only role allowed to declare “done”. No other role can silently “finish” work. (Yes, it’s strict on purpose.)

**Final review authority (single quality gate owner): Claude.**  
Codex can pre-review and propose fixes, but **Claude is the final technical acceptance gate**. CI gates merges; Claude gates decision. (You want both, but only one person/agent owns the decision.)

**Execution plane: Codex.** Codex is treated as an operator that edits code, runs commands, and produces diffs and evidence. It is never treated as the top-level owner of intent. Codex’s own guidance model explicitly rewards “explicit context + definition of done + verification”, which this workflow bakes into the contract. citeturn2view0

**Role set (minimal, stable, non-overlapping):**

**Claude (Orchestrator & Ship Gate)**
- Purpose: Convert intent into an executable work item, dispatch work packages to workers, integrate results, and own final judgement.
- Must do: define acceptance criteria, define verification commands, decide scope boundaries, adjudicate trade-offs, approve/deny ship.
- Must not do: long implementation edits across many files (unless explicitly operating as a “micro-change” exception); ad-hoc tool execution with unclear audit trail.

**codex-main (Implementation Worker)**
- Purpose: Implement work packages by editing the repo and running the defined verification steps; return a clean diff + evidence.
- Must do: operate on a branch/worktree, keep changes scoped to the package, run the specified checks, report commands + results.
- Must not do: redefine requirements, broaden scope, or “fix unrelated stuff”. No policy authorship.

**codex-dad (Context Steward)**
- Purpose: **Large-context reading and synthesis only**. Creates compact “context packs” (summaries + pointers) and risk notes to reduce waste for everyone else.
- Must do: summarise with file-path anchors, identify hotspots, extract constraints, produce a short risk checklist.
- Must not do: implement code, refactor opportunistically, write migrations, or act as final reviewer. This role exists specifically to stop “one agent does everything”.

That’s it. No extra named roles unless they are introduced via the evolution mechanism defined later.

## Control plane

There is **one control plane**: the repository.

Everything that affects behaviour lives in three repo-native layers:

**Project guidance (human + agent readable): `AGENTS.md`**  
This is the canonical instruction surface across coding agents. Codex explicitly loads `AGENTS.md` (and can layer it from repo root down to the working directory) before doing work, and it caps instruction size (default 32 KiB) — which is perfect: it forces brevity. citeturn4view1turn0search19  
This workflow treats `AGENTS.md` as the *single* durable “how to work here” briefing.

**Codex runtime policy: `.codex/`**
- `.codex/config.toml` holds project-scoped overrides. Codex supports project config with clear precedence (CLI flags > profile > project config > user config). citeturn4view0  
- `.codex/rules/` defines command allow/prompt/forbid policies with match-testing (“inline unit tests” for rules). citeturn4view2  
- `.codex/hooks.json` defines minimal lifecycle hooks for deterministic checks and logging. citeturn4view3

**CI quality gates and merge policy: `.github/` (or equivalent)**  
This is the enforcement anchor that prevents “looks fine” merges. GitHub can require status checks to pass before merging to protected branches. citeturn1search2turn1search31

**Global machine config is explicitly non-authoritative.**  
Codex can read global instruction files in `~/.codex` (e.g. global `AGENTS.md`), but this architecture forbids storing any repo-required behaviour globally. Global config may exist only for authentication, personal UX preferences, and tool installation paths. If global guidance conflicts with repo guidance, **repo wins**. citeturn4view0turn4view1

## Orchestration model

This workflow runs as an explicit, repeatable state machine, with one durable artefact acting as the “truth ledger”.

**Execution states**
- **Intake**: Claude converts the user request into a work item with constraints and verification steps.
- **Plan**: Claude splits into work packages that can be executed independently (including parallel packages).
- **Dispatch**: Claude assigns each package to a specific worker instance (usually codex-main; codex-dad only for context packs).
- **Execute**: Workers act, producing diffs + evidence.
- **Integrate**: Claude merges packages conceptually (and literally, if needed), resolves conflicts, requests follow-up deltas if evidence is weak.
- **Review**: Claude performs final review against acceptance criteria and CI results.
- **Close**: Claude marks ship/no-ship and records the final decision in the handoff artefact.

This is intentionally aligned with modern agent workflow practice: explicit control paths, fan-out/fan-in, resumability, and human-in-the-loop checkpoints rather than free-form multi-agent chatter. citeturn0search5turn0search12turn0search6

**Parallelism model**
- Parallelism happens at the **work package** level, not at the “everyone talk at once” level.
- Each package runs in its own branch/worktree to avoid cross-contamination.
- Claude is the only fan-in point (single arbiter), so decision-making stays crisp.

**Resumption model**
- Every worker run is resumable because the workflow persists: package intent, current status, tested commands, and evidence are written to the handoff artefact and run logs (defined later).
- No one relies on “what I remember from the chat”; the repo is the memory.

## Delegation policy

Delegation is decided by **work type and risk**, not by line counts.

**Direct work (Claude does it)**
- Requirements clarification, acceptance criteria, sequencing decisions, trade-off calls.
- Small text-only edits where the verification surface is trivial (README tweaks, wording fixes), *only if* it doesn’t risk drifting from code reality.

**Delegated implementation (codex-main does it)**
- Any change that touches code, build config, tests, refactors, or multi-file edits.
- Any task that requires running commands (tests, linters, generators, migrations, formatting), because reproducible evidence matters.

Codex workflows explicitly emphasise: provide explicit context, define “done”, and validate output — that maps 1:1 to codex-main’s job here. citeturn2view0

**Large-context reading (codex-dad does it)**
Use codex-dad when the task requires one of the following:
- Building a mental model across many files/modules before a safe plan can exist.
- Extracting implicit conventions (testing patterns, architectural seams, error-handling norms).
- Producing a risk map for changes in high-coupling areas.

Output contract is always a **Context Pack**, never code. (Schema is defined in the handoff section.)

**SQL and migrations**
- Default: codex-main implements migrations **only when the migration is straightforward and fully verifiable locally**.
- Mandatory constraints for any migration work package:
  - explicit rollback strategy,
  - idempotency notes (where applicable),
  - verification commands (including “before/after” checks),
  - no destructive operations without an explicit approval checkpoint.

This maps to tool-safety practice: tools that can cause destructive changes require explicit consent and clear user understanding. citeturn1search3turn1search28

**Reviews**
- codex-main may run local review tooling (e.g. Codex `/review`) as a *pre-flight*, but it is not authoritative. citeturn2view0  
- Claude is the only final reviewer.

**Sensitive domains**
Anything security-sensitive, data-destructive, or production-impacting triggers a hard rule:
- codex-main may propose changes and evidence,
- Claude must explicitly approve before any irreversible step,
- CI must be green before ship is allowed.

## Review and quality gate

This workflow has exactly one decision-maker and exactly one merge gate.

**Final technical acceptance (ship/no-ship): Claude**
Claude checks, in order:
1. Acceptance criteria satisfied (as written in the work item).
2. Evidence provided (commands run, outputs summarised, edge cases addressed).
3. Diff sanity (scope, layering, conventions, test coverage).
4. CI status checks green on the target branch.

**Merge gate: CI-required status checks**
Protected branches require passing checks before merge; no exceptions, no “I’ll fix it later”. citeturn1search2turn1search31

**What “done” means**
A work package is only complete when it includes:
- file list changed,
- explanation of the change,
- commands run,
- results,
- follow-ups (if something could not be verified).

This directly matches Codex’s own recommended workflow pattern: context notes + verification steps, especially in CLI mode where you must specify paths and validate output rather than assuming the agent “saw everything”. citeturn2view0

## Runtime enforcement

Enforcement is deliberately thin, but non-negotiable where it matters. Hard guardrails prevent foot-guns. Soft guidance reduces friction.

**Hard guardrails**

**Codex command governance via rules**
- `.codex/rules/` defines:
  - allowlisted safe commands (read/search/build/test),
  - prompted commands (network calls, package installs, environment changes),
  - forbidden commands (destructive shell wrappers, dangerous deletes, obvious exfil patterns).
- Rules support `allow`, `prompt`, and `forbidden`, and they support match/not-match examples for validation. citeturn4view2  
This is the main tool-governance mechanism. It’s deterministic and auditable.

**Codex sandbox + approvals**
- Use a sandbox mode that allows writing to the workspace but does not silently grant broad system access.
- Approval policy defaults to “on request” for anything outside the safe allowlist, so “I didn’t mean to run that” doesn’t happen. Codex supports these controls via config. citeturn4view0

**Merge protection**
- The protected-branch required checks are the final merge barrier. citeturn1search2

**Tool safety for external integrations (MCP-first)**
- External tools (APIs, ticketing systems, secrets managers, databases) are accessed via MCP servers configured explicitly, not via ad-hoc scripts.
- MCP’s own spec calls out tool execution risk and the need for explicit user consent and caution around tool metadata. citeturn1search3turn1search7

**Soft guidance**

**Codex lifecycle hooks for lightweight hygiene**
Hooks are used sparingly because they run concurrently and are experimental; they exist for logging and gentle validation, not for brittle “stop-the-world” policing. Codex hooks explicitly support things like prompt scanning for secrets, end-of-turn validation, and summarisation for persistent memory. citeturn4view3

**Local developer hooks**
If local hooks are used, they must be repo-installed and portable. Lefthook is preferred here because it’s fast, can run tasks in parallel, and is designed specifically as a git hook manager with a simple repo config. citeturn1search1turn1search5  
(And yes, I’m biased toward fast hooks — slow hooks get disabled, every time.)

## Context economy and handoff contract

This is where the workflow wins or loses in real life. The rule is simple: **read less, remember more, and make memory portable.**

**Context economy model**

**Retrieval-first, not dump-first**
- Workers start with targeted search (`rg`, file lists, symbol traces) and only expand reads when needed.
- Codex workflows explicitly note that the CLI often needs explicit paths and attachments; this architecture leans into that instead of pretending “the agent saw it”. citeturn2view0

**Context Packs instead of “big reads”**
- codex-dad produces Context Packs for large reading tasks.
- A Context Pack is a compact synthesis with hard anchors (file paths, key functions, invariants, pitfalls). It is designed to be pasted into a worker without dragging the whole repo into the context window.

**Batch tool execution to reduce context bloat**
When tool use is involved, prefer batching and summarising results before they enter the main conversation context. This matches the direction of modern tool orchestration approaches that explicitly aim to control what enters the context window and enable parallel tool execution. citeturn0search4

**No “hard read watchdog”**
The old-style “blocking” watchdog pattern is replaced with:
- explicit Context Pack outputs for large reads,
- evidence requirements in the handoff contract,
- deterministic command governance (rules + sandbox) for safety.

This keeps discipline without the annoying “computer says no” vibe.

**Handoff contract**

There is exactly one handoff artefact: **`WORK.md` at repo root** (or `work/WORK-<slug>.md` for multiple concurrent efforts). This replaces ad-hoc notes and becomes the resumable ledger.

It has a fixed schema. No deviations.

```md
# Work Item: <slug>

## Owner
- Orchestrator: Claude
- Active worker(s): codex-main | codex-dad
- Status: intake | plan | dispatch | execute | integrate | review | closed

## Intent
One paragraph: what outcome we want and why.

## Constraints
Bullet list: API stability, performance, security, “don’t touch X”, etc.

## Acceptance criteria
Checkbox list, written as verifiable statements.

## Verification
Exact commands to run (local and CI-relevant). Include smallest-sufficient set.

## Work packages
Each package:
- ID:
- Type: context-pack | implementation | migration | refactor | docs | review
- Inputs: files/dirs, context pack refs, constraints
- Outputs: expected diffs + evidence

## Evidence log
Append-only:
- Timestamp
- Package ID
- Files changed
- Commands run + results
- Open issues / follow-ups

## Decision
When closed:
- Ship: yes/no
- Why (short)
- Risks accepted (if any)
```

This schema enforces clarity (“definition of done”) and makes recovery painless after interruptions.

## Repository portability, observability, evolution, operating rules, anti-patterns, final summary

**Repository portability model**

Repo portability is achieved by making the repo self-describing and self-governing:

- `AGENTS.md` provides the portable “how to work here” briefing, and is explicitly designed to travel across tools and repos. citeturn0search19turn4view1  
- `.codex/config.toml` and `.codex/rules/` carry runtime policy with clear precedence; workers don’t depend on hidden user defaults. citeturn4view0turn4view2  
- `.codex/hooks.json` provides minimal lifecycle automation without inventing a second policy language. citeturn4view3  
- CI config is in-repo, and branch rules enforce the checks. citeturn1search2

Global-only requirements are limited to:
- authentication tokens/keys,
- installing the CLI tooling,
- optional local UX preferences.

Nothing “important” is allowed to live only on one developer’s laptop.

**Observability and learning loop**

Observability is minimal but sufficient. The goal is replayability, not surveillance.

Each run produces:
- the updated `WORK.md` evidence log (human-readable ledger),
- a machine-readable run record (JSON) stored under `ai/runs/<run-id>.json` (gitignored) containing:
  - packages executed,
  - commands invoked,
  - pass/fail outcomes,
  - links to diffs/commit SHAs.

Codex hooks are allowed to emit these logs because hooks are explicitly intended for logging/analytics, turn-end validation, and summarisation. citeturn4view3

Learning loop rules:
- If a failure repeats twice (same class of issue), it becomes a repo-level rule: either a new check in CI, a new command rule, or an update to `AGENTS.md`.
- No “silent folklore”. If it matters, codify it.

**Future evolution model**

Evolution is controlled by a single mechanism: **versioned workflow amendments in-repo**.

- Changes to roles, enforcement, or handoff schema require a short RFC-style note appended under `ai/workflow-amendments/` with:
  - what changes,
  - why,
  - how it is enforced,
  - how it avoids duplicating an existing control plane.

This keeps the system flexible without drifting back into chaos.

**Operating rules**

Day-to-day rules are short and enforceable:

- Claude is the only orchestrator and the only ship gate.
- All work runs through `WORK.md`. No side channels, no “remember what I said earlier”.
- codex-main only implements what’s in a work package; scope changes require Claude approval.
- codex-dad produces Context Packs only; it never commits code.
- Every package must end with evidence: files changed + commands run + results.
- Protected branches require passing CI checks before merge. citeturn1search2
- External tool access is MCP-declared and consent-driven; no mystery scripts. citeturn1search3turn1search7
- Repo rules override global defaults (Codex config precedence makes this practical). citeturn4view0
- Prompting style stays lean: avoid overprompting and blanket “always use X tool” defaults; trigger tools when they genuinely help. citeturn0search0

**Anti-patterns**

These behaviours are forbidden:

- “Everyone can review everything” → diluted ownership and endless debate.
- codex-dad implementing code “because it was already reading” → immediate role collapse.
- Hidden global machine rules required for correctness → breaks portability and auditability.
- Unbounded refactors inside unrelated tasks → destroys throughput.
- Shipping without reproducible verification commands and results.
- Using hooks as brittle blocking mechanisms (they’re not designed for that, and you’ll hate your life). citeturn4view3
- Ad-hoc external tool calls without explicit consent and governance (especially for destructive tools). citeturn1search3

**Final recommended architecture**

A **single-orchestrator** workflow where **Claude owns intent, delegation, integration, and ship/no-ship**, and **Codex (codex-main) executes bounded work packages** under **repo-defined rules, sandboxing, and CI gates**. **codex-dad is strictly a Context Steward** that produces portable Context Packs to reduce context waste, never code. Governance is **repo-first** via `AGENTS.md`, `.codex/config.toml`, `.codex/rules/`, `.codex/hooks.json`, and CI-required status checks, with global config restricted to authentication and personal UX. The handoff is a single durable ledger (`WORK.md`) with a fixed schema that makes the whole system resumable, parallelisable, auditable, and genuinely easy to teach.