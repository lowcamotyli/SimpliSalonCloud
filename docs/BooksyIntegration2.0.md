# Production-Grade Booksy Email Ingestion Architecture for a SaaS Scheduling System

## Executive Summary and Reality Check

**1. Executive Summary**

You’re basically building a mission-critical integration on top of something that was never meant to be an integration interface: transactional emails. That *can* be made production-grade and very resilient, but only if you treat email like an event stream and design the pipeline like a payments system: durable ingest first, idempotent apply, continuous reconciliation, and loud failure detection.

### Recommended architecture in one sentence
Primary ingest via **Gmail push notifications (Watch) → entity["company","Google Cloud Pub/Sub","managed messaging service"] → history-based incremental fetch → durable raw email store + event log (Postgres/Supabase) → versioned parsing → idempotent domain apply → reconciliation jobs + operator tooling**, with a polling fallback and full replayability. citeturn6view1turn2view1turn3view0turn1search20turn8search1

### Should Gmail remain the main ingest channel?
Yes—**Gmail *can* be the main ingest channel**, but only if you switch from “poll + search + labels-state” to the **Watch + Pub/Sub + History API** model and you add explicit reconciliation to eliminate silent misses. Gmail’s own docs explicitly warn push can be delayed/dropped and recommend falling back to periodically calling `history.list`. citeturn6view1turn2view1

### IMAP vs Gmail API: better or worse?
For your stack and reliability goals, **IMAP is worse as a primary channel**:
- IMAP “real-time” (IDLE) depends on long-lived connections (annoying on serverless + harder to operate safely at scale).
- Gmail IMAP is subject to **sync/bandwidth limits** and can cause temporary suspensions if exceeded—not your typical failure mode you want in a critical ingest path. citeturn5search0turn5search9turn5search24
- Gmail API gives you **incremental sync via `historyId`** with explicit “404 → full sync” recovery semantics, which fits replay/reconciliation better than raw IMAP polling. citeturn2view1turn3view0

So: **Gmail API > IMAP** for a production ingestion pipeline *if* you implement it properly.

### Realistic reliability ceiling (important)
Even with a perfect pipeline, you cannot reach literal 100.000% because:
- Booksy might not send an email (upstream bug/config).
- Mail delivery might be delayed/bounced/filtered.
- Email template changes can reduce parsing confidence overnight.

What you *can* reach realistically is:
- **Near-zero “silent failures”** inside *your* system (everything is durable + monitored).
- **Near-zero missed emails that actually landed in the mailbox** (via reconciliation against Gmail over rolling windows).
- A controlled, visible “manual review” surface for ambiguous cancels/reschedules (instead of silently guessing). citeturn6view1turn3view0

### Assumptions (explicit)
I’m assuming:
- Each salon/tenant connects a mailbox (commonly entity["company","Gmail","email service"] / entity["organization","Google Workspace","enterprise productivity suite"]) that receives Booksy appointment emails.
- You can add a small amount of infrastructure outside entity["company","Vercel","cloud platform"] if needed (recommended for Pub/Sub handler).
- Your “appointments” domain model exists in your DB already; we’ll add integration tables alongside it.
- You can store sensitive tokens securely (preferably using entity["company","Supabase Vault","encrypted secrets feature"] or an external secret store). citeturn4search1turn4search5

## Current Risk Assessment of the Existing System

**2. Current Risk Assessment**

Below is a blunt risk assessment of: polling/search, labels-as-state, OAuth disconnects, regex parsing, cancellation/reschedule matching, silent loss, and lack of reconciliation.

### Polling/search (subject/body search)
**Priority: Critical**
- Polling isn’t inherently wrong, but **polling without an authoritative cursor** (like `historyId`) tends to devolve into “best effort” where you *think* you saw “everything matching the query.” Subtle query drift, Gmail search quirks, and timing gaps become silent misses.
- Gmail push docs explicitly say push can be delayed/dropped and recommend periodic `history.list` fallback. That’s basically Google telling you “don’t rely on any single mechanism.” citeturn6view1turn3view0

### Labels as processing state (processed/error)
**Priority: Critical**
Relying on Gmail labels as the state machine is fragile because:
- Label application is a side-effect call that can fail independently of parsing/apply.
- Labels can create notification loops and extra mailbox churn; Gmail warns about notification loops and rate limits. citeturn6view1
- Labels are neither transactional with your DB writes nor a durable audit trail. If your DB insert succeeded but label failed (or vice versa), you get divergence.

### OAuth disconnect / `invalid_grant`
**Priority: Critical**
This is a known footgun in Google integrations. Google explicitly lists reasons refresh tokens stop working, including: user revocation, token unused for 6 months, password change with Gmail scopes, “Testing” consent screen status causing 7‑day expiry, and reaching refresh-token limits (100 per account per client ID). citeturn11view0  
If you don’t treat this as a first-class failure state with proactive detection and a clean reauth flow, you’ll keep losing ingest.

### Parser based on regex over email templates
**Priority: High**
Regex parsing over HTML/text templates breaks when:
- Booksy tweaks copy, spacing, localisation, or adds marketing blocks.
- Different languages/encodings appear (quoted-printable, multipart/alternative, forwarded content).
- Cancellations/reschedules use different phrasing.
This isn’t “if” but “when”. The critical part is making parser failures loud + recoverable, not “trying harder with regex”.

### Cancellation and reschedule matching (no official booking ID)
**Priority: High**
Without a stable upstream booking ID, you’re forced into fuzzy matching. Risks:
- Two similar bookings (same client name, same service, same day) collide.
- Cancellations that refer only to “tomorrow at 5pm” are ambiguous.
- Reschedules that don’t explicitly mention the old slot force guesswork.

Your system must support *ambiguous* outcomes and route them to “manual review,” not auto-apply. (More on this in Matching/Idempotency.)

### Silent loss of emails/events
**Priority: Critical**
The biggest operational sin here is: *something stops working and nobody notices until a salon screams*.

Any architecture that doesn’t provide:
- a durable ingest ledger,
- continuous reconciliation,
- and alerting on “expected vs observed”
will keep producing silent failures.

### No full replay / reconciliation
**Priority: Critical**
Google’s `historyId` model is explicitly designed for incremental sync + full sync fallback on `404`. If you don’t model your pipeline around this (and don’t store raw emails durably), you can’t do reliable replay after outages. citeturn2view1turn3view0

## Target Architecture Overview

