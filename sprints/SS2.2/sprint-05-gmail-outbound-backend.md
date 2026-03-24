# Sprint SS2.2-05 — Gmail Outbound Integration: Backend

## Cel
Umożliwienie salonowi wysyłania e-maili transakcyjnych przez własne konto Gmail (zamiast/obok Resend).

## Architektura — dokumenty referencyjne

Przed dispatchem przeczytaj:
```bash
gemini -p "Read docs/architecture/integration-architecture.md and docs/architecture/security-model.md. Summarize: (1) how external integrations store credentials (encryption requirements), (2) OAuth flow constraints, (3) webhook verification requirements, (4) how email sending fits in the integration layer. Max 25 lines." --output-format text 2>/dev/null | grep -v "^Loaded"
```

| Dokument | Dlaczego |
|----------|----------|
| `docs/architecture/integration-architecture.md` | OAuth flow pattern, credential storage, webhook CRC, email provider abstraction |
| `docs/architecture/security-model.md` | Szyfrowanie credentials w DB (AES-256-GCM), RLS na tabelach integracji |
| `docs/architecture/multi-tenant-architecture.md` | Credentials scoped per salon — każdy salon ma własne OAuth tokens |
| `docs/architecture/bounded-contexts.md` | "Notifications" / "Integrations" context ownership |

**Kluczowe constraints:**
- Credentials integracji (OAuth tokens) **muszą** być zaszyfrowane AES-256-GCM przed zapisem w DB
- Tabela credentials: `salon_id UNIQUE` — jeden Gmail per salon
- OAuth state parameter = `salonId` — weryfikuj po powrocie z callback
- Gmail Send **osobna** OAuth app od Booksy Gmail (różne scopes: `gmail.send` vs `gmail.readonly`)
- Inbound webhook handlers nie mogą używać `getAuthContext()` — używają admin client z ręcznym `WHERE salon_id`
- `email_provider` jako pole na `salons` (nie osobna tabela) — zmiana per salon

## Kontekst architektoniczny
- **Obecna integracja Gmail** (`lib/booksy/gmail-client.ts`) — TYLKO odczyt (Booksy import). Scope: `gmail.readonly`.
- **Nowa integracja Gmail Send** — ODDZIELNA, scope: `gmail.send`. Inne credentials, inne consent screen.
- Resend zostaje jako fallback/domyślna opcja.
- Credentials integracji muszą być zaszyfrowane w DB (constraint bezpieczeństwa z architektury).

## Zakres tego sprintu
- [ ] Migracja SQL: tabela `gmail_send_credentials` (salon_id, access_token_enc, refresh_token_enc, email)
- [ ] OAuth flow: `GET /api/integrations/gmail-send` (initiate) + `GET /api/integrations/gmail-send/callback`
- [ ] Disconnect: `DELETE /api/integrations/gmail-send`
- [ ] Status: `GET /api/integrations/gmail-send/status` (czy połączone, z jakiego konta)
- [ ] Email router: `lib/email/router.ts` — wysyła przez Gmail lub Resend based on `salon_settings`
- [ ] Dodaj `email_provider: 'gmail' | 'resend'` do `salon_settings` (migracja)

## Pliki do stworzenia / modyfikacji

| Plik | Akcja | Worker |
|------|-------|--------|
| `supabase/migrations/[ts]_gmail_send_integration.sql` | CREATE | Gemini |
| `app/api/integrations/gmail-send/route.ts` | CREATE | codex-main |
| `app/api/integrations/gmail-send/callback/route.ts` | CREATE | codex-dad |
| `lib/email/router.ts` | CREATE | codex-dad |

## Zależności
- **Wymaga:** nic (sprint niezależny)
- **Blokuje:** sprint-06 (Settings UI)

---

## Krok 0 — Odczyt przed dispatchem

```bash
gemini -p "Read app/api/integrations/gmail/callback/route.ts and lib/booksy/gmail-client.ts. Summarize: OAuth flow steps, how tokens are stored, what env vars are used. Max 20 lines." --output-format text 2>/dev/null | grep -v "^Loaded"
```

---

## Prompt — Gemini (SQL migration)

