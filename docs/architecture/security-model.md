# SimpliSalon — Security Model

Version: 2.0
Status: Target Architecture

---

## 1. Security Philosophy

SimpliSalon operates in a privacy-sensitive domain. Clients submit health questionnaires, consent forms, and treatment records. The security model is built around three principles:

1. **Defence in depth** — no single control is the sole protection. Multiple independent layers work together.
2. **Least privilege** — users and systems get the minimum access required to perform their function.
3. **Secure by default** — new features start with the most restrictive access and relax only as justified.

---

## 2. Threat Model

| Threat | Risk Level | Mitigations |
|---|---|---|
| Cross-tenant data access | Critical | RLS policies on all tenant-scoped tables, tenant-scoped service accounts |
| Stolen session token | High | Short-lived JWTs, server-side session validation, HTTPS-only |
| Public form token replay | High | Single-use tokens, time-limited tokens, token hash storage |
| Health data breach via DB access | High | Application-layer AES-256-GCM encryption on all health fields |
| Compromised API route (no auth) | High | `getAuthContext()` enforced in all route handlers, middleware protection |
| Mass data extraction by authenticated user | Medium | Rate limiting per tenant/user, RLS restricts to own tenant |
| Payment webhook forgery | Medium | Przelewy24 signature verification before processing |
| SMS webhook forgery | Medium | SMSAPI.pl IP allowlist + request validation |
| Privilege escalation within tenant | Medium | Role-based permission checks at API + DB (RLS) layers |
| Sensitive data in logs/errors | Medium | Sentry data scrubbing, structured logging with explicit field allowlist |
| CRON endpoint abuse | Low | Cron secret header validation |
| Brute-force login | Low | Supabase Auth rate limiting, lockout |

---

## 3. Authentication Architecture

### 3.1 Primary Authentication

Authentication is provided by **Supabase Auth** (JWT-based):

- Users authenticate via email/password or Google OAuth
- On authentication, Supabase issues a JWT with custom claims (role, salonId, permissions)
- The JWT is stored in a secure HttpOnly cookie (SSR) or managed by the Supabase client SDK
- JWTs expire after 1 hour; automatic refresh via the Supabase session mechanism

### 3.2 JWT Claims Structure

```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "app_metadata": {
    "salon_id": "salon-uuid",
    "role": "owner",
    "permissions": ["*"]
  },
  "exp": 1234567890
}
```

Claims are populated by the `sync_user_claims` database trigger that fires on `profiles` INSERT/UPDATE. This ensures claims are always consistent with the profiles table.

### 3.3 Session Validation

Every authenticated API request validates the session server-side via `getAuthContext()`:

```
Request arrives at API route
    │
    ▼
getAuthContext():
    ├── supabase.auth.getUser()  ← validates JWT with Supabase
    ├── Resolves salonId from user claims
    ├── Checks that salonId matches URL slug (prevents salon-hopping)
    └── Returns { user, salonId, role, permissions }
```

The client cannot self-assert their identity or tenant. The JWT is always validated server-side.

### 3.4 Public Endpoints (No User Auth)

Public client-facing endpoints (`/api/public/*`, `/api/forms/submit/*`) do not require user authentication. They use alternative security:
- **API key** for the public booking API
- **Single-use token** for form and survey endpoints
- **Rate limiting** on all public endpoints
- **Input validation** via Zod on all inputs

---

## 4. Role-Based Access Control (RBAC)

### 4.1 Roles

| Role | Who | Permission Scope |
|---|---|---|
| `owner` | Salon owner | All operations within their tenant |
| `manager` | Salon manager | Calendar, clients, employees, services, reports — not billing |
| `employee` | Staff practitioner | Own calendar, clients (read), services (read) |
| `compliance_reviewer` | Future L3 | Read-only access to consent records and treatment documentation |

### 4.2 Permission Resolution

Permissions are resolved at three layers:

**Layer 1 — JWT claims (middleware/edge):**
Fast, stateless check. Rejects requests that clearly lack the required permission before they reach the route handler. Used for route-level blocking in `middleware.ts`.

**Layer 2 — Application logic (route handler):**
`getAuthContext()` provides the resolved role and permission array. Route handlers call `hasPermission(context, 'calendar:manage_all')` before executing operations.

**Layer 3 — Database RLS (PostgreSQL):**
Even if layers 1 and 2 are bypassed (e.g. a compromised service), RLS policies enforce that the authenticated user can only read/write rows belonging to their tenant. RLS is the backstop that makes cross-tenant access structurally impossible for the user client.

### 4.3 Permission Matrix

| Capability | Owner | Manager | Employee |
|---|---|---|---|
| View calendar | ✓ | ✓ | Own only |
| Manage all bookings | ✓ | ✓ | — |
| View clients | ✓ | ✓ | ✓ |
| Manage clients | ✓ | ✓ | — |
| View/manage employees | ✓ | ✓ | — |
| View/manage services | ✓ | ✓ | View only |
| View payroll/reports | ✓ | ✓ | — |
| Manage billing | ✓ | — | — |
| Manage settings | ✓ (all) | ✓ (limited) | — |
| Access forms and health data | ✓ | ✓ | — (unless assigned) |
| Access treatment records (L2+) | ✓ | ✓ | Own records |
| CRM campaigns/automations | ✓ | ✓ | — |

---

## 5. Data Access Security