**3. Recommended Target Architecture**

This is the “best practical architecture” I’d actually ship for a critical salon workflow, given: no Booksy API/webhooks, your stack, and the need for high operational safety.

### Key design principles (non-negotiable)
- **Durable-first ingest**: store the raw input before doing anything clever.
- **At-least-once everywhere** + **idempotent consumers**: duplicates are fine; missing data is not. Pub/Sub is at-least-once by default; design for redelivery. citeturn1search20turn1search0turn1search16
- **Cursor-based incremental sync** (`historyId` checkpointing), with explicit “404 → full sync.” citeturn2view1turn3view0
- **Reconciliation as a product feature**, not a maintenance task.
- **Operator-grade tooling**: replay, reparse, quarantine, manual match, audit trail.

### Architecture layers (as requested)

#### Ingress layer
**Primary path: Gmail Watch + Pub/Sub + History API**
- For each connected mailbox:
  - call `users.watch` (renew daily; must renew at least every 7 days). citeturn6view0turn9view0
  - push notifications delivered to Pub/Sub; payload includes `emailAddress` and `historyId`. citeturn6view0
- Pub/Sub push subscription hits an HTTP endpoint (recommend entity["company","Google Cloud Run","serverless container platform"] for operational control; entity["company","Vercel","cloud platform"] is possible but I’d keep it “ack-fast only”). Pub/Sub retries if not acknowledged (non‑2xx or timeout). citeturn6view1turn1search0turn1search4

**Fallback path: scheduled catch-up polling**
- Even with push, Gmail explicitly warns notifications can be delayed/dropped and recommends periodically calling `history.list` after periods with no notifications. citeturn6view1
- So you run a periodic job (e.g., every 1–5 minutes) per mailbox to catch up using the stored `last_history_id`.

#### Event store / raw email store
Two-tier storage:
- **Raw email metadata & ledger** in Postgres (Supabase).
- **Raw email contents** (base64url RFC 2822 “raw”) in file storage (e.g., entity["company","Supabase Storage","object storage"]) with a strong hash (SHA-256) and immutable retention rules. Gmail `format=raw` is explicitly base64url in the `raw` field. citeturn4search12turn4search36

Why not store raw MIME directly in Postgres?
- You can, but it bloats DB + backups. Storage is more practical; DB stores integrity + pointers. citeturn4search2turn4search6

#### Normalization/parsing layer
- Fetch Gmail message → materialise a “raw_email” record → parse into a **canonical booking event**:
  - `booking.created`
  - `booking.cancelled`
  - `booking.rescheduled`
- Parsing is **versioned**, produces `confidence_score`, and never overwrites raw.
- Parser results are *append-only* facts; you can regenerate derived events by replaying raw emails.

#### Domain apply layer
- Takes canonical events + current appointment state.
- Applies changes via idempotent upserts with a deterministic idempotency key.
- Writes domain changes + an “integration apply record” transactionally (outbox-ish thinking: commit state + record of what you did together). The Transactional Outbox pattern exists specifically to prevent “DB updated but event publish failed” inconsistencies. citeturn8search1turn8search5turn8search32

#### Reconciliation layer
This is what kills silent failure.
- **Mailbox reconciliation job** (rolling window, e.g. last 14 days):
  - list all messages that look like Booksy notifications (query strategy described later)
  - ensure each has a corresponding `raw_email` row.
  - if missing: backfill `raw_email` and re-enter pipeline.
- **Domain reconciliation job**:
  - look for “created without matching cancel/reschedule” anomalies.
  - look for low-confidence events stuck in review past SLA.
- Gmail history records are typically available at least a week, but can be less; reconciliation should not depend exclusively on history. citeturn3view0turn2view1

#### Monitoring/alerting layer
- Metrics: lag, missing-ingest count, auth health, parser drift, DLQ growth.
- Alerts based on SLO burn / fast detection where appropriate (Google SRE workbook guidance is very practical here). citeturn8search3turn8search14turn8search7

#### Operator tooling / incident response layer
A dedicated admin surface (internal):
- per-tenant integration health: watch expiry, last successful fetch, backlog sizes
- event timeline (raw → parsed → applied)
- “replay from X” (historyId or time window)
- manual match UI for ambiguous cancels/reschedules
- audit log of operator actions

### Comparison of requested options (short, decisive)

- **Gmail Watch + Pub/Sub + History API**: best primary ingest because it provides cursor-based incremental sync and explicit recovery semantics. citeturn6view0turn2view1turn3view0
- **Fallback polling**: mandatory, because Gmail says push may be delayed/dropped. citeturn6view1
- **Checkpointing by `historyId`**: must-have; history IDs increase chronologically (not contiguous) and invalid/outdated IDs return 404 requiring full sync. citeturn2view1turn3view0
- **Dedupe**: must-have; Pub/Sub is at-least-once and may redeliver. citeturn1search20turn1search16
- **Durable event log**: must-have; enables replay, audit, and non-silent remediation (also matches outbox/event sourcing thinking). citeturn8search5turn8search1
- **DLQ**: must-have for hard failures; manual replay from DLQ is operator bread-and-butter.
- **Snapshots & replay**: must-have (at least at event-log layer). Gmail history is not a forever-log; your storage must be. citeturn2view1turn3view0turn3view0
- **Health checks/SLO**: must-have if you care about “5 minutes to detect breakage.” citeturn8search3turn8search14

## End-to-End Data Flow Scenarios

**4. End-to-End Data Flow**

I’ll describe each scenario as a deterministic pipeline. The key is: **every step writes a durable breadcrumb** so you can always answer: “Did we receive it? Did we parse it? Did we apply it? If not, why not?”

### New Booksy email arrives
1. Gmail receives message.
2. Gmail Watch triggers Pub/Sub notification with `{ emailAddress, historyId }`. citeturn6view0
3. Pub/Sub pushes to your ingress endpoint; endpoint **acks quickly** after writing a durable “notification received” record (do *not* do Gmail API calls before ack). Pub/Sub retries if not acknowledged. citeturn6view1turn1search0turn1search4
4. Worker picks up notification, locks mailbox row, reads `last_history_id`, calls `users.history.list` from that cursor. Invalid/outdated cursor yields 404 → full sync. citeturn2view1turn3view0
5. Worker extracts Gmail `message.id` + `threadId` from history records (history typically only contains id/threadId). citeturn2view1
6. For each message:
   - call `users.messages.get(format=raw)` and store the raw RFC 2822 base64url blob. citeturn4search12turn4search36
   - insert `raw_email` with unique constraint `(tenant_id, gmail_message_id)` (dedupe).
