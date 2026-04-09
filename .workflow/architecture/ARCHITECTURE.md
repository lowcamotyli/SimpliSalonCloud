# Workflow Architecture Reference

## Authoritative source
`docs/architecture/deep-research_AgenticFramework.md` — read this before changing workflow structure.

## Model summary
- **Single orchestrator, repo-first, enforcement-light-but-real**
- Workflow is an explicit state machine: `Intake → Plan → Dispatch → Execute → Integrate → Review → Close`
- Optimization priority: `1) shipping correct code 2) not wasting context 3) keeping process teachable`

## Roles (stable, non-overlapping)
| Role | Owner | Must | Must Not |
|------|-------|------|----------|
| Orchestrator & Ship Gate | Claude | Convert intent to work, dispatch, integrate, final review, ship/no-ship | Long multi-file implementation, ad-hoc tooling |
| Implementation Worker | codex-main | Execute packages, run verification, return evidence | Redefine requirements, broaden scope, author policy |
| Context Steward | codex-dad | Context Packs (anchors, hotspots, risk notes); SQL/repair in this project | Implement code opportunistically, act as final reviewer |

## Skills layer
Skills are the specialization layer. Roles define ownership. Skills define execution method.

```
Claude invokes:    large-context-analysis, parallel-work-split, review-ready-diff, safe-sensitive-change
codex-main uses:   scoped-implementation, runtime-debug-triage, typescript-repair, test-impact-check, review-ready-diff
codex-dad uses:    large-context-analysis, sql-migration-safe
```

Skill files: `.workflow/skills/`
Skill governance rules: `docs/Skills Layer.txt`

## Governance files (repo-native, all must travel with code)
- `AGENTS.md` — canonical worker briefing, loaded automatically by Codex
- `.codex/config.toml` — project-scoped overrides (profiles, approval mode)
- `.codex/hooks.json` — minimal lifecycle hooks
- `.workflow/skills/` — skill definitions
- `.workflow/contracts/HANDOFF.md` — WORK.md schema
- `.workflow/policies/` — review policy, runtime guardrails
- `ai/workflow-amendments/` — versioned RFC-style changes

## Evolution mechanism
Changes to roles, enforcement, or handoff schema require a short RFC note under `ai/workflow-amendments/`.
Format: what changes, why, enforcement method, how it avoids duplicating existing control plane.
