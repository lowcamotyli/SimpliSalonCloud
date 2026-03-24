# Sprint SS2.2-06 — Gmail Outbound Integration: Settings UI

## Cel
Strona ustawień integracji Gmail Send — podłączanie/odłączanie konta, przełącznik dostawcy e-mail.

## Architektura — dokumenty referencyjne

Przed dispatchem przeczytaj:
```bash
gemini -p "Read docs/architecture/integration-architecture.md. Summarize: how integration settings pages are structured, owner-only access pattern, how provider selection is persisted. Max 12 lines." --output-format text 2>/dev/null | grep -v "^Loaded"
```

| Dokument | Dlaczego |
|----------|----------|
| `docs/architecture/integration-architecture.md` | Wzorzec strony ustawień integracji, jak prezentować status połączenia |
| `docs/architecture/security-model.md` | Owner-only access enforcement (server-side layout check) |

**Kluczowe constraints:**
- Strona integracji: owner-only — sprawdź wzorzec w `app/(dashboard)/[slug]/settings/integrations/[integration]/layout.tsx`
- Nie eksponuj zaszyfrowanych tokenów na frontend — tylko `gmail_address` i `connected: boolean`
- Przełącznik dostawcy e-mail modyfikuje `salons.email_provider` — wymaga owner role

## Stan po sprint-05
- API: `GET/DELETE /api/integrations/gmail-send` + callback + `lib/email/router.ts`
- DB: `gmail_send_credentials`, `salons.email_provider`
- Brakuje: UI do zarządzania integracją

## Zakres tego sprintu
- [ ] Strona ustawień: `app/(dashboard)/[slug]/settings/integrations/gmail-send/page.tsx`
- [ ] Sekcja w głównej stronie integracji: karta Gmail Send
- [ ] Wyświetl: status połączenia, adres Gmail, przycisk Connect/Disconnect
- [ ] Przełącznik aktywnego dostawcy: "Wysyłaj e-maile przez: Resend | Gmail"
- [ ] Owner-only (jak inne settings integrations)

## Pliki do stworzenia / modyfikacji

| Plik | Akcja | Worker |
|------|-------|--------|
| `app/(dashboard)/[slug]/settings/integrations/gmail-send/page.tsx` | CREATE | codex-main |
| `app/(dashboard)/[slug]/settings/integrations/page.tsx` | EDIT (dodaj kartę) | codex-dad |

## Zależności
- **Wymaga:** sprint-05

---

## Krok 0 — Odczyt przed dispatchem

```bash
gemini -p "Read app/(dashboard)/[slug]/settings/integrations/page.tsx. Show all integration cards/sections structure. How is Booksy/Przelewy24 card structured? Max 25 lines." --output-format text 2>/dev/null | grep -v "^Loaded"
```

---

## Prompt — codex-main (Gmail Send settings page)

```bash
codex exec --dangerously-bypass-approvals-and-sandbox "Do NOT use Gemini — write directly.

Read app/(dashboard)/[slug]/settings/integrations/booksy/page.tsx (or similar) for UI pattern reference.

Goal: Create Gmail Send integration settings page.
File: app/(dashboard)/[slug]/settings/integrations/gmail-send/page.tsx

Page structure:
1. Header: 'Gmail — wysyłanie e-maili' with description 'Wysyłaj powiadomienia e-mail przez własne konto Gmail zamiast domyślnego Resend.'

2. Connection card:
   - Fetch GET /api/integrations/gmail-send?status=true
   - If connected: show green badge 'Połączono', show gmail_address, 'Odłącz' button (calls DELETE /api/integrations/gmail-send)
   - If not connected: 'Połącz konto Gmail' button (calls GET /api/integrations/gmail-send → redirects to Google OAuth)

3. Email provider selector (only visible when connected):
   - Fetch current email_provider from salon settings (GET /api/settings or similar — check existing pattern)
   - Radio or segmented: 'Resend (domyślny)' | 'Gmail'
   - On change: PATCH /api/settings with { email_provider }
   - Show current active provider with description

4. Info box: 'Uwaga: Gmail ma limit 500 e-maili/dzień. Resend nie ma limitu.'

Page is owner-only — add server-side auth check matching other integrations pages.
Use shadcn/ui components with individual imports.
Done when: page renders with connect/disconnect and provider switcher."
```

---

## Prompt — codex-dad (integracja w głównej stronie)

```bash
DAD_PROMPT="Read app/(dashboard)/[slug]/settings/integrations/page.tsx.

Goal: Add Gmail Send integration card to the integrations overview page.
File: /mnt/d/SimpliSalonCLoud/app/(dashboard)/[slug]/settings/integrations/page.tsx

Add a card for 'Gmail — wysyłanie e-maili':
- Same style/structure as existing integration cards (Booksy, Przelewy24)
- Show connection status (fetch GET /api/integrations/gmail-send?status=true server-side)
- Link to /settings/integrations/gmail-send
- Description: 'Wysyłaj e-maile przez własne konto Gmail'
- Do not change existing cards

Done when: Gmail Send card visible on integrations page." bash ~/.claude/scripts/dad-exec.sh
```

---

## Po wykonaniu

```bash
npx tsc --noEmit
```

## Done when
- `/settings/integrations/gmail-send` renderuje z connect/disconnect
- Przełącznik dostawcy zmienia `email_provider` w DB
- Karta Gmail Send widoczna na głównej stronie integracji
- Strona dostępna tylko dla owner
- `tsc --noEmit` clean