7. Parsing worker transforms raw into canonical booking event with parser version + confidence.
8. Apply worker performs idempotent domain update and writes apply/audit records.

### Cancellation email
Same ingest steps. Differences:
- Parser classifies event as `booking.cancelled`.
- Matching logic tries to link cancellation to an existing appointment:
  - if high confidence → apply cancel
  - if ambiguous → “manual review” queue with suggested candidates + risk score
- Either way, nothing is silent: unresolved cancellations create alerts if they sit too long, because cancellations are safety-critical for salon ops.

### Reschedule email
Same ingest steps. Differences:
- Parser aims to extract both “old slot” and “new slot” if present.
- Domain apply:
  - if the old appointment is matched confidently, update it (or represent as cancel+create internally, but audit it as reschedule).
  - if old slot cannot be identified, treat as “create new” but flag for review with a high risk score (this is where double-booking risk lives).

### OAuth reconnect / token refresh issues
- Every Gmail API call failure is classified:
  - `invalid_grant` / revoked → integration enters `AUTH_REQUIRED` state immediately (no retries pretending it’ll fix itself).
  - transient errors / quota → retries with backoff.
- Google explicitly lists multiple reasons refresh tokens stop working, including “Testing mode 7 days”, password change with Gmail scopes, and token limits. You should surface these as operator-facing diagnoses. citeturn11view0

### Parser failure
- Raw email is still stored and durable.
- Parsing writes a `parsed_event` row with `status=FAILED` + error payload + parser_version.
- Message is routed to:
  - auto-retry queue (if likely transient, e.g., temporary decode error)
  - DLQ + manual triage (if structural, e.g., template drift)
- Operator can:
  - re-run parsing with a newer parser version (replay)
  - manually classify / extract key fields (human-in-the-loop)

### Duplicate delivery
Expected in multiple places:
- Pub/Sub redelivery (at-least-once). citeturn1search20turn1search16
- Repeated notifications for same mailbox change.
- Polling overlap.

Mitigation:
- Unique constraints on raw ingest.
- Idempotency ledger on domain apply.
- Processing attempts recorded; “already processed” becomes a normal, non-error state.

### Delayed delivery (email arrives late)
- Gmail internal ordering uses `internalDate` (server acceptance time) which is more reliable than the Date header for normal SMTP mail. citeturn4search11
- Your system uses:
  - event occurrence time extracted from email content (appointment time)
  - ingest time (when you saw it)
- If a booking arrives “late” (appointment in the past or near-future), flag it and optionally notify the salon/operator.

### Temporary Gmail API outage / rate limiting
- Gmail API quotas exist per user and per project; you need rate limiting + backoff. citeturn0search2turn5search7
- Pub/Sub buffers notifications; your workers back off and catch up.
- If history cursor becomes too old (history typically available at least a week, sometimes less), a 404 forces full sync. citeturn2view1turn3view0

### Partial outage on your side (DB down, worker down)
- If DB is down:
  - ingress endpoint should **not ack** Pub/Sub push (so Pub/Sub retries). citeturn6view1turn1search0
- If parse/apply workers are down:
  - raw ingest continues → backlog grows → alerts fire → replay when recovered.

### Historical replay
Two replay modes:
- **Logical replay**: re-run parsing & apply from your own `raw_email` store (works even months later).
- **Mailbox replay**: perform full sync for a time window via Gmail `messages.list` + `messages.get` and backfill missing raw emails (bounded by Gmail retention and your query). Full sync steps are in Gmail sync guidance. citeturn3view0turn2view1

## State and Data Model for Supabase/Postgres

**5. State Model**

You want explicit, queryable state machines so “silent failure” is structurally hard.

### Event state machine (raw email → parsed event → apply)
Recommended states for a *raw email ingestion record*:
- `RECEIVED_NOTIFICATION` (optional, if you log notifications separately)
- `FETCHED_HEADERS`
- `FETCHED_RAW`
- `STORED_RAW`
- `PARSE_PENDING`
- `PARSED_OK`
- `PARSED_LOW_CONFIDENCE`
- `PARSE_FAILED`
- `CLASSIFIED` (created/cancel/reschedule)
- `APPLY_PENDING`
- `APPLIED_OK`
- `APPLY_FAILED_RETRYABLE`
- `DEAD_LETTERED`
- `REPLAYED` (annotation, not a terminal state)

Key rules:
- **Only one terminal “done”**: `APPLIED_OK` or `DEAD_LETTERED` (with explicit reason).
- Low confidence is *not* failure; it’s a controlled fork into manual review.

### Appointment sync status (domain object)
For each internal appointment that originated from Booksy-email:
- `SOURCE=BOOKSY_EMAIL`
- `SYNC_STATUS`:
  - `CONFIRMED_FROM_EMAIL`
  - `CANCELLED_FROM_EMAIL`
  - `RESCHEDULED_FROM_EMAIL`
  - `CONFLICT_NEEDS_REVIEW`
  - `ORPHANED` (e.g., cancellation received but no matching appointment found)

### Integration health status (per tenant/mailbox)
- `INGEST_HEALTH`:
  - `OK`
  - `DEGRADED` (backlog growing, increased failures)
  - `STALLED` (no successful fetch beyond threshold)
- `AUTH_STATUS`:
  - `OK`
  - `REFRESH_FAILING_RETRYABLE`
  - `AUTH_REQUIRED` (invalid_grant, revoked, etc.) citeturn11view0
- `WATCH_STATUS`:
  - `ACTIVE`
  - `EXPIRING_SOON`
  - `EXPIRED`
  - `UNKNOWN` (needs resync)
Gmail requires watch renewal at least every 7 days; recommended daily. citeturn6view0turn9view0

**6. Data Model / Tables (Supabase/Postgres)**

This is a concrete schema you can implement in Supabase Postgres.

### Core tables

#### `tenants`
Your existing tenant table.

#### `gmail_connections`
Stores per-tenant mailbox connection + cursors.

