# SimpliSalon — Infrastructure Architecture

Version: 2.0
Status: Target Architecture

---

## 1. Infrastructure Overview

SimpliSalon is a **fully managed cloud infrastructure** deployment. The team does not operate servers, manage Kubernetes clusters, or maintain database infrastructure directly. All infrastructure is provided by managed services.

This is the correct infrastructure model for a small engineering team that needs to move fast. The operational burden is shifted to vendors who specialise in it.

---

## 2. Infrastructure Diagram

```
┌────────────────────────────────────────────────────────────┐
│                      DNS / Edge                            │
│  Vercel Edge Network (CDN, TLS termination, routing)       │
└──────────────────────────┬─────────────────────────────────┘
                            │
┌──────────────────────────▼─────────────────────────────────┐
│                   COMPUTE LAYER                            │
│                                                            │
│  ┌────────────────────────────────────────────────┐        │
│  │  Next.js Application (Vercel Serverless)       │        │
│  │  - API Routes (Node.js runtime)                │        │
│  │  - Server Components (Node.js runtime)         │        │
│  │  - Static assets (CDN-served)                  │        │
│  └────────────────────────────────────────────────┘        │
│                                                            │
│  ┌─────────────────────────────────┐                       │
│  │  Vercel Cron Jobs               │                       │
│  │  (invokes /api/cron/* routes)   │                       │
│  └─────────────────────────────────┘                       │
└──────────────────────────┬─────────────────────────────────┘
                            │
┌──────────────────────────▼─────────────────────────────────┐
│                    DATA SERVICES                           │
│                                                            │
│  Supabase (managed, hosted)                                │
│  ├── PostgreSQL (primary database + RLS)                   │
│  ├── Supabase Auth (JWT issuance, session management)      │
│  ├── Supabase Storage (files, photos, signatures)          │
│  └── Supabase Edge Functions (future, if needed)           │
│                                                            │
│  Upstash (managed, serverless)                             │
│  ├── Redis (rate limiting, caching)                        │
│  └── QStash (durable message queue)                        │
└──────────────────────────┬─────────────────────────────────┘
                            │
┌──────────────────────────▼─────────────────────────────────┐
│                MONITORING & OBSERVABILITY                  │
│                                                            │
│  Sentry      — error tracking, performance monitoring      │
│  Vercel      — function logs, deployment logs              │
│  Supabase    — database query logs, slow query analysis    │
│  Upstash     — Redis metrics, QStash queue metrics         │
└────────────────────────────────────────────────────────────┘
```

---

## 3. Compute — Vercel

### 3.1 Deployment Model

- **Platform:** Vercel (Next.js optimised hosting)
- **Runtime:** Node.js 20+ LTS
- **Function type:** Serverless (auto-scaling, no cold start optimisation needed at current scale)

### 3.2 Environments

| Environment | Branch | Purpose |
|---|---|---|
| Production | `main` | Live production system |
| Preview | `feature/*`, `fix/*`, PR branches | Testing and review |
| Development | Local `.env.local` | Local development |

Vercel Preview deployments provide a full-stack preview environment for each PR, including a connection to a staging Supabase project.

### 3.3 Environment Variables

Environment variables are managed in Vercel's project settings per environment:

| Variable Category | Production | Preview | Development |
|---|---|---|---|
| Supabase URL + anon key | Real project | Staging project | Local or staging |
| Supabase service role key | Real (restricted) | Staging | Local |
| Payment credentials | Real (sandbox on preview) | Sandbox | Sandbox |
| SMS/Email credentials | Real | Test mode | Test mode |
| Encryption keys | Real (generated, stored in Vercel) | Preview-specific | Local |
| CRON secret | Real | Preview-specific | Local |

**Critical rule:** Production credentials are only set in the Production environment in Vercel. They are never committed to the repository, never present in preview environments, and never shared outside the team.

### 3.4 Build and Deployment

```
Git push to feature branch
    │
    ▼
Vercel Preview deployment (automatic)
    ├── next build
    ├── TypeScript check (npx tsc --noEmit)
    └── Deploy to preview URL

PR merged to main
    │
    ▼
Vercel Production deployment
    ├── next build
    └── Zero-downtime deployment (Vercel rolling deploy)
```

---

## 4. Database — Supabase

### 4.1 Project Configuration

- **Supabase project region:** EU (Frankfurt / eu-central-1) — required for GDPR compliance (data residency)
- **Postgres version:** 15+
- **Connection pooling:** PgBouncer (transaction mode, default pool size 15)
- **Backups:** Supabase managed daily backups, point-in-time recovery on higher plans

### 4.2 Connection Management

The application uses two Supabase client types:

| Client | Auth | RLS | Use |
|---|---|---|---|
| Browser client | User JWT | Enforced | Client-side Supabase queries (minimal use) |
| Server client (SSR) | User JWT (cookie) | Enforced | API routes, server components |
| Admin client (service role) | Service key | Bypassed | CRON, webhooks, admin operations |

**Connection pool strategy:** Serverless functions open short-lived connections via PgBouncer's transaction mode. Each function invocation does not maintain a persistent connection.

