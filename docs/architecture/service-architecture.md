# SimpliSalon — Service Architecture

Version: 2.0
Status: Target Architecture

---

## 1. Deployment Model

SimpliSalon runs as a **modular monolith** deployed on Vercel. The entire application — frontend, API routes, background jobs, and business logic — ships as a single Next.js application. There is no separately deployed backend service.

This is an intentional architectural decision appropriate for the team size and iteration speed requirements. See [ADR-001](adr/001-modular-monolith.md) for the full decision record.

---

## 2. Application Layers

```
┌────────────────────────────────────────────────────────────────────┐
│  PRESENTATION LAYER                                                 │
│  Next.js App Router — pages, layouts, server components             │
│  React client components — interactive UI                          │
│  shadcn/ui + Tailwind — component system                           │
└─────────────────────────┬──────────────────────────────────────────┘
                           │
┌─────────────────────────▼──────────────────────────────────────────┐
│  API LAYER                                                          │
│  Next.js Route Handlers — /app/api/**                               │
│  Middleware — auth, rate limiting, CORS, tenant resolution          │
│  Request validation — Zod schemas                                   │
│  Error handling — centralised withErrorHandling wrapper             │
└─────────────────────────┬──────────────────────────────────────────┘
                           │
┌─────────────────────────▼──────────────────────────────────────────┐
│  APPLICATION SERVICES LAYER                                         │
│  lib/<domain>/  — business logic, use-case orchestration            │
│  Domain services — BookingService, FormService, CampaignProcessor   │
│  Cross-domain coordination — AuthContext, FeatureGate               │
└─────────────────────────┬──────────────────────────────────────────┘
                           │
┌─────────────────────────▼──────────────────────────────────────────┐
│  INFRASTRUCTURE LAYER                                               │
│  lib/supabase/  — database client, admin client, auth helpers       │
│  lib/redis.ts   — Upstash client                                    │
│  Integration adapters — lib/integrations/                           │
│  Storage utilities — Supabase Storage wrappers                      │
│  Encryption utilities — AES-256-GCM helpers                         │
└─────────────────────────┬──────────────────────────────────────────┘
                           │
┌─────────────────────────▼──────────────────────────────────────────┐
│  DATA LAYER                                                         │
│  Supabase PostgreSQL + RLS                                          │
│  Supabase Storage (Object Storage)                                  │
│  Upstash Redis                                                       │
└────────────────────────────────────────────────────────────────────┘
```

---

## 3. Module Structure

Each domain corresponds to a module in `lib/`. Modules own their business logic and expose a clean public API to route handlers. Route handlers are thin — they validate, call the service, and return the response.

### Target module layout

```
lib/
├── identity/               # Identity & Tenancy domain
│   ├── auth-context.ts     # getAuthContext() — resolves auth from request
│   ├── feature-gate.ts     # hasFeature(), feature flag evaluation
│   ├── rbac.ts             # role resolution, permission checks
│   └── tenant.ts           # salon/tenant queries
│
├── scheduling/             # Scheduling domain
│   ├── booking-service.ts  # create, update, cancel bookings
│   ├── availability.ts     # slot computation
│   ├── equipment.ts        # equipment booking and conflict detection
│   └── public-booking.ts   # public API booking flow
│
├── clients/                # Client & CRM domain
│   ├── client-service.ts   # client CRUD, deduplication
│   ├── segmentation.ts     # segment computation
│   └── blacklist.ts        # blacklist management, scoring
│
├── communications/         # Communications domain
│   ├── sms-sender.ts       # SMS dispatch via SMSAPI.pl
│   ├── email-sender.ts     # Email dispatch via Resend
│   ├── template-engine.ts  # variable interpolation
│   ├── campaign-processor.ts  # campaign execution pipeline
│   └── usage-tracker.ts    # SMS credit deduction and tracking
│
├── documents/              # Documents & Forms domain
│   ├── form-service.ts     # template CRUD, form dispatch
│   ├── form-renderer.ts    # schema resolution, conditional logic
│   ├── form-submit.ts      # submission handling
│   ├── consent-service.ts  # consent capture, health_consent_at
│   ├── encryption.ts       # AES-256-GCM encrypt/decrypt for health fields
│   └── template-library.ts # built-in template access layer
│
├── treatment-records/      # Treatment Records domain (L2+)
│   ├── record-service.ts   # treatment record CRUD
│   ├── protocol-service.ts # protocol management
│   ├── plan-service.ts     # multi-session plan tracking
│   └── photo-service.ts    # before/after photo lifecycle
│
├── billing/                # Billing & Commerce domain
│   ├── subscription-manager.ts
│   ├── payment-processor.ts
│   ├── invoice-service.ts
│   └── sms-wallet.ts
│
├── staff/                  # Staff & Operations domain
│   ├── employee-service.ts
│   ├── schedule-service.ts
│   └── payroll-service.ts
│
├── analytics/              # Analytics & Reporting domain
│   ├── revenue-report.ts
│   ├── nps-report.ts
│   └── usage-report.ts
│
├── automation/             # Automation Engine domain
│   ├── engine.ts           # trigger evaluation and workflow dispatch
│   ├── triggers.ts         # trigger type definitions
│   ├── workflow-executor.ts
│   └── cron-orchestrator.ts
│
└── integrations/           # Integrations domain
    ├── booksy/
    │   ├── processor.ts
    │   ├── email-parser.ts
    │   └── sync.ts
    ├── smsapi/
    │   └── adapter.ts
    ├── resend/
    │   └── adapter.ts
    └── przelewy24/
        └── adapter.ts
```