Key columns:
- `id uuid pk`
- `tenant_id uuid fk`
- `gmail_email text not null`
- `oauth_client_id text not null` (if multi-client)
- `token_secret_id uuid` (pointer into Supabase Vault or your encrypted secret row)
- `auth_status text not null`
- `auth_last_ok_at timestamptz`
- `auth_last_error_code text`
- `watch_topic text`
- `watch_expiration_at timestamptz`
- `watch_last_renewed_at timestamptz`
- `last_history_id text` (cursor)
- `last_full_sync_at timestamptz`
- `last_message_internal_date_ms bigint` (optional optimisation)
- `created_at`, `updated_at`

Indexes/constraints:
- `unique(tenant_id, gmail_email)`
- index on `watch_expiration_at`
- index on `auth_status`

Sources: watch has an `expiration` epoch millis, and must be renewed at least every 7 days. citeturn6view0turn9view0

#### `gmail_notifications`
Optional but recommended to make Pub/Sub ingest auditable.

Columns:
- `id uuid pk`
- `gmail_connection_id uuid fk`
- `pubsub_message_id text` (Pub/Sub messageId)
- `history_id text`
- `published_at timestamptz`
- `received_at timestamptz`
- `acked_at timestamptz`
- `status text` (`RECEIVED`, `QUEUED`, `PROCESSED`, `DROPPED`)
- `raw_payload jsonb`

Notes:
- Pub/Sub messageId is unrelated to Gmail message IDs. citeturn6view0

#### `raw_inbound_emails`
This is your durable ingest log.

Columns:
- `id uuid pk`
- `tenant_id uuid fk`
- `gmail_connection_id uuid fk`
- `gmail_message_id text not null`
- `gmail_thread_id text`
- `rfc_message_id text` (header Message-ID if present)
- `internal_date_ms bigint` (Gmail internalDate)
- `from_address text`
- `subject text`
- `snippet text`
- `label_ids text[]` (optional)
- `raw_storage_bucket text`
- `raw_storage_path text`
- `raw_sha256 text`
- `headers jsonb` (selected headers)
- `mime_structure jsonb` (optional)
- `ingested_at timestamptz not null`
- `ingest_status text not null`
- `last_error text`
- `attempt_count int not null default 0`

Constraints:
- `unique(gmail_connection_id, gmail_message_id)` (this is your first dedupe wall)
- index `(tenant_id, ingested_at desc)`
- index `(gmail_connection_id, internal_date_ms desc)`
- index `(ingest_status)`

Why store `raw_storage_*`?
Because `format=raw` is base64url RFC 2822 data and can be large; external storage is practical. citeturn4search12turn4search36turn4search2

#### `parsed_booking_events`
Derived, versioned output.

Columns:
- `id uuid pk`
- `tenant_id uuid fk`
- `raw_email_id uuid fk`
- `event_type text` (`CREATED`, `CANCELLED`, `RESCHEDULED`, `UNKNOWN`)
- `parser_version text not null`
- `parser_confidence numeric(5,4)` (0..1)
- `language_hint text`
- `extracted jsonb not null` (canonical payload)
- `event_fingerprint text not null` (deterministic hash; see matching section)
- `status text not null` (`PARSED_OK`, `LOW_CONF`, `FAILED`)
- `error_code text`
- `error_detail text`
- `created_at timestamptz`

Constraints:
- `unique(tenant_id, event_fingerprint)` (second dedupe wall)
- index `(tenant_id, created_at desc)`
- index `(status)`
- index `(event_type)`

#### `event_processing_attempts`
Every attempt at parse/apply is recorded.

Columns:
- `id uuid pk`
- `tenant_id uuid fk`
- `subject_type text` (`RAW_EMAIL`, `PARSED_EVENT`, `DOMAIN_APPLY`)
- `subject_id uuid`
- `stage text` (`FETCH`, `PARSE`, `APPLY`, `RECONCILE`)
- `attempt_no int`
- `started_at timestamptz`
- `ended_at timestamptz`
- `outcome text` (`OK`, `RETRY`, `FAIL`)
- `error_code text`
- `error_detail text`
- `next_retry_at timestamptz`

Indexes:
- `(subject_type, subject_id)`
- `(next_retry_at)`
- `(outcome)`

#### `appointment_external_links`
Bridges internal appointments to “Booksy-email identity”.

Columns:
- `id uuid pk`
- `tenant_id uuid fk`
- `appointment_id uuid fk`
- `source text` (`BOOKSY_EMAIL`)
- `external_key text` (your computed stable key)
- `created_from_event_id uuid fk`
- `last_seen_event_id uuid`
- `status text` (`ACTIVE`, `CANCELLED`, `SUPERSEDED`)
- `created_at`, `updated_at`

Constraints:
- `unique(tenant_id, source, external_key)`
- index `(appointment_id)`

#### `idempotency_ledger`
For exactly-once side effects *in your DB*.

Columns:
- `id uuid pk`
- `tenant_id uuid fk`
- `scope text` (`DOMAIN_APPLY`)
- `idempotency_key text not null`
- `consumed_by_event_id uuid`
- `created_at timestamptz`

Constraints:
- `unique(tenant_id, scope, idempotency_key)`

This is the “Idempotent Receiver/Consumer” backbone—store message identifiers to avoid duplicate side effects. citeturn8search4turn8search11

#### `reconciliation_runs` and `reconciliation_findings`
`reconciliation_runs`:
- `id uuid pk`
- `tenant_id uuid fk`
- `gmail_connection_id uuid fk`
- `window_start timestamptz`
- `window_end timestamptz`
- `mode text` (`HISTORY_CATCHUP`, `GMAIL_QUERY_BACKFILL`, `DOMAIN_SANITY`)
- `status text`
- `stats jsonb`
- timestamps

`reconciliation_findings`:
- `id uuid pk`
- `run_id uuid fk`
- `severity text` (`INFO`, `WARN`, `CRITICAL`)
- `finding_type text` (`MISSING_RAW_EMAIL`, `UNMATCHED_CANCEL`, etc.)
- `reference jsonb` (message ids, appointment ids, etc.)
- `status text` (`OPEN`, `RESOLVED`, `IGNORED`)
- timestamps

#### `alerts` and `operator_actions`
`alerts`:
- `id uuid pk`
- `tenant_id uuid fk`
- `type text` (`AUTH_REQUIRED`, `PIPELINE_STALLED`, `MISSING_EVENTS_SPIKE`)
- `severity text`
- `opened_at`, `resolved_at`
- `dedupe_key text` (avoid alert spam)
- `context jsonb`