```bash
gemini -p "Generate SQL migration for SimpliSalonCloud (Supabase/PostgreSQL).

Migration 1: Table gmail_send_credentials
- id UUID PRIMARY KEY DEFAULT gen_random_uuid()
- salon_id UUID NOT NULL UNIQUE REFERENCES salons(id) ON DELETE CASCADE
- gmail_address TEXT NOT NULL
- access_token_encrypted TEXT NOT NULL (store AES-256-GCM encrypted)
- refresh_token_encrypted TEXT NOT NULL
- token_expiry TIMESTAMPTZ
- created_at TIMESTAMPTZ DEFAULT now()
- updated_at TIMESTAMPTZ DEFAULT now()

Enable RLS. Policy: all operations only when salon_id = get_user_salon_id().

Migration 2: Add email_provider to salon_settings (if salon_settings is JSONB column on salons table).
Actually: add column email_provider TEXT DEFAULT 'resend' CHECK (email_provider IN ('resend', 'gmail')) to salons table.

Add index on salon_id for gmail_send_credentials.
Output pure SQL only." \
  --output-format text 2>/dev/null | grep -v "^Loaded" > "supabase/migrations/20260325000002_gmail_send_integration.sql"
```

---

## Prompt — codex-main (OAuth initiate + status + disconnect)

```bash
codex exec --dangerously-bypass-approvals-and-sandbox "Do NOT use Gemini — write directly.

Read app/api/integrations/gmail/callback/route.ts for OAuth pattern reference.
Read lib/supabase/get-auth-context.ts for auth pattern.

Goal: Create Gmail Send OAuth integration API.
File: app/api/integrations/gmail-send/route.ts

Implement:
- GET (initiate OAuth): Build Google OAuth URL with scopes=['https://www.googleapis.com/auth/gmail.send'], redirect_uri=GMAIL_SEND_REDIRECT_URI env var, state=salonId. Return { url } or redirect.
- DELETE (disconnect): Delete row from gmail_send_credentials WHERE salon_id=salonId. Update salons.email_provider='resend'.
- GET ?status=true: Return { connected: boolean; email: string | null } from gmail_send_credentials.

Env vars to use: GMAIL_SEND_CLIENT_ID, GMAIL_SEND_CLIENT_SECRET, GMAIL_SEND_REDIRECT_URI.
(These are separate from Booksy Gmail env vars to avoid scope conflicts.)
Use getAuthContext(). All queries filter by salon_id.
Done when: all three handlers created."
```

---

## Prompt — codex-dad (OAuth callback + email router)

```bash
DAD_PROMPT="Read app/api/integrations/gmail/callback/route.ts for OAuth callback pattern.

File 1: /mnt/d/SimpliSalonCLoud/app/api/integrations/gmail-send/callback/route.ts
OAuth callback for Gmail Send:
- Extract code and state (salonId) from query params
- Exchange code for tokens using GMAIL_SEND_CLIENT_ID, GMAIL_SEND_CLIENT_SECRET, GMAIL_SEND_REDIRECT_URI
- Encrypt tokens before storing (use AES-256-GCM, key from env ENCRYPTION_KEY — check how other encrypted fields are handled in the codebase)
- Upsert into gmail_send_credentials (salon_id, gmail_address, access_token_encrypted, refresh_token_encrypted, token_expiry)
- Update salons SET email_provider='gmail' WHERE id=salonId
- Redirect to /[slug]/settings/integrations?gmail_send=connected

File 2: /mnt/d/SimpliSalonCLoud/lib/email/router.ts
Email router that sends transactional emails:
- Export async function sendEmail(params: { salonId: string; to: string; subject: string; html: string; text?: string }): Promise<void>
- Check salons.email_provider for salonId
- If 'gmail': get credentials from gmail_send_credentials, decrypt tokens, use googleapis gmail.users.messages.send
  Handle token refresh if expired
- If 'resend' (default): use existing Resend client (check lib/ for existing Resend usage)
- Log errors but do not throw — fall back to Resend if Gmail fails

Done when: both files created, email router handles both providers." bash ~/.claude/scripts/dad-exec.sh
```

---

## Po wykonaniu

```bash
supabase db push
supabase gen types typescript --linked > types/supabase.ts
npx tsc --noEmit
```

## Done when
- DB ma `gmail_send_credentials` + `salons.email_provider`
- OAuth flow działa (initiate → callback → credentials zapisane)
- `lib/email/router.ts` wysyła przez Gmail lub Resend zależnie od ustawień
- `tsc --noEmit` clean

## Uwagi bezpieczeństwa
- Tokens MUSZĄ być zaszyfrowane w DB (AES-256-GCM) — weryfikuj po wykonaniu
- GMAIL_SEND_CLIENT_ID/SECRET to osobne OAuth app od Booksy Gmail
- `email_provider` musi być scope'owane do salonu (RLS)
