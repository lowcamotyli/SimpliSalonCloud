# SimpliSalon — Data Architecture

Version: 2.0
Status: Target Architecture

---

## 1. Data Storage Overview

| Store | Technology | Purpose |
|---|---|---|
| Primary database | Supabase PostgreSQL | All relational business data |
| Object storage | Supabase Storage | Files, photos, consent signatures |
| Cache / rate limit | Upstash Redis | Per-request rate counters, short-lived cache |
| Message queue | Upstash QStash | Durable async job payloads |

---

## 2. Relational Database Architecture

### 2.1 Database Strategy

The platform uses a **single-database, schema-per-tenant** approach — specifically, a **single schema with RLS (Row Level Security) for tenant isolation**. All tenants share the same tables and schema.

**Rationale:**
- Simplest operational model for a small team
- Supabase RLS is mature and well-tested
- No schema migration complexity across tenant-specific schemas
- Tenant isolation enforced declaratively by the database, not application code

This decision is appropriate for the current scale. Physical database separation per tenant can be introduced later for enterprise customers with specific compliance requirements (see [ADR-004](adr/004-tenant-isolation.md)).

### 2.2 Core Schema Domains

**Identity & Tenancy:**
```sql
salons              (id, slug, name, settings, features, plan, subscription_status, ...)
profiles            (id, salon_id FK, role, email, ...)
feature_flags       (id, salon_id FK, feature_key, enabled, expires_at, ...)
```

**Scheduling:**
```sql
bookings            (id, salon_id FK, client_id FK, employee_id FK, service_id FK,
                     start_time, end_time, status, notes, pre_form_sent, survey_sent, ...)
equipment_bookings  (id, booking_id FK, equipment_id FK, start_time, end_time, ...)
working_hours       (id, employee_id FK, day_of_week, start_time, end_time, ...)
breaks              (id, employee_id FK, ...)
```

**Client & CRM:**
```sql
clients             (id, salon_id FK, first_name, last_name, phone, email,
                     notes, tags, blacklisted, created_at, ...)
blacklist_entries   (id, salon_id FK, client_id FK, reason, ...)
blacklist_scores    (id, client_id FK, score, computed_at, ...)
```

**Communications:**
```sql
message_templates   (id, salon_id FK, name, channel, body, variables, ...)
crm_campaigns       (id, salon_id FK, name, template_id FK, target_segment,
                     scheduled_at, status, ...)
crm_automations     (id, salon_id FK, trigger_type, conditions, steps, enabled, ...)
message_logs        (id, salon_id FK, client_id FK, channel, status, sent_at, ...)
sms_messages        (id, salon_id FK, client_id FK, body, status, ...)
```

**Documents & Forms:**
```sql
form_templates      (id, salon_id FK, name, schema JSONB, data_category,
                     version, is_builtin, service_ids, ...)
client_forms        (id, salon_id FK, client_id FK, booking_id FK,
                     template_id FK, template_version, status,
                     submitted_at, health_consent_at, ...)
form_field_responses (id, client_form_id FK, field_key, value_encrypted TEXT,
                      data_category, ...)
pre_appointment_responses (id, booking_id FK, token_hash, submitted_at, ...)
```

**Treatment Records (L2+):**
```sql
treatment_records   (id, salon_id FK, client_id FK, booking_id FK,
                     employee_id FK, protocol_id FK, notes_encrypted, ...)
treatment_protocols (id, salon_id FK, name, version, schema JSONB, ...)
treatment_plans     (id, salon_id FK, client_id FK, protocol_id FK,
                     total_sessions, completed_sessions, status, ...)
treatment_sessions  (id, plan_id FK, booking_id FK, session_number,
                     completed_at, ...)
treatment_photos    (id, record_id FK, storage_path, photo_type, taken_at, ...)
```

**Billing & Commerce:**
```sql
subscriptions       (id, salon_id FK, plan, status, current_period_end, ...)
invoices            (id, salon_id FK, amount, status, invoice_number, ...)
sms_wallet          (id, salon_id FK, balance, ...)
```

**Staff & Operations:**
```sql
employees           (id, salon_id FK, user_id FK, name, role_in_salon,
                     services JSONB, ...)
payroll_entries     (id, salon_id FK, employee_id FK, period, amount, ...)
equipment           (id, salon_id FK, name, type, ...)
equipment_types     (id, name, ...)
services            (id, salon_id FK, name, duration, price, ...)
```

**Integrations:**
```sql
integration_configs (id, salon_id FK, provider, config_encrypted JSONB, ...)
booksy_sync_logs    (id, salon_id FK, synced_at, status, ...)
booksy_pending_emails (id, salon_id FK, email_id, raw_data, created_at, ...)
```

---

## 3. Data Categories and Sensitivity Classification

All data in the platform is classified into sensitivity tiers. This classification drives encryption decisions, access control, and retention policies.

| Tier | Classification | Examples | Encryption |
|---|---|---|---|
| T1 | Public | Salon name, service names, public availability | None |
| T2 | Internal | Booking times, employee schedules, invoice amounts | Postgres encryption at rest (disk level) |
| T3 | Personal (PII) | Client names, phone numbers, email addresses | Postgres at rest + TLS in transit |
| T4 | Health data | Health questionnaire answers, medical history notes | **Application-layer AES-256-GCM** |
| T5 | Sensitive health | Sensitive conditions, treatment photos, consent signatures | **Application-layer AES-256-GCM + separate key management** |

---

## 4. Encryption Architecture

### 4.1 Transport Encryption

All communication between clients (browser, external services, integrations) and the platform uses TLS 1.2+. Supabase connections use TLS. Upstash connections use TLS. There are no unencrypted communication channels.