`operator_actions`:
- `id uuid pk`
- `tenant_id uuid fk`
- `operator_user_id uuid`
- `action_type text` (`REPLAY`, `MANUAL_MATCH`, `FORCE_APPLY`, `IGNORE`)
- `target_type text`
- `target_id uuid`
- `reason text`
- `created_at timestamptz`

### Postgres-native queue implementation (practical on Supabase)
Use “jobs in DB” with `SELECT … FOR UPDATE SKIP LOCKED` to run workers safely across multiple instances. `SKIP LOCKED` is explicitly designed to skip rows already locked by another transaction. citeturn8search2turn8search17

### Scheduling on Supabase
Use entity["company","Supabase Cron","scheduled jobs module"] (pg_cron). Supabase docs describe that jobs are stored in `cron.job` and run status in `cron.job_run_details`. citeturn1search15turn1search7turn1search3

### Token storage
If you use Supabase Vault:
- Vault stores secrets encrypted at rest and is accessible via DB constructs. citeturn4search1turn4search9  
But be cautious with operational logging—don’t leak secrets into logs (treat DB statement logging carefully). citeturn4search1

Retention policy:
- raw emails: 90–180 days default (configurable per plan/tenant)
- parsed + audit: 1–2 years
- keep hashes and minimal headers longer if you need compliance evidence without full content

(Exact retention is a business/legal decision, but *technically* you need enough to replay and debug.)

## Gmail-Specific Reliability Design

**7. Gmail-Specific Reliability Design**

This is the “deep dive” section because Gmail is your upstream message broker.

### Is Gmail Watch + History API the best option?
Yes. It’s the most “integration-like” interface Gmail offers:
- Watch delivers a *signal* (historyId changed).
- History API provides *incremental changes* from a known cursor.
- Gmail explicitly documents how to renew watches, how to decode the notification payload, and how to catch up using `history.list`. citeturn6view0turn2view1turn3view0

### How to renew watch
- Gmail requires you to call `users.watch` at least every 7 days or updates stop; Google recommends calling watch once per day. citeturn6view0turn9view0
- Store `watch_expiration_at`.
- Run a daily job:
  - renew watch for every active mailbox
  - if renewal fails, raise an alert and move mailbox to degraded state.

### Handling `historyId` gaps and expiration
Facts you must design around:
- History IDs are chronological but **not contiguous** (random gaps). citeturn2view1
- An invalid/outdated `startHistoryId` typically returns **HTTP 404**, and Gmail tells you to do a full sync. citeturn2view1turn3view0
- A historyId is typically valid at least a week, but in rare cases only a few hours (so “weekly reconciliation” alone is not enough; you need frequent catch-up). citeturn2view1turn3view0

Practical algorithm (per mailbox):
1. Keep `last_history_id` in DB.
2. When notification arrives (with `new_history_id`):
   - enqueue a catch-up run.
3. Catch-up run:
   - call `history.list(startHistoryId=last_history_id)`
   - page through results
   - collect message IDs you care about
   - only after successfully persisting raw emails, advance `last_history_id` to the `historyId` returned by the API (not the pushed value). Gmail says: if no `nextPageToken`, store the returned `historyId` for future requests. citeturn2view1
4. If 404:
   - run full sync (`messages.list` + batch `messages.get`) and store `historyId` of the most recent message for future partial sync. citeturn3view0

### Detecting lost notifications
Gmail says notifications might be delayed/dropped and you must handle that gracefully—specifically by falling back to periodic `history.list` even if no push messages arrive. citeturn6view1

So you implement:
- a per-mailbox **“no notification” timer** (e.g., if no push in 10 minutes during business hours, run catch-up anyway)
- a **scheduled catch-up** every 1–5 minutes regardless (low-cost if no changes; `history.list` returns empty and you persist returned cursor)

### Maximum notification rate and why it matters
Gmail Watch has a **maximum rate of one event per second per watched user; exceeding notifications are dropped**. citeturn6view1  
This is precisely why you can’t rely on push alone and why you must treat push merely as a “wake-up signal”.

### Pub/Sub acknowledgement, retries, DLQ
- Gmail push guide: “All notifications must be acknowledged”; for push delivery, HTTP 200 acknowledges, otherwise Pub/Sub retries. citeturn6view1
- Pub/Sub retry policy is automatic and built-in. citeturn1search0
- Pub/Sub is at-least-once by default; redelivery is possible, so idempotency is required. citeturn1search20turn1search16

Recommendation:
- Use a Pub/Sub dead-letter topic (DLQ) for messages that can’t be delivered/processed after N attempts (operational sanity).
- Your push handler should do minimal work: validate request → persist notification → respond 2xx.

### Gmail API quotas and backoff
Gmail API usage limits exist per project and per user (quota units/min). citeturn0search2turn5search7  
This impacts you during:
- initial full sync for a mailbox
- reconciliation backfills
- bursty periods (many bookings)

Mitigations:
- batch `messages.get` (Gmail sync guidance recommends batching). citeturn3view0
- limit concurrency per mailbox (avoid exceeding per-user quotas)
- global concurrency caps per project
- exponential backoff on quota errors

### OAuth scopes (least privilege without breaking parsing)
Watch and history/list can run with `gmail.readonly` or even `gmail.metadata` (per API docs). citeturn9view0turn2view1  
But to parse bookings reliably you usually need body content. Gmail’s `format=raw` includes full email content, but `raw` is not usable with the `gmail.metadata` scope (format limitations). citeturn4search12turn4search20

So in practice:
- Use `https://www.googleapis.com/auth/gmail.readonly` (minimum that still allows reading raw/full).
- Avoid `gmail.modify` unless you truly need labels/mark-as-read (and you probably shouldn’t for state). citeturn9view0

### Refresh token reliability (kill `invalid_grant` incidents)
Google explicitly tells you to anticipate refresh tokens failing and lists root causes, including:
- user revoked access
- not used for six months
- password change with Gmail scopes
- “Testing” publishing status → refresh token expires in 7 days
- refresh token limit (100 per account per client ID) citeturn11view0

Concrete countermeasures:
- **Token heartbeats**: a daily “token check” that refreshes access token (or performs a no-op API call) so tokens are “used” regularly.
- Store `auth_last_ok_at` and alert if it’s stale.
- Immediate state transition to `AUTH_REQUIRED` on `invalid_grant`.
- Make reauth UX ridiculously clear and fast (salon-facing, not engineer-facing).

