# TASK - Main Cutover from feature/multi-booking - 2026-03-23

## Objective
Przygotowac bezpieczne przejscie stabilnej wersji produktu z `feature/multi-booking` na `main`.
Zakres releasu obejmuje zmiany rozwijane w obszarach `SS2.0` i `SS2.1`, z naciskiem na booking, kalendarz, formularze, przypomnienia i powiazane migracje.

## Context files to read
- `AGENTS.md` - zasady pracy w repo i odpowiedzialnosci przy merge/release.
- `docs/SS2.0/` - zakres funkcjonalny i architektoniczny zmian z SS2.0.
- `docs/sprints/SS2.1/` - sprinty i aktywny zakres SS2.1.
- `tests/SS2.1/` - scenariusze testowe do smoke/UAT.
- `plans/main-cutover/RELEASE_CHECKLIST.md` - lista kontrolna merge/deploy.

## Status
- [x] Done: przygotowany plan podejscia do merge `feature/multi-booking -> main`
- [x] Done: przygotowana checklista release/cutover
- [x] Done: release commit SHA = `e73a99c44cf0ec955b7d70521e946068416d5232`
- [x] Done: `npx tsc --noEmit` clean na release branch
- [x] Done: utworzony branch `release/ss2-main-cutover` od release SHA
- [x] Done: PR otwarty — https://github.com/lowcamotyli/SimpliSalonCloud/pull/1
- [ ] NEXT: sprawdzic drift migracji — `supabase migration list --linked` vs lista 54 migracji w PR
- [ ] NEXT: wykonac backup bazy PROD przed mergiem
- [ ] NEXT: smoke test krytycznych flow (booking, multi-booking, forms, surveys, payments)
- [ ] TODO: wykonac merge PR #1 do `main` w oknie wdrozeniowym
- [ ] TODO: weryfikacja post-deploy (logi Vercel + Supabase, smoke test na PROD)

## Key decisions / constraints
- `feature/multi-booking` jest obecnie stabilnym zrodlem prawdy; `main` jest historycznie opozniony.
- Nie robic masowego cherry-pickowania zmian z `SS2.0` i `SS2.1` do `main`.
- Nie robic agresywnego rebase na starym `main`, jesli nie ma bardzo mocnego powodu.
- Zalecany przeplyw: `feature/multi-booking` -> `release/ss2-main-cutover` -> PR -> `main`.
- Merge do `main` dopiero po przejsciu checklisty migracji, env i smoke testow.

## Open risks / assumptions
- Ryzyko driftu migracji i rozjazdu stanu Supabase miedzy branchami/srodowiskami.
- Ryzyko nieudokumentowanych zaleznosci w env, cronach, webhookach i integracjach.
- Ryzyko duzego diffu do `main`, utrudniajacego review bez checklisty zakresowej.
- Zakladam, ze glowny zakres releasu jest rzeczywiscie skoncentrowany w `SS2.0` i `SS2.1`.

## Resume command
codex exec --dangerously-bypass-approvals-and-sandbox "Read plans/main-cutover/TASK.md, plans/main-cutover/RELEASE_CHECKLIST.md, AGENTS.md, docs/SS2.0, docs/sprints/SS2.1, tests/SS2.1 for context. Prepare the next concrete step for merging feature/multi-booking into main. Do not modify main. Write directly."
