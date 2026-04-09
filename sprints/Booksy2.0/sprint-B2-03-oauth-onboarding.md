# Sprint B2-03 — OAuth onboarding refactor

## Cel

Przepisac onboarding OAuth tak, aby callback zapisywal skrzynki do `booksy_gmail_accounts` zamiast do `salon_settings`, obslugiwal wiele mailboxow i korzystal z szyfrowania tokenow.

## Faza + Wave

- Faza: 1
- Wave: 3
- Workers: codex-main (`callback/route.ts`) + codex-dad (`lib/booksy/gmail-auth.ts`)

## Zakres

- [ ] Zmodyfikowac `app/api/integrations/gmail/callback/route.ts`, aby robil upsert do `booksy_gmail_accounts`
- [ ] Czytac `state` z akcjami `connect_new_mailbox` oraz `reconnect_mailbox`
- [ ] Szyfrowac `access_token` i `refresh_token` przez `lib/booksy/gmail-auth.ts`
- [ ] Dodac nowy plik `lib/booksy/gmail-auth.ts` z API:
  - `encrypt(token: string): string`
  - `decrypt(encrypted: string): string`
  - `getDecryptedTokens(accountId, supabase)`
- [ ] Uzyc AES-256-GCM i klucza z `BOOKSY_TOKEN_ENCRYPTION_KEY`
- [ ] Obsluzyc `error state` z OAuth, np. `access_denied`, z redirectem zawierajacym `error`
- [ ] Zachowac obecna logike redirect po OAuth
- [ ] Nie trzymac odszyfrowanych tokenow w pamieci dluzej niz to konieczne

## Pliki

| Plik | Akcja | Worker |
|------|-------|--------|
| `app/api/integrations/gmail/callback/route.ts` | MODIFY | codex-main |
| `lib/booksy/gmail-auth.ts` | CREATE | codex-dad |
| `.env.example` | VERIFY ze zawiera `BOOKSY_TOKEN_ENCRYPTION_KEY` po B2-01 | Claude / codex-main |

## Zaleznosci

- Wymaga: B2-01
- Blokuje: B2-04
- Parallel z: B2-05

## Architektura — dokumenty referencyjne

```bash
$env:DAD_PROMPT="Read /mnt/d/SimpliSalonCLoud/docs/architecture/integration-architecture.md and /mnt/d/SimpliSalonCLoud/docs/architecture/security-model.md.
TASK: Summarize only the constraints relevant to Gmail OAuth callback token handling, redirect behavior, encryption boundaries, and multi-tenant salon scoping.
FORMAT: Bullet list.
LIMIT: Max 20 lines per file."
& 'D:\Git\bin\bash.exe' "$HOME/.claude/scripts/dad-exec.sh"
```

## Prompt — codex-main (callback refactor)

```bash
codex exec --dangerously-bypass-approvals-and-sandbox "Read .workflow/skills/scoped-implementation.md and follow it.
Read app/api/integrations/gmail/callback/route.ts, lib/booksy/gmail-auth.ts, and sprints/Booksy2.0/_SPRINT_SPEC.md for context.
TASK: Refactor Gmail OAuth callback to write mailbox connections into booksy_gmail_accounts instead of salon_settings.
CONSTRAINTS:
- Preserve existing redirect behavior after OAuth success.
- Handle state.action values connect_new_mailbox and reconnect_mailbox.
- Handle OAuth error cases such as access_denied by redirecting with an error param.
- Encrypt access and refresh tokens using lib/booksy/gmail-auth.ts before persisting.
- Do not keep decrypted tokens in memory longer than needed.
- Keep tenant scoping correct for salon-bound queries.
ACCEPTANCE CRITERION: Successful OAuth callback upserts the correct mailbox row in booksy_gmail_accounts with encrypted tokens and proper action-aware behavior, and npx tsc --noEmit stays clean.
Write changes directly."
```

## Prompt — codex-dad (gmail-auth.ts)

```bash
$env:DAD_PROMPT="Read .workflow/skills/scoped-implementation.md and follow it.
Read /mnt/d/SimpliSalonCLoud/sprints/Booksy2.0/_SPRINT_SPEC.md and any direct imports needed for /mnt/d/SimpliSalonCLoud/lib/booksy/gmail-auth.ts.
TASK: Create /mnt/d/SimpliSalonCLoud/lib/booksy/gmail-auth.ts.
REQUIREMENTS:
- Export encrypt(token: string): string and decrypt(encrypted: string): string.
- Export getDecryptedTokens(accountId, supabase).
- Use AES-256-GCM with key from BOOKSY_TOKEN_ENCRYPTION_KEY.
- Fail clearly if the env key is missing or malformed.
- Minimize plaintext token lifetime in memory and do not log secrets.
- Keep implementation bounded to this file and direct dependencies only.
OUTPUT: file content plus concise validation notes."
& 'D:\Git\bin\bash.exe' "$HOME/.claude/scripts/dad-exec.sh"
```

## Po sprincie

- Uruchomic `npx tsc --noEmit`
- Uruchomic testy impact area zgodnie z `.workflow/skills/test-impact-check.md`
- Sprawdzic, czy callback nadal poprawnie redirectuje po sukcesie i bledzie
- Potwierdzic, ze w bazie nie ma juz zapisu tokenow w `salon_settings`