### 4.3 Schema Management

All schema changes are managed through migration files in `supabase/migrations/`. The migration workflow:

```bash
# Create migration
supabase migration new description_of_change

# Apply to local dev database
supabase db reset

# Apply to hosted project
supabase db push

# Regenerate TypeScript types after migration
supabase gen types typescript --linked > types/supabase.ts
```

Migrations are applied manually by an engineer with Supabase project access. They are not applied automatically on deployment (intentional — schema changes require human review).

### 4.4 Supabase Storage Configuration

| Bucket | Contents | Access Policy |
|---|---|---|
| `signatures` | Consent form signatures | Private; signed URLs only; tenant-scoped paths |
| `treatment-photos` | Before/after treatment photos | Private; signed URLs only; tenant-scoped paths |
| `exports` | Data exports | Private; signed URL with 30-minute expiry |

Public buckets are not used. All files are accessed via signed URLs generated server-side.

---

## 5. Cache and Queue — Upstash

### 5.1 Redis

- **Configuration:** Standard serverless Redis instance (EU region for latency)
- **Use cases:** Rate limiting counters, feature flag cache, short-lived session data
- **Connection:** HTTP API (no persistent TCP connection, compatible with serverless)
- **Fallback:** In-memory rate limiter available for development environments without Redis credentials

### 5.2 QStash

- **Configuration:** Standard QStash plan (EU endpoint)
- **Use cases:** Campaign message fan-out, automation workflow jobs, delayed job execution
- **Retry policy:** Up to 3 retries with exponential backoff (30s, 2m, 10m)
- **Dead-letter queue:** Monitored; alerts on accumulation

---

## 6. Observability

### 6.1 Error Tracking — Sentry

- Sentry is configured for both server-side (API routes, server components) and client-side (browser) error capture
- Source maps are uploaded to Sentry on each production deployment
- Performance monitoring captures p50/p95/p99 request durations
- Sensitive data scrubbing is configured in `sentry.server.config.ts`

### 6.2 Structured Logging

Application logs follow a structured JSON format:

```json
{
  "level": "info",
  "message": "Booking created",
  "salonId": "...",
  "bookingId": "...",
  "duration_ms": 45,
  "timestamp": "2026-03-12T14:00:00Z"
}
```

Phone numbers, email addresses, and health data are never included in log payloads.

### 6.3 Health Endpoint

`/api/health` provides operational status:

```json
{
  "status": "healthy",
  "database": "healthy",
  "redis": "healthy",
  "uptime_seconds": 3600,
  "response_time_ms": 12
}
```

Status values: `healthy` | `degraded` | `unhealthy`. The health endpoint is polled by external uptime monitoring.

### 6.4 Alerting

| Alert | Trigger | Notification |
|---|---|---|
| Health endpoint unhealthy | `/api/health` returns non-200 | PagerDuty / Slack |
| High error rate | Sentry error rate > 1% | Slack |
| Database slow queries | Supabase dashboard: query > 1s | Email |
| CRON job failures | Sentry: cron error > 2 consecutive | Slack |
| QStash dead-letter accumulation | > 0 items | Slack |
| Payment webhook failures | > 2 failures/hour | Slack |

---

## 7. Disaster Recovery

### 7.1 Recovery Objectives

| Scenario | RTO (Recovery Time) | RPO (Recovery Point) |
|---|---|---|
| Application bug (rollback) | < 5 minutes | No data loss (rollback to previous deployment) |
| Bad database migration | < 30 minutes | Last migration state (migration rollback) |
| Supabase outage | Depends on Supabase SLA | Supabase managed backup (daily) |
| Full region outage | N/A (EU region only currently) | — |

### 7.2 Backup Strategy

- Supabase automated daily backups (point-in-time recovery available on Growth plan)
- Object Storage backups managed by Supabase
- The application has no stateful storage outside Supabase — a complete data restore from Supabase backup is the full recovery

### 7.3 Deployment Rollback

Vercel supports instant rollback to any previous deployment. A rollback does not affect database state. If a migration was applied before rollback, it remains applied — this is why schema migrations are forward-only.

---

## 8. Infrastructure Security

- All infrastructure runs in the EU for GDPR data residency compliance
- Supabase project access is restricted to specific team member accounts (no shared credentials)
- Vercel project access follows the principle of least privilege (team members have only the access they need)
- Service role credentials are rotated when team members leave
- All infrastructure credentials are documented in a private secrets manager (not in this repository)

---

## 9. Future Infrastructure Evolution

| Capability | When Needed | Approach |
|---|---|---|
| Postgres read replica | > 2,000 tenants with heavy analytics | Enable via Supabase project settings |
| Multi-region | Enterprise clients with specific data residency | Supabase multi-region (evaluate when needed) |
| Edge functions | Low-latency public API endpoints | Supabase Edge Functions or Vercel Edge Runtime |
| Secrets management | Per-tenant encryption keys (L2) | Supabase Vault or HashiCorp Vault |
| CDN for form templates | Template library served at edge | Vercel Edge Config or a dedicated CDN |