### Blast radius control
Per-tenant isolation:
- one mailbox = one processing lane
- separate cursors and queues
- strict per-mailbox rate limits

This prevents “one noisy tenant” from consuming quotas and breaking others.

### Separating read model from processing model
Treat Gmail as a read-only source:
- ingestion reads Gmail and materialises raw emails in your DB/storage
- downstream processing *never depends on Gmail availability* once raw is stored
That decoupling is what makes outages survivable.

## Parsing, Matching, and Idempotency

**8. Parsing Strategy**

Goal: robust parsing under template drift + localisation + forwarded messages, without turning your system into an LLM lottery.

### Layered extraction pipeline
1. **MIME normalisation**
   - parse multipart/alternative, choose best text representation
   - decode quoted-printable/base64 parts
   - normalise whitespace, line endings, unicode
2. **Header-based trust signals**
   - capture `From`, `Reply-To`, `Return-Path`, and `Authentication-Results` for security scoring
3. **Structured artefacts first**
   - Look for:
     - machine-readable numbers (phone, price, timestamps)
     - URLs that contain identifiers
     - calendar attachments (.ics) if present (do not assume; detect)
   - If .ics exists, parse iCalendar; iCalendar is standardised in RFC 5545. citeturn13search0
4. **Template-aware parsing (versioned)**
   - Maintain parser versions:
     - `booksy_v1_pl`
     - `booksy_v2_en`
     - etc.
   - Each parser outputs:
     - extracted fields
     - required-field completeness
     - confidence score
5. **Heuristic fallback**
   - keyword-based detection for event type:
     - created vs cancelled vs rescheduled
   - use locale dictionaries; detect language from content
6. **Classification + confidence**
   - define “must have” fields per event type:
     - created: start time, service, client or booking reference
     - cancelled: at least old start time + some client/service anchor
     - rescheduled: old + new slot (or strong reference)

### Confidence score (practical definition)
Confidence is not a vibe. Make it deterministic:
- +0.30 if appointment datetime extracted with timezone certainty
- +0.20 if client name extracted
- +0.15 if staff/provider extracted
- +0.15 if service extracted
- +0.10 if phone/email extracted
- +0.10 if “unique anchor” extracted (e.g., booking reference, or stable link token)

Thresholds (example):
- ≥0.85: auto-apply
- 0.60–0.85: apply with caution (maybe auto-apply create, but cancel/reschedule goes to review)
- <0.60: manual review only

### Golden corpus and regression tests
Must-have:
- store anonymised email fixtures (“golden files”) in repo
- expected canonical JSON outputs
- CI runs: parse corpus → diff output
This is the single best defence against “Booksy changed one sentence and everything died quietly”.

### Human-in-the-loop only where needed
Manual review queue should exist, but only for:
- ambiguous cancellations/reschedules
- low-confidence parses
- security anomalies (spoof risk)
Everything else should be automated.

**9. Matching and Idempotency (critical)**

You don’t have Booksy booking IDs. So you need a strategy that is:
- deterministic
- explainable to operators
- safe under ambiguity

### Step one: define your “synthetic booking identity”
Compute a tenant-scoped `external_key` as a hash over stable fields:

For **created** events (ideal):
- tenant_id
- appointment_start_at (normalised timezone)
- service name (normalised)
- staff name (normalised) if available
- client name (normalised) or client phone/email if available

For **cancel/reschedule** events:
- prefer a stable reference if email contains one (links, reference numbers)
- else use “old slot identity” from above

This becomes:
- `event_fingerprint` for dedupe at event level
- `external_key` for linking appointment records

### Deduplication strategy
- Primary dedupe: `(gmail_connection_id, gmail_message_id)` unique. Gmail message IDs are immutable identifiers in the message resource. citeturn4search0
- Secondary dedupe: `event_fingerprint` unique (prevents reprocessing same semantic event from forwarded/duplicated emails)
- Apply dedupe: `idempotency_key` stored in ledger; “already applied” is OK.

This is classic “idempotent consumer” thinking: message brokers redeliver; consumers must tolerate it. citeturn1search20turn8search4

### Matching cancellations/reschedules
Algorithm:
1. If email provides explicit unique anchor (best case): match directly.
2. Else if reschedule provides both old + new datetime: match old slot; update to new slot.
3. Else fuzzy candidate search:
   - find appointments within ±X hours
   - same staff (if present)
   - similar service string (token similarity)
   - similar client name (normalised)
4. Score candidates and decide:
   - if single candidate above threshold and margin vs second-best is large → auto-apply
   - otherwise → manual review with suggested candidates list

### When to auto-apply vs manual review
Rules I’d ship:
- `CREATED` events: auto-apply at lower threshold (because worst case is a duplicate booking you can spot)
- `CANCELLED` and `RESCHEDULED`: require higher threshold and/or explicit anchor (because wrong cancellation is catastrophic)

### Risk scoring surfaced to operators
Expose:
- why the system thinks it matched (field-by-field)
- confidence + risk
- “top 3 candidates” for manual resolution

This turns incident response from “panic” into “workflow”.

## Failure Modes, Security, Ops, and Rollout Decisions

**10. Failure Modes and Countermeasures**

Table as requested (condensed but operational):