---

## 4. API Route Organisation

Route handlers are grouped by domain under `app/api/`. Each route handler:

1. Calls `getAuthContext()` to resolve auth, tenant, and permissions
2. Validates request input with Zod
3. Calls one or more domain service functions
4. Returns a `NextResponse.json()` with the result
5. Is wrapped in `withErrorHandling()` for consistent error responses

**Route handler conventions:**

```
app/api/
├── bookings/           → Scheduling domain
├── clients/            → Client & CRM domain
├── crm/                → Communications domain (CRM sub-routes)
├── forms/              → Documents & Forms domain
├── treatment-records/  → Treatment Records domain (L2+)
├── billing/            → Billing & Commerce domain
├── employees/          → Staff & Operations domain
├── reports/            → Analytics & Reporting domain
├── cron/               → Automation Engine (CRON trigger endpoints)
├── webhooks/           → Integrations (inbound webhook receivers)
├── public/             → Public booking API (no auth, API key only)
└── health              → Operational health check
```

---

## 5. Public-Facing Routes

Separate from the authenticated API, the platform exposes unauthenticated public routes for client-facing flows:

```
app/
├── forms/
│   ├── fill/[token]/page.tsx     # Treatment / consent form (tokenised)
│   └── pre/[token]/page.tsx      # Pre-appointment form (tokenised)
├── survey/[token]/page.tsx        # Satisfaction survey (tokenised)
└── book/[slug]/page.tsx           # Public booking page (API key auth)
```

These routes use server-side token validation before rendering. They do not require a user session.

---

## 6. Background Processing Architecture

The platform has three async processing mechanisms:

### 6.1 Vercel Cron Jobs

Scheduled via `vercel.json`. Invoke platform-internal cron endpoints at defined intervals. Used for:
- Time-sensitive triggers (pre-appointment form dispatch, reminders, surveys)
- Periodic maintenance (blacklist scoring, dunning checks, Booksy sync)

Cron endpoints are protected by a cron secret header validated at the middleware level.

### 6.2 QStash Message Queue

Durable job queue from Upstash. Used for:
- Campaign message delivery (fan-out to many recipients)
- Large automation workflows that must not time out in a single request
- Retry logic for failed message sends

The platform enqueues jobs to QStash from route handlers or cron endpoints. QStash delivers jobs back to dedicated consumer endpoints (`/api/queue/*`).

### 6.3 In-Process Async (fire-and-forget)

For lightweight post-request operations that can tolerate occasional loss (e.g. audit log writes, non-critical analytics events). Used sparingly and documented explicitly.

---

## 7. Middleware Stack

Requests flow through middleware in this order:

```
Request
  │
  ▼ Next.js Middleware (middleware.ts)
  │  ├── CORS headers (configurable per path)
  │  ├── Auth session validation (for protected paths)
  │  ├── Cron secret validation (for /api/cron/* paths)
  │  ├── Rate limiting (Upstash Redis, fallback in-memory)
  │  └── Tenant slug resolution
  │
  ▼ Route Handler (app/api/**)
  │  ├── getAuthContext() → { user, salonId, role, permissions }
  │  ├── Feature gate check (hasFeature)
  │  ├── Zod input validation
  │  ├── Domain service call
  │  └── withErrorHandling wrapper (maps domain errors to HTTP status codes)
  │
  ▼ Response
```

---

## 8. Error Handling Architecture

All API route handlers are wrapped in `withErrorHandling()`. Domain services throw typed errors:

| Error Type | HTTP Status | Use Case |
|---|---|---|
| `UnauthorizedError` | 401 | No valid session |
| `ForbiddenError` | 403 | Authenticated but insufficient permissions |
| `NotFoundError` | 404 | Resource not found within tenant scope |
| `ValidationError` | 400 | Invalid input (supplements Zod) |
| `FeatureGateError` | 402 | Feature not available on current plan |
| `ConflictError` | 409 | Booking conflict, duplicate resource |
| `RateLimitError` | 429 | Rate limit exceeded |
| `InternalError` | 500 | Unexpected failure (logged to Sentry) |

---

## 9. Future Service Extraction Criteria

Service extraction from the modular monolith is justified only when all of the following are true:

1. **Independent deployment cadence** — the domain needs to be deployed independently of the rest of the system more than once per week in practice
2. **Independent scaling** — the domain has dramatically different resource requirements (e.g. the form template library receives 100x the read traffic of the booking API)
3. **Team ownership** — a separate team owns the domain and needs independent release authority
4. **Data isolation requirement** — regulatory or compliance requirements mandate physically separate data storage

For the current team size and product stage, none of these conditions are met. The modular monolith with clean domain boundaries is the correct architecture.

**Likely first extraction candidate (if criteria are met): Documents & Forms** — the treatment card template library could become a content delivery service if the volume of form templates grows to a scale that affects monolith build and deployment times, or if white-label template licensing to third parties becomes a product line.
