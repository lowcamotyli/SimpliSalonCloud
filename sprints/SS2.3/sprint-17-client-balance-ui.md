# Sprint SS2.2-17 — Client Balance & Prepayments: UI

## Cel
(P0/P1) UI do zarządzania saldem klienta:
- widget salda w profilu klienta,
- formularz doładowania i pobrania,
- historia transakcji,
- szybki link do płatności online (Przelewy24) wysyłany przez recepcję.

## Architektura — dokumenty referencyjne

Brak nowych tabel — sprint czysto UI. Opcjonalnie:
```bash
DAD_PROMPT='Read /mnt/d/SimpliSalonCLoud/app/api/payments/booking/initiate/route.ts. TASK: Summarize how Przelewy24 payment link is generated — what parameters are needed, what is returned. FORMAT: Bulleted list. LIMIT: Max 15 lines.' bash ~/.claude/scripts/dad-exec.sh
```

**Kluczowe constraints:**
- `'use client'` komponenty tam gdzie interaktywność
- Formularz doładowania: tylko owner i manager mogą dodawać saldo (sprawdź uprawnienia)
- Pracownik: może widzieć saldo, ale NIE może dopisywać

## Zakres tego sprintu

### A — Widget salda w profilu klienta
- [ ] `components/clients/client-balance-card.tsx` — card z:
  - aktualne saldo `XX,XX zł`
  - przycisk "Doładuj" (owner/manager only)
  - przycisk "Pobierz z salda" (owner/manager only)
  - link "Historia transakcji"
- [ ] Integracja na stronie klienta (`app/(dashboard)/[slug]/clients/[id]/page.tsx` lub podobnej)

### B — Dialog doładowania / pobrania
- [ ] `components/clients/balance-transaction-dialog.tsx`:
  - Typ: "Doładowanie" / "Pobranie" / "Zwrot"
  - Pole: kwota (walidacja > 0, przy pobraniu ≤ saldo)
  - Pole: opis (opcjonalne)
  - Submit → POST `/api/clients/[id]/balance/[deposit|debit|refund]`
  - Po sukcesie: odśwież widget salda

### C — Historia transakcji
- [ ] `components/clients/balance-history.tsx` lub zakładka w profilu:
  - Tabela: data, typ (badge kolorowany), kwota, opis, kto wykonał
  - Paginacja lub "Załaduj więcej"

### D — Szybki link do płatności z recepcji
- [ ] W profilu klienta lub przy podglądzie wizyty: przycisk "Wyślij link do płatności"
  - Otwiera dialog z wyborem: "Pełna kwota wizyty" / "Przedpłata własna kwota" / "Doładowanie salda"
  - Generuje link Przelewy24 przez POST `/api/payments/booking/initiate`
  - Pokazuje wygenerowany link + przycisk "Kopiuj" + opcja "Wyślij SMS"

## Pliki do stworzenia / modyfikacji

| Plik | Akcja | Worker |
|------|-------|--------|
| `components/clients/client-balance-card.tsx` | CREATE | codex-main |
| `components/clients/balance-transaction-dialog.tsx` | CREATE | codex-dad |
| `components/clients/balance-history.tsx` | CREATE | codex-dad |
| `components/clients/payment-link-dialog.tsx` | CREATE | codex-dad |
| `app/(dashboard)/[slug]/clients/[id]/page.tsx` | EDIT — integracja | codex-main |

## Zależności
- **Wymaga:** sprint-16 (client balance DB + API)
- **Blokuje:** opcjonalnie sprint-15 (rozliczenie przy edycji wizyty)

---

## Prompt — codex-main (ClientBalanceCard + integracja)

```bash
codex exec --dangerously-bypass-approvals-and-sandbox 'Read app/(dashboard)/[slug]/clients/[id]/page.tsx for context. Do NOT use Gemini — write directly.

Goal 1: Create components/clients/client-balance-card.tsx
- Fetch GET /api/clients/[id]/balance on mount
- Show: current balance in large text, "Doładuj" and "Pobierz" buttons (shown only when user has manager+ role — use useCurrentRole hook or permission check)
- On button click: open BalanceTransactionDialog
- After transaction: refetch balance

Goal 2: Integrate ClientBalanceCard into client detail page
- Import and render <ClientBalanceCard clientId={client.id} /> in appropriate section

Use shadcn/ui: Card, CardHeader, CardContent, Button, Badge.
Done when: tsc clean'
```

---

## Prompt — codex-dad (dialogi transakcji, historia, link do płatności)

```bash
DAD_PROMPT='Read components/clients/client-balance-card.tsx for context.
Goal: Create 3 components for client balance management.

File 1: /mnt/d/SimpliSalonCLoud/components/clients/balance-transaction-dialog.tsx
- Props: { clientId, type: "deposit" | "debit" | "refund", currentBalance: number, open, onClose, onSuccess }
- Form: amount (number, required, >0, ≤currentBalance for debit), description (text, optional)
- Submit: POST /api/clients/[clientId]/balance/[type]
- Show loading state during submit

File 2: /mnt/d/SimpliSalonCLoud/components/clients/balance-history.tsx  
- Props: { clientId }
- Fetches GET /api/clients/[clientId]/balance, shows transactions table
- Columns: data, typ (Badge kolorowany: deposit=green, debit=red, refund=blue), kwota, opis
- Limit 20 rows, "Załaduj więcej" button

File 3: /mnt/d/SimpliSalonCLoud/components/clients/payment-link-dialog.tsx
- Props: { clientId, bookingId?: string, open, onClose }
- Options: pełna kwota wizyty / własna kwota / doładowanie salda
- Submit: POST /api/payments/booking/initiate with appropriate amount
- Show returned payment URL with Copy button and optional Send SMS via existing SMS API

Use shadcn/ui throughout. Done when: tsc clean' bash ~/.claude/scripts/dad-exec.sh
```

---

## Weryfikacja po sprincie
```bash
npx tsc --noEmit
# Test manualny: profil klienta → widget salda → doładuj 50 zł → historia → saldo = 50
# Test: pobierz 20 zł → saldo = 30
# Test: szybki link do płatności → URL w dialogu → kopiuj
```
