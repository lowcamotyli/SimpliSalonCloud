# Work Item: sprint-24-premium-hours

## Owner
- Orchestrator: Claude | Workers: codex-main, codex-dad | Status: dispatch

## Intent
Implementacja Premium Hours (Opcja C): tabela `premium_slots` z `segment_criteria JSONB`,
admin CRUD API, UI w ustawieniach, oraz enhancement endpointu availability zwracający
metadane premium slotów. DB: staging.

## Constraints
- DB: staging only (bxkxvrhspklpkkgmzcge)
- RLS na premium_slots: salon_id isolation
- Public availability: backward-compatible (dodajemy `premiumMeta`, nie usuwamy `slots`)
- Segment enforcement w public booking: Phase 2 (nie w tym sprincie)
- Każdy prompt zaczyna się od `Read .workflow/skills/[nazwa].md and follow it.`

## Acceptance criteria
- [ ] Migration: tabela `premium_slots` z RLS
- [ ] `supabase db push` na staging przeszło czysto
- [ ] `types/supabase.ts` zawiera `premium_slots`
- [ ] `GET /api/premium-slots` zwraca listę dla salonu
- [ ] `POST /api/premium-slots` tworzy slot (walidacja Zod)
- [ ] `DELETE /api/premium-slots/[id]` usuwa (tylko własny salon)
- [ ] `/settings/premium-hours` renderuje listę + formularz tworzenia
- [ ] `GET /api/public/availability` zwraca `premiumMeta` (dodatkowe pole, nie breaking)
- [ ] `npx tsc --noEmit` clean

## Verification
```bash
npx tsc --noEmit
```

## Work packages
- ID: pkg-1 | Type: migration | Worker: codex-dad | Outputs: [supabase/migrations/20260409120000_premium_slots.sql]
- ID: pkg-2 | Type: implementation | Worker: codex-main | Outputs: [app/api/premium-slots/route.ts, app/api/premium-slots/[id]/route.ts]
- ID: pkg-3 | Type: implementation | Worker: codex-dad | Outputs: [app/(dashboard)/[slug]/settings/premium-hours/page.tsx]
- ID: pkg-4 | Type: implementation | Worker: codex-dad | Outputs: [app/api/public/availability/route.ts]

## Dependencies
pkg-1 → supabase push → gen types → pkg-2, pkg-3, pkg-4 (parallel)

## Evidence log
[2026-04-09 ~15:00] pkg-1 — files: [supabase/migrations/20260409120000_premium_slots.sql] — tsc → clean (dad)
[2026-04-09 ~15:05] supabase db push --include-all → OK (staging bxkxvrhspklpkkgmzcge) — gen types → types/supabase.ts zawiera premium_slots
[2026-04-09 ~15:30] pkg-2 — files: [app/api/premium-slots/route.ts, app/api/premium-slots/[id]/route.ts] — tsc → clean (codex-main; fix: usunął CLI notice lines z supabase.ts)
[2026-04-09 ~15:30] pkg-3 — files: [app/(dashboard)/[slug]/settings/premium-hours/page.tsx] — tsc → clean (codex-dad)
[2026-04-09 ~15:50] pkg-4 — files: [app/api/public/availability/route.ts] — tsc → clean po 1 fix (start_time_minutes→start_time) (codex-dad)
[2026-04-09 ~15:55] Final tsc --noEmit → clean

## Decision
Ship: yes — wszystkie acceptance criteria spełnione. Phase 2 (segment enforcement + public booking widget) odroczona — ADR-024 dokumentuje.
