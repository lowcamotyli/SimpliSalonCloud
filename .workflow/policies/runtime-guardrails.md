# Runtime Guardrails

## Enforcement principle
Thin but non-negotiable on critical risk points.
Hooks are for logging/gentle validation — not brittle stop-the-world blocking.

## Safe allowlist (always allow)
```
npx tsc --noEmit
pnpm run typecheck
pnpm run build
pnpm test
git status
git diff
git log
ls / dir
```

## Requires Claude approval (prompt / confirm)
```
supabase db push            # may affect production schema
supabase db reset           # destructive
git push                    # affects shared state
rm -rf [directory]          # destructive
DROP TABLE / DROP COLUMN    # schema destruction
DELETE FROM ... (no WHERE)  # data destruction
```

## Forbidden
```
supabase db reset --linked  # wipes linked DB
DELETE FROM table (no WHERE clause)
service_role key in client-side code
hardcoded secrets / API keys in source files
--no-verify git flags (bypasses hooks)
```

## Scope rules
- codex-main: bounded to assigned work package files only
- codex-dad: read-only for Context Packs; write only for assigned SQL/repair tasks
- Neither worker may redefine requirements or broaden scope without Claude approval

## External tool access
- External APIs and integrations must use explicitly configured paths
- No ad-hoc external calls during implementation
- Secrets via environment variables only — never inline