| Failure mode | Detection | Mitigation | Fallback | User-visible impact | Operator action |
|---|---|---|---|---|---|
| Gmail disconnected (user revoked) | `invalid_grant` + `auth_last_ok_at` stale citeturn11view0 | Transition to `AUTH_REQUIRED`, stop pretending; alert immediately | Offer alternate ingest option if available; otherwise pause | New bookings not ingested | Trigger reauth flow; confirm watch renewal after reauth |
| Refresh token expired (Testing mode / time-based) | Token refresh fails; diagnose “Testing 7 days” citeturn11view0 | Move OAuth consent to Production; shorten reauth path | None | Same as above | Reauth + verify OAuth config |
| Gmail Watch expired | `watch_expiration_at` passed; no notifications citeturn6view0 | Daily renewal job; alert on failures | Poll `history.list` periodically citeturn6view1 | Potential delays | Renew watch; run catch-up |
| Pub/Sub outage / delivery issues | No notifications + stalled mailbox | Catch-up polling even with no pushes (explicit Gmail recommendation) citeturn6view1 | Scheduled `history.list` | Delay, not loss | Check Pub/Sub subscription + ingress health |
| Pub/Sub redelivery / duplicates | Duplicate pubsub_message_id; duplicate raw email inserts | Idempotency + unique constraints | N/A | None (should be invisible) | None |
| Gmail API 404 on history | `history.list` returns 404 → out-of-range citeturn2view1turn3view0 | Full sync | Full sync | Delay during resync | Run full sync job; monitor quotas |
| Gmail API quota exceeded | 429 / quota errors; rate metrics citeturn0search2turn5search7 | Backoff, throttle per mailbox, batch gets citeturn3view0 | Slow down processing | Delay | Temporarily reduce concurrency |
| Broken cron / scheduler | “no scheduled runs” alert; heartbeat missing | Dual scheduling (Supabase Cron + external) | Manual run endpoint | Backlog grows | Fix scheduling; run replay |
| Parser drift (template change) | Spike in `PARSE_FAILED` or low confidence; golden tests fail in CI | Version parser; roll out hotfix parser | Manual review queue | Delays, manual work | Create new parser version; replay raw emails |
| Duplicate/forwarded Booksy emails | fingerprint collisions; multiple raw emails | fingerprint dedupe + idempotency | N/A | None | None |
| Missing cancel email (Booksy didn’t send / not delivered) | Domain anomalies: appointment existed but client claims cancelled | Operational reality: cannot fully prevent | Manual confirmation workflow | Potential wrong schedule | Investigate with salon; optionally teach salon a “confirm list” workflow |
| Race condition in apply | Conflicting updates; serialization errors | Transactional apply + idempotency ledger | Retry | Minor delays | Monitor retries |
| DB outage (Supabase) | Ingress cannot persist → do not ack Pub/Sub citeturn6view1turn1search0 | Pub/Sub retries; backlog | None | Delays | Restore DB; processing catches up |
| Deployment rollback | Error rate spike; canary metrics | Keep processing stable via separate worker image/version | Replay after fix | Temporary delays | Rollback and replay |
| Corrupted state | Reconciliation shows inconsistencies | Rebuild projections from raw emails | Full replay | Possible duplicates until corrected | Run replay; audit |
| Malicious/spoofed email | Auth headers fail; sender mismatch; anomaly score | Quarantine suspicious emails | None | Prevents fraudulent bookings | Review quarantined items |
| Human error (operator) | Audit log shows action | Two-person rule for destructive actions | Undo/compensate via replay | Depends | Follow runbook; revert |

**11. Security and Trust Model**

Email spoofing is real. You’re ingesting instructions to create/cancel appointments, so treat it like accepting money.

### SPF/DKIM/DMARC fundamentals
- SPF authorises sending hosts for a domain (RFC 7208). citeturn7search1  
- DKIM cryptographically signs email with domain keys (RFC 6376). citeturn7search0  
- DMARC ties SPF/DKIM to the visible From domain and expresses policy (RFC 7489). citeturn7search2turn7search11  

### Practical trusted-sender strategy
For each tenant, define a trust policy:
- allowed From domains / addresses (Booksy domains observed)
- require `Authentication-Results` showing pass for DKIM or SPF and DMARC alignment where possible (Gmail typically includes Authentication-Results headers; treat failures as suspicious, not necessarily invalid) citeturn7search11turn7search15
- check for consistent sending infrastructure patterns (Return-Path, Message-ID patterns) but don’t hardcode too aggressively.

### Header validation
Store and evaluate:
- `From`, `Sender`, `Return-Path`
- `Authentication-Results`
- `Received` chain (at least for debugging)
Then compute a `trust_score`. Low trust → quarantine/manual review.

### MIME/HTML sanitisation
Never render raw HTML emails directly in your admin UI without sanitisation. Store raw but render a safe text representation.

### OAuth token storage and least privilege
- Use `gmail.readonly` unless you truly need modify. citeturn9view0
- Store refresh tokens encrypted (Vault or equivalent). Vault provides encrypted secret storage. citeturn4search1turn4search9
- Strict tenant isolation: RLS on all integration tables; service-role access only from backend ingestion workers.

### Replay abuse prevention
Replay endpoints should be internal-only, authenticated, and audited (`operator_actions` table). Rate-limit replays and require reasons.

**12. Observability and Ops**

You asked: “how do we know in 5 minutes the integration is breaking” and “in 15 minutes we’re losing visits”.

This is exactly SLO-style alerting territory. The Google SRE workbook is clear: turn SLOs into actionable alerts. citeturn8search3turn8search7

### Must-have metrics (per tenant and global)
Ingestion health:
- `last_gmail_api_success_age_minutes`
- `watch_expiration_seconds_remaining`
- `history_lag` = (latest historyId seen - last_history_id applied) [store as derived]
- `raw_emails_ingested_count` (per hour)
- `raw_emails_unprocessed_count`
- `pubsub_notifications_received_count`
- `pubsub_notifications_dlq_count`

Parsing:
- `parse_success_rate`
- `parse_low_conf_rate`
- `parse_failure_rate`
- distribution of confidence scores

Domain apply:
- `apply_success_rate`
- `apply_retry_queue_depth`
- `manual_review_queue_depth`
- `unmatched_cancellation_count`

Auth:
- `auth_status` state
- token refresh success rate
- number of tenants in `AUTH_REQUIRED`

### Dashboards (what an operator sees)
One “Booksy Email Integration” dashboard:
- Top row: number of tenants OK / degraded / auth-required
- Middle: “freshness” heatmap: last successful ingest time per tenant
- Bottom: backlog and DLQ

### Alerts (concrete)
Fast alerts (page / urgent):
- Tenant transitions to `AUTH_REQUIRED` (invalid_grant). citeturn11view0
- `watch_expiration_at < now + 12h` and renewal failing. citeturn6view0
- No successful Gmail API call for tenant in >10 minutes during business hours.
- Reconciliation finds missing raw emails in last 24h window.

Slow alerts (ticket):
- Parser low-confidence rate increases by >X% compared to baseline (template drift suspicion).
- Manual review queue aged > 2 hours for cancellations/reschedules.
- Apply retry queue depth > threshold.

### “5 minutes to know it’s breaking”
You know it’s breaking if **any** of these trip:
- `auth_last_ok_at` staleness (token refresh failing) citeturn11view0
- ingest backlog rising + no progress
- watch renewal failing or expired (should not happen if daily renewal is healthy) citeturn6view0

