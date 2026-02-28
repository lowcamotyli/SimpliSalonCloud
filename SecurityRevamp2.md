# Plan naprawczy v2 — pozostałe luki po Security Sprintach 1–4

## SPRINT R1 — WYSOKIE (priorytet natychmiastowy)

### R1.1 — Brak autoryzacji usera w invoices endpoint (Claude)

Plik: `app/api/subscriptions/[slug]/invoices/route.ts`

Problem: Endpoint używa `createAdminSupabaseClient()` i sprawdza tylko czy salon o danym `slug` istnieje, ale **nie weryfikuje że wywołujący user należy do tego salonu**. Dowolny zalogowany user może pobrać faktury dowolnego salonu znając slug (np. odczytany z URL).

Fix: Po pobraniu salonu przez slug — sprawdzić przez `profiles` że `user_id === current_user.id AND salon_id === salon.id`, inaczej 403. Wzorzec identyczny jak S1.1.

```ts
// Dodać po pobraniu salon:
const supabaseUser = createServerSupabaseClient()
const { data: { user } } = await supabaseUser.auth.getUser()
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

const { data: profile } = await supabase
  .from('profiles').select('salon_id')
  .eq('user_id', user.id).eq('salon_id', salon.id).maybeSingle()
if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
```

---

### R1.2 — Usage endpoint zwraca error.message klientowi (Claude — 3 linie)

Plik: `app/api/subscriptions/usage/route.ts`

Problem: Catch block na linii 46–52 zwraca `message: error instanceof Error ? error.message : 'Unknown error'` — identyczny pattern jak S3.3, pominięty w poprzednim sprincie.

Fix:
```ts
// Zmienić:
return NextResponse.json({
  error: 'Failed to get usage report',
  message: error instanceof Error ? error.message : 'Unknown error',
}, { status: 500 })

// Na:
console.error('[USAGE REPORT] Error:', error)
return NextResponse.json({ error: 'Failed to get usage report' }, { status: 500 })
```

---

## SPRINT R2 — ŚREDNIE

### R2.1 — HTTP Security Headers (Claude — vercel.json)

Plik: `vercel.json`

Problem: Brak nagłówków bezpieczeństwa — clickjacking, MIME sniffing, referrer leakage, HSTS. Vercel domyślnie nie dodaje tych nagłówków.

Fix: Dodać sekcję `headers` do `vercel.json`:

```json
"headers": [
  {
    "source": "/(.*)",
    "headers": [
      { "key": "X-Frame-Options", "value": "DENY" },
      { "key": "X-Content-Type-Options", "value": "nosniff" },
      { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
      { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" },
      { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload" },
      { "key": "X-DNS-Prefetch-Control", "value": "off" }
    ]
  }
]
```

---

### R2.2 — error-handler.ts ujawnia detale błędów jeśli NODE_ENV źle skonfigurowany (Claude — 3 linie)

Plik: `lib/error-handler.ts` (linia 168)

Problem: `isDevelopment = process.env.NODE_ENV === 'development'` — jeśli produkcja ma błędnie ustawiony `NODE_ENV` (np. brak zmiennej, misconfiguration w Vercel), `String(error)` trafia do klienta.

Fix: Zastąpić NODE_ENV check explicit opt-in flagą:
```ts
// Zmienić:
const isDevelopment = process.env.NODE_ENV === 'development'

// Na:
const isDevelopment = process.env.EXPOSE_ERROR_DETAILS === 'true'
```
`EXPOSE_ERROR_DETAILS` nigdy nie powinno być ustawione w Vercel production env. Bezpieczne domyślnie niezależnie od NODE_ENV.

---

### R2.3 — Stale JWT salon_id w employees/[id] GET, PUT, DELETE (Claude)

Plik: `app/api/employees/[id]/route.ts`

Problem: Trzy handlery (GET linia 46, PUT linia 83, DELETE linia 299) weryfikują przynależność przez `user.app_metadata?.salon_id`. JWT claims są aktualizowane przez trigger na `profiles`, ale mogą być stale jeśli sesja nie była odświeżona po zmianie salonu. Poza tym `app_metadata` jest polem Supabase Auth — nie DB.

Fix: Zastąpić porównanie z JWT przez DB lookup (wzorzec S1.1):
```ts
// Zmienić (przykład dla GET):
if (!employee || employee.salon_id !== user.app_metadata?.salon_id) { ... }

// Na:
const { data: profile } = await supabase
  .from('profiles').select('salon_id').eq('user_id', user.id).single()
if (!employee || employee.salon_id !== profile?.salon_id) { ... }
```
Dotyczy linii 46, 83 i 299 w tym pliku.

---

## SPRINT R3 — NISKIE / COMPLIANCE

### R3.1 — Content Security Policy (Claude — vercel.json, po R2.1)

Plik: `vercel.json`

Problem: Brak CSP. Gdyby pojawił się XSS vector w przyszłości (np. przez unsanitized user content w CRM/wiadomościach), brak CSP = pełne wykonanie skryptu.

Fix: Dodać do bloku headers z R2.1:
```json
{
  "key": "Content-Security-Policy",
  "value": "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.resend.com; frame-ancestors 'none'"
}
```
Uwaga: `'unsafe-inline'` i `'unsafe-eval'` są wymagane przez Next.js 14. Po migracji do Next.js 15+ można je wyeliminować przez nonce-based CSP.

---

### R3.2 — Dependency audit (CLI)

Problem: Żadna wersja audytu nie sprawdzała znanych CVE w zależnościach. Aplikacja ma duże drzewo zależności (Next.js, Supabase, Radix UI, etc.).

Fix:
```bash
pnpm audit --audit-level=high
```
Priorytety:
- `severity: critical/high` → naprawić natychmiast
- `severity: moderate` → naprawić w ciągu tygodnia
- Skonfigurować w CI/CD: `pnpm audit --audit-level=moderate` jako check w GitHub Actions

---

## Priorytety wdrożenia

| Sprint | Czas       | Ryzyko blokowane                                      |
|--------|------------|-------------------------------------------------------|
| R1     | Dzień 1    | Faktury dostępne między salonami, error.message leak  |
| R2     | Tydzień 1  | Clickjacking, stale JWT auth, error handler risk      |
| R3     | Tydzień 2  | XSS mitigation, supply chain CVE                      |

## Szacunkowy czas implementacji

| Task  | Kto    | Czas    |
|-------|--------|---------|
| R1.1  | Claude | 15 min  |
| R1.2  | Claude | 5 min   |
| R2.1  | Claude | 10 min  |
| R2.2  | Claude | 5 min   |
| R2.3  | Claude | 20 min  |
| R3.1  | Claude | 10 min  |
| R3.2  | CLI    | 30 min  |

**Łącznie: ~1.5h → rating z ~7/10 do ~8.5/10**
