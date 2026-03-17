# SimpliSalon — Scalability Strategy

Version: 2.0
Status: Target Architecture

---

## 1. Scaling Philosophy

SimpliSalon is built for a small engineering team with a moderate infrastructure budget. The scaling strategy follows this sequencing:

> **Make it work → Make it right → Make it scale**

The platform does not need to scale to millions of tenants today. It needs to scale predictably and cost-efficiently as the tenant base grows, without requiring the team to become infrastructure engineers.

The target operating model: **scale vertically and with managed services first; add horizontal complexity only when forced by real load**.

---

## 2. Current Scale Envelope

The current architecture (Next.js on Vercel + Supabase managed Postgres) is suitable for:

- Up to ~10,000 tenants (salons)
- Up to ~50,000 bookings/day across all tenants
- Up to ~1,000 concurrent active users
- CRON jobs processing up to ~5,000 items per run

Most beauty salons have 2–10 employees and 10–50 bookings per day. A 10,000-tenant base represents substantial real-world revenue and covers years of growth.

---

## 3. Scalability Dimensions

### 3.1 Application Layer (Vercel)

**Current:** Serverless functions on Vercel. Auto-scales horizontally with load. No capacity planning required.

**Bottlenecks at scale:**
- Function cold starts for infrequently used routes (mitigated by streaming and edge functions for latency-sensitive paths)
- CRON job processing time: if a CRON must process 50,000 records, a single execution may time out (Vercel function limit: 5 minutes on Pro plan)

**Mitigation for CRON scale:**
- Partition CRON processing into batches (process N records per invocation, use a `processed_before` cursor)
- Move high-volume CRON processing to QStash fan-out (CRON enqueues batches, workers process in parallel)
- This is a code change, not an infrastructure change

### 3.2 Database Layer (Supabase)

**Current:** Managed Postgres on Supabase. Connection pooling via PgBouncer.

**Scaling levers:**

| Issue | Trigger | Action |
|---|---|---|
| Query latency > 100ms | Query analysis | Add indexes, optimise queries |
| Connection pool exhaustion | > 80% pool utilisation | Scale Supabase plan (larger connection pool) |
| Table size causing full scans | Table > 50M rows | Partition table by `created_at` range |
| Read-heavy load | Analytics queries dominating | Add Postgres read replica (Supabase supports this) |
| Write-heavy load | High booking create rate | Review write path, consider connection pooling settings |

**Key indexes to maintain:**
- `bookings(salon_id, start_time)` — calendar queries
- `bookings(salon_id, status, survey_sent)` — CRON survey processing
- `clients(salon_id, phone)` — client deduplication
- `client_forms(booking_id)` — form-to-booking resolution
- `message_logs(salon_id, created_at)` — notification log queries

**What NOT to do prematurely:**
- Database sharding (prohibitively complex for the team size)
- Separate database per tenant (migration and operational complexity)
- Custom replication setup (Supabase manages this)

### 3.3 Cache Layer (Upstash Redis)

**Current:** Used for rate limiting and short-lived cache.

**Scaling opportunities:**
- Cache frequently read, rarely changed data: built-in form templates, service lists, employee schedules
- Cache API responses for the public booking widget (availability endpoint is read-heavy)
- Cache tenant feature flags (currently read from DB on every request)

**Target caching layer:**

| Data | TTL | Invalidation |
|---|---|---|
| Feature flags per tenant | 5 minutes | On subscription change event |
| Service list per tenant | 10 minutes | On service update |
| Employee availability | 1 minute | On booking create/cancel |
| Built-in form templates | 1 hour | On deployment |

### 3.4 Async Processing (QStash)

**Current:** Used for campaign fan-out and automation workflows.

**Scaling properties:** QStash is a managed service with generous throughput limits. The platform's queue depth is bounded by the number of clients per campaign × campaigns per day. For typical salons, this is small.

**At scale (10,000 tenants × 500 clients × 1 campaign/month):** Peak load is approximately 5M campaign messages/month ≈ 170k/day. QStash supports this comfortably.

**Bottleneck watch:** The worker endpoint (`/api/queue/campaign`) that processes QStash-delivered jobs. If this endpoint is slow, QStash jobs pile up. Mitigation: fan-out further at the job level, process jobs in parallel within the worker.

---

## 4. Cost Scaling Model

| Component | Current Cost Model | Scale Trigger for Next Tier |
|---|---|---|
| Vercel | Pro plan (function executions) | > 1M function invocations/day |
| Supabase | Growth plan (compute, storage, bandwidth) | > 100GB database, > 500 concurrent connections |
| Upstash Redis | Pay-per-command | > 10M commands/day |
| QStash | Pay-per-message | > 500k messages/month |
| Supabase Storage | Pay-per-GB | > 100GB stored files (treatment photos add up) |

The largest cost driver at scale will be **Supabase Storage** once treatment photo uploads (L2) are enabled. Design: compress photos on upload, implement tiered storage (hot → cold → archive) for old treatment records.

---

## 5. Read vs Write Separation

Most database operations in SimpliSalon are reads (calendar views, client lookups, reporting). The write path is smaller: booking creation, form submission, message sends.

**Current:** Single Postgres instance handles reads and writes.

**Future (if needed):** Add a Postgres read replica for:
- Analytics and report queries
- Aggregation queries (NPS, revenue reports)
- Audit log reads

This is a Supabase-level configuration change, not an application change. The application uses separate client instances for reads vs writes.

---

## 6. Multi-Location Scaling Considerations (L2)

When the multi-location feature is introduced, the reporting layer will need to aggregate across multiple `salon_id` values within an organisation. This is the first scenario where cross-tenant (but same-organisation) queries are legitimately needed.

**Design:** Organisation-level reports use an admin-role query (bypassing RLS) with explicit `WHERE salon_id IN (organisation_salon_ids)` filtering. These queries run against a read replica to avoid impacting operational write performance.

---

## 7. Observability at Scale

Scalability without observability is dangerous. The platform needs to know when it's approaching limits before users notice.

**Metrics to track:**

| Metric | Alert Threshold | Action |
|---|---|---|
| API p95 latency | > 500ms | Investigate slow queries |
| DB connection pool utilisation | > 75% | Scale plan |
| QStash queue depth | > 10,000 jobs | Investigate worker throughput |
| CRON execution time | > 4 minutes | Batch the processing |
| Sentry error rate | > 0.1% of requests | Investigate error cause |
| Health endpoint | Not `healthy` | Page on-call |

**Dashboards:**
- Supabase dashboard: query performance, connection pool, storage usage
- Vercel analytics: function execution time, error rates
- Upstash dashboard: Redis commands, QStash queue depth
- Sentry: error volume, error trends

---

## 8. Scaling Roadmap

### Phase 1 — Immediate (current)
- Ensure all frequently-queried columns are indexed
- Add Redis caching for feature flags and service lists
- Confirm all CRON jobs process in batches, not full table scans

### Phase 2 — 1,000+ tenants
- Enable Postgres read replica for analytics queries
- Implement QStash fan-out for campaign processing
- Add structured logging with request duration

### Phase 3 — 5,000+ tenants
- Evaluate Supabase compute scaling (larger compute instance)
- Implement tiered storage for treatment photos
- Consider edge caching for public booking widget API
- Review and optimise the most expensive CRON queries

### Phase 4 — 10,000+ tenants
- Evaluate table partitioning for `bookings` and `message_logs` by `created_at`
- Consider CDN caching for the form template library
- Revisit CRON batch sizes and parallelism
- Evaluate service extraction for Documents & Forms if it becomes the performance bottleneck
