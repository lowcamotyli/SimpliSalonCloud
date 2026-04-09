# Sprint B2-02 — DB: raw email ledger

## Cel

Dodac ledger surowych emaili i zdarzen parsera: `booksy_raw_emails`, `booksy_parsed_events`, `booksy_apply_ledger`, wraz z komentarzem o buckecie Storage.

## Faza + Wave

- Faza: 1
- Wave: 2
- Worker: codex-dad (SQL migration)
- Migration file: `supabase/migrations/20260420000002_booksy_raw_email_ledger.sql`

## Zakres

- [ ] Utworzyc tabele `booksy_raw_emails`, `booksy_parsed_events`, `booksy_apply_ledger`
- [ ] `booksy_raw_emails`:
  - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
  - `salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE`
  - `booksy_gmail_account_id UUID NOT NULL REFERENCES booksy_gmail_accounts(id) ON DELETE CASCADE`
  - `gmail_message_id TEXT NOT NULL`
  - `gmail_thread_id TEXT`
  - `gmail_history_id BIGINT`
  - `internal_date TIMESTAMPTZ`
  - `subject TEXT`
  - `from_address TEXT`
  - `message_id_header TEXT`
  - `storage_path TEXT`
  - `raw_sha256 TEXT`
  - `ingest_source TEXT NOT NULL CHECK (ingest_source IN ('watch','polling_fallback','reconciliation','manual_backfill'))`
  - `parse_status TEXT NOT NULL DEFAULT 'pending' CHECK (parse_status IN ('pending','parsed','failed'))`
  - `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
  - `UNIQUE(booksy_gmail_account_id, gmail_message_id)`
- [ ] `booksy_parsed_events`:
  - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
  - `salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE`
  - `booksy_raw_email_id UUID NOT NULL REFERENCES booksy_raw_emails(id)`
  - `parser_version TEXT NOT NULL DEFAULT 'v1'`
  - `event_type TEXT NOT NULL CHECK (event_type IN ('created','cancelled','rescheduled','unknown'))`
  - `confidence_score NUMERIC(4,3) NOT NULL`
  - `trust_score NUMERIC(4,3)`
  - `event_fingerprint TEXT NOT NULL`
  - `payload JSONB NOT NULL`
  - `status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','applied','manual_review','discarded'))`
  - `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
  - `UNIQUE(salon_id, event_fingerprint)`
- [ ] `booksy_apply_ledger`:
  - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
  - `salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE`
  - `booksy_parsed_event_id UUID REFERENCES booksy_parsed_events(id)`
  - `idempotency_key TEXT NOT NULL UNIQUE`
  - `target_table TEXT`
  - `target_id UUID`
  - `operation TEXT NOT NULL CHECK (operation IN ('created','updated','skipped','failed'))`
  - `applied_at TIMESTAMPTZ NOT NULL DEFAULT now()`
  - `error_message TEXT`
- [ ] Dodac indeksy: `booksy_raw_emails (salon_id, parse_status)` oraz `booksy_parsed_events (salon_id, status)`
- [ ] Wlaczyc RLS na wszystkich trzech tabelach
- [ ] Dodac polityki z warunkiem `salon_id = get_user_salon_id()`
- [ ] Dodac komentarz w SQL o buckecie `booksy-raw-emails` tworzonym recznie w Supabase Dashboard

## Pliki

| Plik | Akcja | Worker |
|------|-------|--------|
| `supabase/migrations/20260420000002_booksy_raw_email_ledger.sql` | CREATE | codex-dad |
| `types/supabase.ts` | REGENERATE po `supabase db push` | Claude / codex-main |

## Zaleznosci

- Wymaga: B2-01
- Blokuje: B2-03, B2-04, B2-05
- Parallel z: brak

## Prompt — codex-dad (SQL migration)

```bash
$env:DAD_PROMPT="Read .workflow/skills/sql-migration-safe.md and follow it.
Read /mnt/d/SimpliSalonCLoud/sprints/Booksy2.0/_SPRINT_SPEC.md and /mnt/d/SimpliSalonCLoud/supabase/migrations.
TASK: Create migration /mnt/d/SimpliSalonCLoud/supabase/migrations/20260420000002_booksy_raw_email_ledger.sql.
REQUIREMENTS:
- Create table booksy_raw_emails with columns exactly: id UUID PK DEFAULT gen_random_uuid(); salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE; booksy_gmail_account_id UUID NOT NULL REFERENCES booksy_gmail_accounts(id) ON DELETE CASCADE; gmail_message_id TEXT NOT NULL; gmail_thread_id TEXT; gmail_history_id BIGINT; internal_date TIMESTAMPTZ; subject TEXT; from_address TEXT; message_id_header TEXT; storage_path TEXT; raw_sha256 TEXT; ingest_source TEXT NOT NULL CHECK ingest_source IN ('watch','polling_fallback','reconciliation','manual_backfill'); parse_status TEXT NOT NULL DEFAULT 'pending' CHECK parse_status IN ('pending','parsed','failed'); created_at TIMESTAMPTZ NOT NULL DEFAULT now(); UNIQUE(booksy_gmail_account_id, gmail_message_id).
- Create table booksy_parsed_events with columns exactly: id UUID PK DEFAULT gen_random_uuid(); salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE; booksy_raw_email_id UUID NOT NULL REFERENCES booksy_raw_emails(id); parser_version TEXT NOT NULL DEFAULT 'v1'; event_type TEXT NOT NULL CHECK event_type IN ('created','cancelled','rescheduled','unknown'); confidence_score NUMERIC(4,3) NOT NULL; trust_score NUMERIC(4,3); event_fingerprint TEXT NOT NULL; payload JSONB NOT NULL; status TEXT NOT NULL DEFAULT 'pending' CHECK status IN ('pending','applied','manual_review','discarded'); created_at TIMESTAMPTZ NOT NULL DEFAULT now(); UNIQUE(salon_id, event_fingerprint).
- Create table booksy_apply_ledger with columns exactly: id UUID PK DEFAULT gen_random_uuid(); salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE; booksy_parsed_event_id UUID REFERENCES booksy_parsed_events(id); idempotency_key TEXT NOT NULL UNIQUE; target_table TEXT; target_id UUID; operation TEXT NOT NULL CHECK operation IN ('created','updated','skipped','failed'); applied_at TIMESTAMPTZ NOT NULL DEFAULT now(); error_message TEXT.
- Add indexes required by spec: booksy_raw_emails(salon_id, parse_status) and booksy_parsed_events(salon_id, status), plus FK helper indexes as needed.
- Enable RLS on all tables and add tenant policies with salon_id = get_user_salon_id().
- Include SQL comments for manual Storage bucket setup:
  -- Bucket 'booksy-raw-emails' musi byc stworzony recznie w Supabase Dashboard
  -- private, brak public access, brak limitu file size, brak ograniczen MIME dla raw .eml
  -- Path pattern w kodzie: {salon_id}/{account_id}/{year}/{month}/{gmail_message_id}.eml
OUTPUT: migration file only, plus short risk notes and rollback posture summary."
& 'D:\Git\bin\bash.exe' "$HOME/.claude/scripts/dad-exec.sh"
```

## Po migracji — OBOWIAZKOWE

```bash
supabase db push
supabase gen types typescript --linked > types/supabase.ts
npx tsc --noEmit
```