### 5.1 Row Level Security (RLS)

All tenant-scoped tables have RLS policies that enforce:

```sql
-- Read policy (example for bookings):
CREATE POLICY "Bookings: read own salon"
ON bookings FOR SELECT
USING (salon_id = public.get_user_salon_id());

-- Insert policy:
CREATE POLICY "Bookings: insert own salon"
ON bookings FOR INSERT
WITH CHECK (salon_id = public.get_user_salon_id());
```

The helper function `public.get_user_salon_id()` reads the salon_id from the JWT claims. This means:
- No query can return rows from another tenant
- No insert can create a row for another tenant
- No update or delete can affect another tenant's data

**The service role client bypasses RLS.** It is used exclusively for administrative operations (CRON jobs, webhook processing, billing) and is never exposed to client-side code.

### 5.2 Health Data Access Control

Access to decrypted health data requires:
1. Authenticated user with sufficient role (owner or manager minimum)
2. The client's health consent to have been captured (`health_consent_at IS NOT NULL`)
3. The request to come from a server-side context (never decrypted client-side)

The decryption key is only available in the server environment (environment variable). There is no pathway to expose decryption keys to the browser.

### 5.3 Admin Client Usage Policy

The `createAdminSupabaseClient()` function (service role) must only be called from:
- CRON job handlers
- Webhook receivers
- Billing event processors
- Explicitly authorised administrative operations

It must never be used in user-facing API routes where user-scoped access would suffice.

---

## 6. Input Validation and Injection Prevention

### 6.1 Input Validation

All API route inputs are validated with **Zod schemas** before reaching business logic. Invalid inputs return a 400 error before any database interaction.

### 6.2 SQL Injection

The platform uses the Supabase JS SDK for all database operations. The SDK uses parameterised queries. Raw SQL is only used in migrations and stored procedures, never in application code that handles user input.

**Exception:** The RPC function `create_booking_atomic` uses parameters passed to a Postgres function. All parameters are bound safely via the SDK.

### 6.3 XSS Prevention

- Server components render data without `dangerouslySetInnerHTML`
- User-generated content in form templates is escaped by the React rendering layer
- The form renderer treats schema-defined field labels and descriptions as trusted (they are set by authenticated salon staff, not end clients)
- End client input in form responses is always treated as untrusted data

### 6.4 CSRF Protection

- All state-changing operations require a valid Supabase session JWT (HttpOnly cookie)
- Public endpoints use token-based authentication (URL token or API key), not cookie-based sessions, making them immune to CSRF by design

---

## 7. Webhook Security

### 7.1 Przelewy24 Webhooks

- All webhook payloads are verified against the Przelewy24 signature using HMAC-SHA256
- Payment state is only updated after signature verification succeeds
- Duplicate webhook deliveries are idempotent (same payment state is applied)

### 7.2 SMSAPI.pl Webhooks

- Delivery status webhooks are verified using the SMSAPI token
- IP allowlist (SMSAPI-published IP ranges) provides additional protection

### 7.3 CRON Endpoint Protection

- All `/api/cron/*` endpoints verify a `Authorization: Bearer {CRON_SECRET}` header
- The secret is an environment variable set in Vercel; it is not committed to the repository
- Without this header, cron endpoints return 401

---

## 8. Sensitive Data Handling

### 8.1 What Must Never Appear in Logs

- Decrypted health data
- Consent signatures (binary data)
- Phone numbers (log only the last 4 digits)
- Email addresses (log only the domain part)
- Payment card data (never in scope — handled by Przelewy24)
- Encryption keys
- Supabase service role key
- API keys (log only the first/last 4 characters)

### 8.2 Sentry Data Scrubbing

Sentry is configured with a `beforeSend` hook that strips any payload properties matching sensitive field names before transmission.

### 8.3 Environment Variable Security

| Variable | Description | Where Used |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Admin DB access | Server only, admin client |
| `FORM_ENCRYPTION_KEY` | Health data AES key | Server only, encryption module |
| `CRON_SECRET` | CRON endpoint auth | Server only, cron middleware |
| `P24_MERCHANT_ID` / `P24_CRC` | Przelewy24 credentials | Server only, payment module |
| `QSTASH_TOKEN` | QStash auth | Server only, queue module |

None of these values are ever exposed to the browser. The `NEXT_PUBLIC_` prefix is never used for secrets.

---

## 9. Audit Trail

Security-sensitive operations produce audit log entries. The audit log is append-only and cannot be modified or deleted by any application-level user (enforced by RLS).

**Operations that must produce audit entries:**
- User login / logout
- Access to a client's decrypted health data (who accessed what, when)
- Form submission (consent capture events)
- Booking state changes
- Role changes (user role updated)
- Feature flag changes
- Encryption key usage (when key rotation is implemented)
- Integration credential access

---

## 10. Security Review Gates

Changes that touch the following areas require explicit security review before merging:

| Area | Review Requirement |
|---|---|
| Authentication flow | Full review; no shortcuts |
| RLS policy changes | Review by engineer who understands Postgres RLS |
| Encryption module | Review of key usage, IV generation, auth tag verification |
| Public endpoints | Rate limiting verified, no unintended data exposure |
| Payment webhook handler | Signature verification path must be intact |
| New tables with PII | RLS policy must be included in same migration |
| Service role client usage | Justification required; never in user-facing routes |