### 4.2 Database Encryption at Rest

Supabase provides disk-level encryption for the Postgres database and Object Storage. This protects against physical media theft but does not protect against a compromised database connection or a rogue Supabase admin.

### 4.3 Application-Layer Encryption (Tier 4 and 5)

Health data fields (`data_category = health` or `sensitive_health`) are encrypted **before** they are written to the database. Decryption happens **only** in the application layer, in response to an authenticated and authorised request.

**Algorithm:** AES-256-GCM
- 256-bit key derived from a tenant-scoped master key
- Random 12-byte IV per encryption operation
- Authentication tag prevents tampering
- Encrypted value stored as `base64(iv + ciphertext + auth_tag)`

**Key management (current):** Per-tenant encryption keys stored in environment variables (`FORM_ENCRYPTION_KEY`). A single key is used for all tenants in the current implementation.

**Key management (target L2/L3):** Per-tenant encryption keys, rotatable independently, stored in a secrets manager (Vault or Supabase Vault). Key rotation is possible without decrypting all data (re-encryption on access or batch rotation).

### 4.4 Token Security

Public form tokens are:
- Derived from a random UUID plus a tenant-scoped secret
- Stored as SHA-256 hash in the database (the raw token is only in the URL)
- Single-use: invalidated on first successful submission
- Time-limited: expire 48 hours after issuance (configurable per form type)

---

## 5. Tenant Data Isolation

Full details in [multi-tenant-architecture.md](multi-tenant-architecture.md). Summary:

- Every table that contains tenant-scoped data has a `salon_id` column
- RLS policies on every tenant-scoped table enforce `salon_id = auth.get_user_salon_id()`
- The application never bypasses RLS except for admin operations using the service role client, which is explicitly restricted to server-side code
- Cross-tenant queries are architecturally impossible for the authenticated user client

---

## 6. Data Lifecycle and Retention

| Data Type | Retention Policy | Deletion Mechanism |
|---|---|---|
| Booking records | 7 years (tax compliance) | Soft delete, hard delete after retention period |
| Client personal data | As long as active + 3 years, or until deletion request | GDPR deletion flow (anonymise, not delete by default) |
| Health form responses | As long as active + 5 years, or until deletion request | Encrypted deletion (key destruction) or anonymisation |
| Treatment photos | Client consent-dependent, minimum 2 years | Linked to treatment record; deleted with record |
| Message logs | 2 years | Scheduled cleanup job |
| Audit logs | 5 years | Append-only, no deletion |
| Payment records | 7 years (legal requirement) | No deletion |
| CRON job logs | 90 days | Scheduled cleanup |

---

## 7. Audit Logging

Audit logs record security-sensitive operations: access to health data, form submissions, consent captures, booking state changes, authentication events, and administrative actions.

**Audit log record structure:**
```
audit_logs (
  id          UUID,
  salon_id    UUID NOT NULL,
  actor_id    UUID,                  -- user or system
  actor_type  TEXT,                  -- 'user' | 'system' | 'integration'
  action      TEXT NOT NULL,         -- 'form.viewed', 'consent.captured', etc.
  entity_type TEXT,                  -- 'client_form', 'booking', etc.
  entity_id   UUID,
  metadata    JSONB,                 -- action-specific context (no PII values)
  ip_address  INET,
  created_at  TIMESTAMPTZ NOT NULL
)
```

Audit logs are append-only. No UPDATE or DELETE is permitted on the audit_logs table (enforced by RLS and DB trigger).

---

## 8. Object Storage Architecture

Files stored in Supabase Storage are organised per tenant in isolated buckets or prefixed paths:

```
/salons/{salon_id}/
  /signatures/{client_form_id}/{field_key}
  /treatment-photos/{treatment_record_id}/{photo_id}
  /documents/{document_id}
```

Access control:
- Signed URLs with short expiry (15 minutes) for client downloads
- Server-side upload/download only for health-sensitive files (no direct client uploads)
- Bucket-level policies enforce tenant isolation at the storage layer

---

## 9. GDPR and Privacy Architecture

### Data Subject Rights

| Right | Implementation |
|---|---|
| Right to access | Tenant-initiated export of all client data; future: self-service portal |
| Right to erasure | Anonymisation of personal fields (name, phone, email replaced with tombstone values); encrypted data: key destruction |
| Right to portability | CSV/JSON export of client data |
| Right to rectification | Standard edit flows; with audit log entry |

### Consent Architecture

- GDPR consent is captured as an explicit form field (`data_category = consent`) in forms
- Health data consent (`health_consent_at`) is a prerequisite gate: the form will not show health questions until consent is captured
- All consent events are immutable records in the audit log
- Consent text is rendered dynamically with the salon's registered name and applicable data officer details

### Data Minimisation

The import pipeline for treatment cards classifies each field by `data_category` before allowing import. Fields classified as `sensitive_health` require a compliance review step. This prevents over-collection of health data through careless template design.

---

## 10. Database Migration Strategy

Migrations are managed via Supabase migration files (`supabase/migrations/`). Conventions:

- One file per logical change
- Filename: `YYYYMMDDHHMMSS_description.sql`
- Migrations are forward-only; rollback is a new migration
- RLS policies are always included in the same migration as the table they protect
- After every migration: `supabase gen types typescript --linked > types/supabase.ts`

**Migration safety rules:**
- Never drop a column without a deprecation period (column becomes nullable, then dropped in a later migration)
- Never change a column's type destructively
- Always add `NOT NULL` columns with a DEFAULT value in the same migration
- Index-adding migrations on large tables must use `CREATE INDEX CONCURRENTLY`
