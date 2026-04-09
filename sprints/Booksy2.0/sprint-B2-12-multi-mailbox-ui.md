# Sprint B2-12 — multi-mailbox-ui
## Cel
Przebudować UI integracji Booksy na multi-mailbox z health per skrzynka i akcjami operatora.

## Faza + Wave (Wave 8 — Parallel z: Brak)
Faza 3, Wave 8.

## Architektura — dokumenty referencyjne (dad reader command for relevant arch doc)
```bash
DAD_PROMPT='Read /mnt/d/SimpliSalonCLoud/docs/architecture/booksy-option-b-implementation.md. TASK: Extract UI architecture for multi-mailbox management and operator actions for B2-12. FORMAT: component responsibilities + data flow.' bash ~/.claude/scripts/dad-exec.sh
```

## Zakres (checkbox list of what to build)
- [ ] Refactor `booksy/page.tsx` z single mailbox na listę skrzynek.
- [ ] Pobierać `booksy_gmail_accounts` (bez tokenów) oraz health z `/api/integrations/booksy/health`.
- [ ] Dodać komponent `MailboxList`.
- [ ] Dodać komponent `MailboxHealthCard`.
- [ ] Dodać komponent `AddMailboxButton` (OAuth redirect z `action=connect_new_mailbox` w state).
- [ ] Dodać akcje operatora: Add mailbox, Set as primary, Deactivate, Reconnect, Renew watch, Replay 24h, Full reconcile 14 days.

## Pliki (table: Plik | Akcja | Worker)
| Plik | Akcja | Worker |
|---|---|---|
| `app/(dashboard)/[slug]/settings/integrations/booksy/page.tsx` | MODIFY | codex-main |
| `components/integrations/booksy/MailboxList.tsx` | CREATE | codex-dad |
| `components/integrations/booksy/MailboxHealthCard.tsx` | CREATE | codex-dad |
| `components/integrations/booksy/AddMailboxButton.tsx` | CREATE | codex-dad |

## Zaleznosci (Wymaga: / Blokuje: / Parallel z:)
Wymaga: B2-10, B2-11  
Blokuje: Brak  
Parallel z: Brak

## Prompt — codex-main + codex-dad (multi-mailbox Booksy UI)
```bash
codex exec --dangerously-bypass-approvals-and-sandbox 'Read .workflow/skills/scoped-implementation.md and follow it. Read d:/SimpliSalonCLoud/sprints/Booksy2.0/_SPRINT_SPEC.md and implement B2-12. Modify d:/SimpliSalonCLoud/app/(dashboard)/[slug]/settings/integrations/booksy/page.tsx to load multiple booksy_gmail_accounts (without tokens) plus health from /api/integrations/booksy/health and render mailbox list UI instead of single-mailbox view. Create d:/SimpliSalonCLoud/components/integrations/booksy/MailboxList.tsx, d:/SimpliSalonCLoud/components/integrations/booksy/MailboxHealthCard.tsx, d:/SimpliSalonCLoud/components/integrations/booksy/AddMailboxButton.tsx. Include actions: Add mailbox, Set as primary, Deactivate, Reconnect on auth error, Renew watch, Replay 24h, Full reconcile 14 days. Add OAuth redirect state action=connect_new_mailbox. Run npx tsc --noEmit and report evidence.'
```
```bash
DAD_PROMPT='Read .workflow/skills/scoped-implementation.md and follow it. Read /mnt/d/SimpliSalonCLoud/sprints/Booksy2.0/_SPRINT_SPEC.md and implement only component scope for B2-12. Create /mnt/d/SimpliSalonCLoud/components/integrations/booksy/MailboxList.tsx, /mnt/d/SimpliSalonCLoud/components/integrations/booksy/MailboxHealthCard.tsx, and /mnt/d/SimpliSalonCLoud/components/integrations/booksy/AddMailboxButton.tsx. Build multi-mailbox list/cards with operator actions and add-mailbox OAuth redirect state action=connect_new_mailbox.' bash ~/.claude/scripts/dad-exec.sh
```

## Po sprincie — OBOWIAZKOWE
```bash
cd /mnt/d/SimpliSalonCLoud
npx tsc --noEmit
git diff --name-only
```
