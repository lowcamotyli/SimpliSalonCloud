# Sprint B2-01 — DB: booksy_gmail_accounts

## Cel

Dodac tabele `booksy_gmail_accounts` jako baze pod multi-mailbox oraz bezpieczne przechowywanie tokenow OAuth w postaci zaszyfrowanej.

## Faza + Wave

- Faza: 0.5
- Wave: 1
- Worker: codex-dad (SQL migration)
- Migration file: `supabase/migrations/20260420000001_booksy_gmail_accounts.sql`

## Zakres

- [ ] Utworzyc tabele `booksy_gmail_accounts`
- [ ] Dodac wszystkie kolumny ze specyfikacji:
  - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
  - `salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE`
  - `gmail_email TEXT NOT NULL`
  - `display_name TEXT`
  - `encrypted_access_token TEXT NOT NULL`
  - `encrypted_refresh_token TEXT NOT NULL`
  - `token_expires_at TIMESTAMPTZ`
  - `auth_status TEXT NOT NULL DEFAULT 'active' CHECK (auth_status IN ('active','revoked','expired','error'))`
  - `is_active BOOLEAN NOT NULL DEFAULT true`
  - `is_primary BOOLEAN NOT NULL DEFAULT false`
  - `last_auth_at TIMESTAMPTZ`
  - `last_error TEXT`
  - `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
  - `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- [ ] Dodac `UNIQUE(salon_id, gmail_email)`
- [ ] Dodac partial unique index: jeden primary mailbox per salon, `UNIQUE(salon_id) WHERE is_primary = true`
- [ ] Dodac indeksy pod klucze obce i uzycia operacyjne
- [ ] Wlaczyc RLS na tabeli
- [ ] Dodac polityke `SELECT` dla roli `authenticated`, ktora nie eksponuje `encrypted_access_token` ani `encrypted_refresh_token`
- [ ] Dodac polityki `INSERT/UPDATE/DELETE` z warunkiem `salon_id = get_user_salon_id()`
- [ ] Zostawic notatke o dopisaniu `BOOKSY_TOKEN_ENCRYPTION_KEY` do `.env.example` (32 bajty hex)

## Pliki

| Plik | Akcja | Worker |
|------|-------|--------|
| `supabase/migrations/20260420000001_booksy_gmail_accounts.sql` | CREATE | codex-dad |
| `.env.example` | MODIFY (dopisz `BOOKSY_TOKEN_ENCRYPTION_KEY`) | Claude / codex-main po migracji |
| `types/supabase.ts` | REGENERATE po `supabase db push` | Claude / codex-main |

## Zaleznosci

- Wymaga: B2-00
- Blokuje: B2-02, B2-03
- Parallel z: brak

## Prompt — codex-dad (SQL migration)

```bash
$env:DAD_PROMPT="Read .workflow/skills/sql-migration-safe.md and follow it.
Read /mnt/d/SimpliSalonCLoud/sprints/Booksy2.0/_SPRINT_SPEC.md, /mnt/d/SimpliSalonCLoud/supabase/migrations and /mnt/d/SimpliSalonCLoud/.env.example.
TASK: Create migration /mnt/d/SimpliSalonCLoud/supabase/migrations/20260420000001_booksy_gmail_accounts.sql for table booksy_gmail_accounts.
REQUIREMENTS:
- Add columns exactly: id UUID PK DEFAULT gen_random_uuid(); salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE; gmail_email TEXT NOT NULL; display_name TEXT; encrypted_access_token TEXT NOT NULL; encrypted_refresh_token TEXT NOT NULL; token_expires_at TIMESTAMPTZ; auth_status TEXT NOT NULL DEFAULT 'active' CHECK auth_status IN ('active','revoked','expired','error'); is_active BOOLEAN NOT NULL DEFAULT true; is_primary BOOLEAN NOT NULL DEFAULT false; last_auth_at TIMESTAMPTZ; last_error TEXT; created_at TIMESTAMPTZ NOT NULL DEFAULT now(); updated_at TIMESTAMPTZ NOT NULL DEFAULT now().
- Add UNIQUE(salon_id, gmail_email).
- Add partial unique index enforcing one primary mailbox per salon: UNIQUE(salon_id) WHERE is_primary = true.
- Add indexes for salon_id and other FK/lookup paths as needed by the skill.
- Enable RLS.
- RLS spec: SELECT for authenticated must not expose encrypted_access_token or encrypted_refresh_token; implement this safely using SQL objects/policies that preserve hidden token storage. INSERT/UPDATE/DELETE must require salon_id = get_user_salon_id().
- Respect multi-tenant helpers already used in repo; do not recreate get_user_salon_id().
- Note in output that .env.example must include BOOKSY_TOKEN_ENCRYPTION_KEY with value description '32 bytes hex'.
OUTPUT: migration file only, plus short risk notes and rollback posture summary."
& 'D:\Git\bin\bash.exe' "$HOME/.claude/scripts/dad-exec.sh"
```

## Po migracji — OBOWIAZKOWE

```bash
supabase db push
supabase gen types typescript --linked > types/supabase.ts
npx tsc --noEmit
```
