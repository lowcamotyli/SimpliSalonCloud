# Audit Log Schema — .prodready/audit/session-log.jsonl

One JSON object per line. Append only — never read this file during a task.

## Example
```json
{"ts":"2025-02-27T14:32:00Z","session":"add-auth-a1b2","task":"add-auth","size":"M","role":"reviewer","seq":3,"retries":0,"stop_line":false,"stop_line_reason":null,"gates":{"patch_scope":"PASS","lint":"PASS","unit_tests":"PASS","integration_tests":"NOT_REQUIRED","sast":"PASS","deps_scan":"PASS","container_scan":"NOT_REQUIRED","iac_scan":"NOT_REQUIRED"},"ai_tools":["gemini_pro:code_review","claude_expert:block_confirmation"],"verdict":"APPROVE","quality":4,"notes":""}
```

## Fields
- `ts` — ISO datetime
- `session` — "{task-slug}-{4 random chars}"
- `task` — task slug (kebab-case)
- `size` — XS/S/M/L/XL
- `role` — role slug
- `seq` — position in pipeline (1, 2, 3...)
- `retries` — how many times this role repeated its work
- `stop_line` — true/false
- `stop_line_reason` — string or null
- `gates` — each gate: PASS / FAIL / NOT_REQUIRED / SKIPPED
  Available: patch_scope, lint, unit_tests, integration_tests, sast, deps_scan, container_scan, iac_scan
  Use NOT_REQUIRED for gates this role does not run
- `ai_tools` — flat list of "{tool}:{reason}" strings
  tools: gemini_flash, gemini_pro, claude_expert
  reasons: file_ingestion, boilerplate, test_enumeration, code_review, block_confirmation, security_confirmation, arch_tradeoff, debug_last_resort, escalation_analysis
- `verdict` — orchestrator/architect/ask: null | implementer: APPLIED/BLOCKED | reviewer: APPROVE/CHANGES_REQUIRED/BLOCK | security: PASS/BLOCK | tester: PASS/FAIL | infra: APPLIED/BLOCK | debug: RESOLVED/ESCALATED
- `quality` — 1-5 self-assessment, null for orchestrator/architect/implementer/ask
- `notes` — short string, "" if nothing notable