### “15 minutes to know we’re losing visits”
You detect likely loss by:
- reconciliation results: **missing raw emails** in mailbox window (this is your strongest signal)
- sudden drop to near-zero Booksy-like emails in hours when normally there are some (tenant-specific baseline)
- sustained parsing failure spikes (events exist but can’t be applied)

### How operator recovers state
Operator runbook (high level):
1. Check tenant status: auth/watch/lag/backlog
2. If auth: trigger reauth, then run “full sync last 14 days”
3. If watch expired: renew watch and run history catch-up
4. If parser drift: deploy new parser version and replay raw emails from last X days
5. If backlog: scale workers / reduce per-tenant concurrency caps

**13. Rollout Plan**

You asked for Stage 0–3. Here’s a realistic incremental path.

### Stage 0: Hotfixes on current system (days)
Scope (must-have):
- Stop treating labels as source of truth (keep DB truth even if you still label for UI).
- Add explicit “integration heartbeat” per tenant: last successful Gmail call timestamp.
- Add alerting for `invalid_grant` and “no progress” stalls (even if rest remains the same). citeturn11view0

Risk: low  
Effort: low  
Reliability gain: medium (mainly detection + less silent failure)  
Migration: none  
Rollback: trivial

### Stage 1: Stabilisation (1–2 weeks)
Scope:
- Implement structured queue in Postgres + SKIP LOCKED workers. citeturn8search2turn8search17
- Store raw emails durably (Supabase Storage + pointer in DB). citeturn4search2turn4search6turn4search12
- Implement idempotency ledger for domain apply.

Risk: medium  
Effort: medium  
Reliability gain: high (replayability + fewer duplicates/ghost states)  
Migration: dual-write parsing results while still applying old flow  
Rollback: switch apply back to old path, keep raw store

### Stage 2: Durable ingest with Gmail Watch + History (2–4 weeks)
Scope:
- Set up Pub/Sub topic + grant publish rights to Gmail API push service account. citeturn2view0
- Implement watch renewal job (daily). citeturn6view0
- Implement per-mailbox history cursor catch-up worker + 404 full sync fallback. citeturn2view1turn3view0
- Keep polling fallback on schedule (because Gmail explicitly says push may be dropped). citeturn6view1

Risk: medium  
Effort: medium-high  
Reliability gain: very high (real incremental sync, less reliance on search)  
Migration: run new ingest in shadow mode first (store raw + parse, but don’t apply), compare outputs  
Rollback: revert to polling path; keep raw store

### Stage 3: Full event-sourced / replayable architecture (ongoing)
Scope:
- canonical event model becomes primary integration contract
- all domain changes driven by parsed events
- reconciliation jobs become daily/continuous
- operator tooling polished (manual matching, replay controls)

Risk: medium-high  
Effort: high  
Reliability gain: “enterprise-grade” (especially operationally)  
Migration: gradually move tenants over; support dual pipelines temporarily  
Rollback: keep event log; roll back apply logic by switching consumer version

**14. Decision Matrix**

| Option | Summary | Reliability | Ops burden | Fit with your stack | Notes |
|---|---|---:|---:|---:|---|
| A: current polling Gmail + small fixes | Patch what exists | Medium at best | Medium | High | Still search/query fragile; hard to prove “no misses” |
| B: Gmail Watch + History + event store | Recommended practical target | High | Medium | Medium-High | Gmail explicitly documents watch renewal, payload, and fallback strategy citeturn6view0turn6view1turn2view1 |
| C: generic IMAP inbox | Replace Gmail API with IMAP | Medium | High | Medium | Long-lived connections + bandwidth limits/suspension risks citeturn5search0turn5search24 |
| D: forwarding mailbox + parser (your domain) | Control ingest by receiving mail directly | Very High (if adopted) | Medium | Medium | Best if salons can set Booksy notification email to your address; avoids OAuth fragility |
| E: partner/private API later | Real webhook/API | Highest | Low-Medium | Medium | Not available now; design should allow swapping source later |

**Clear recommendation:** **B as baseline**, with **D as a “premium reliability” path** you introduce when possible (or as migration target), because “remove OAuth dependency” is the cleanest way to eliminate your biggest recurring incident class. OAuth failure modes are documented and unavoidable long-term. citeturn11view0

**15. Final Recommendation**

### Best practical architecture (verdict)
- **Primary**: Gmail Watch + Pub/Sub + History catch-up + durable raw email store in Supabase + versioned parsing + idempotent apply + reconciliation.
- **Secondary (strongly recommended)**: offer an optional “forward to our inbox” path (your domain + inbound email provider) to reduce OAuth blast radius for salons that can adopt it.

### Best “target” (end-state)
Event-sourced integration: raw emails as immutable facts, parsed canonical events as projections, domain state as another projection, with reconciliation guaranteeing “no silent failures”.

### Best “right now” (next 1–2 weeks)
If I had to pick 3 things to do immediately (highest ROI):
1. **Durable raw email store + unique constraints** (stop losing “source of truth”).
2. **Auth/watch health model + alerting** (make failures loud within minutes). citeturn11view0turn6view0
3. **Reconciliation job (rolling window)** that proves you processed everything that’s in the mailbox (this kills silent loss). citeturn6view1turn3view0

### Must-have vs nice-to-have (straight)
Must-have:
- Watch + History cursoring + 404 full sync recovery citeturn2view1turn3view0
- Durable raw store (replay) citeturn4search12turn4search36
- Idempotency ledger + dedupe constraints citeturn1search20turn8search4
- Reconciliation layer citeturn6view1turn3view0
- Loud auth/watch/lag alerts citeturn11view0turn6view0
- Operator tooling (replay + manual match + audit)

Nice-to-have (but valuable):
- optional inbound mailbox on your domain (removes OAuth incidents)
- .ics parsing if Booksy emails contain calendar invites (detect; don’t assume). RFC 5545 defines iCalendar format. citeturn13search0
- exactly-once Pub/Sub (still keep idempotency; it’s never enough alone) citeturn1search1

### Irreducible risks (even after “best” implementation)
- Booksy email not sent / delayed / bounced (outside your control)
- Template drift causing low confidence (mitigated by golden corpus + manual review, but not eliminated)
- Ambiguous cancellations/reschedules without stable IDs (mitigated by risk-based manual workflow)

If you want, I can also provide:
- a concrete worker topology (how many workers, what concurrency caps per tenant)
- the exact Gmail history catch-up pseudo-code (with cursor rules)
- sample SQL migrations for the schema above (Supabase-ready)