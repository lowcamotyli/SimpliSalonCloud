# SimpliSalon — System Context

Version: 2.0
Status: Target Architecture

---

## 1. Purpose

This document defines the system boundary of SimpliSalon — the external actors, systems, and services that the platform interacts with. It establishes what is inside the platform boundary versus what is external, and how each external entity communicates with the platform.

---

## 2. System Context Diagram

```
                         ┌─────────────────────────────────────┐
                         │           EXTERNAL ACTORS            │
                         └─────────────────────────────────────┘

  Salon Owner/Manager  ──────────────────────────────────────────────────┐
  (browser / mobile)                                                       │
                                                                           │ HTTPS (authenticated)
  Salon Staff          ──────────────────────────────────────────────────┤
  (browser)                                                                │
                                                                           ▼
  Client               ──── booking form ──── HTTPS (public) ────► ┌──────────────────────────────┐
  (browser / mobile)   ──── pre-appt form ─── HTTPS (tokenised) ──►│                              │
                        ──── treatment form ── HTTPS (tokenised) ──►│      SimpliSalon Platform    │
                        ──── survey ──────────  HTTPS (tokenised) ──►│      (Next.js + Supabase)    │
                                                                      │                              │
  Booking Widget       ──── public API ────── HTTPS (API key) ───►  │                              │
  (embed on salon site)                                               └─────────────┬────────────────┘
                                                                                    │
                         ┌─────────────────────────────────────┐                   │
                         │           EXTERNAL SERVICES          │                   │
                         └─────────────────────────────────────┘                   │
                                                                                    │
  Supabase ◄──────── Postgres RLS, Auth, Storage, Realtime ──────────────────────►│
                                                                                    │
  Upstash ◄────────── Redis (rate limiting, cache) ──────────────────────────────►│
  QStash ◄─────────── Message queue (campaigns, automation) ────────────────────►│
                                                                                    │
  Vercel ◄──────────── Hosting, Cron jobs, Edge functions ────────────────────────►│
                                                                                    │
  Sentry ◄──────────── Error tracking, performance monitoring ────────────────────►│
                                                                                    │
  SMSAPI.pl ◄───────── SMS delivery ──────────────────────────────────────────────►│
              ──────── Delivery webhooks ────────────────────────────────────────►│
                                                                                    │
  Resend ◄──────────── Transactional email delivery ──────────────────────────────►│
           ──────────── Delivery webhooks ───────────────────────────────────────►│
                                                                                    │
  Przelewy24 ◄──────── Payment processing ────────────────────────────────────────►│
              ──────── Payment webhooks ─────────────────────────────────────────►│
                                                                                    │
  Booksy ◄──────────── Webhook (booking events) ───────────────────────────────►│
  Gmail ◄────────────── Email sync (Booksy booking emails) ───────────────────────►│
                                                                                    │
  Google Calendar ◄─── Calendar sync (future) ────────────────────────────────────►│
```

---

## 3. External Actors

### 3.1 Salon Owner / Manager

**Who:** The primary administrative user of the platform. Responsible for salon configuration, staff management, billing, and overall platform settings.

**Interaction channels:**
- Dashboard (authenticated HTTPS, browser)
- Settings, billing, reports sections
- API integrations setup

**Trust level:** Authenticated, role-bound (`owner` or `manager`). Operations are scoped to the user's tenant.

**Security notes:** Owner role has access to billing, integrations, and full configuration. The platform must ensure that tenant-scoped operations cannot be escalated to affect other tenants.

---

### 3.2 Salon Staff (Practitioners / Receptionists)

**Who:** Employees of the salon who perform bookings, manage client interactions, document treatments, and fill in treatment cards.

**Interaction channels:**
- Dashboard (authenticated HTTPS, browser)
- Calendar, bookings, clients, forms sections

**Trust level:** Authenticated, role-bound (`employee`). Limited to own-scope calendar and client views per RBAC policy.

---

### 3.3 End Client (Salon Customer)

**Who:** The salon's customer. Interacts with public-facing flows only — never with the authenticated dashboard.

**Interaction channels:**
- Public booking page (unauthenticated, salon-scoped API key)
- Pre-appointment form (single-use token link, delivered by SMS)
- Treatment / consent form (single-use token link)
- Satisfaction survey (single-use token link)

**Trust level:** Unauthenticated. All public endpoints validate token authenticity server-side. Rate limiting applies. The client never has a platform account.

**Privacy notes:** The client submits sensitive personal and health data. This data is encrypted, and the public-facing surfaces must not expose internal IDs or other clients' data.

---

### 3.4 Booking Widget Operator

**Who:** A third party embedding the SimpliSalon public booking widget on an external website (typically the salon's own site).

**Interaction channels:**
- Public booking API (`/api/public/*`) authenticated with an API key

**Trust level:** API key-authenticated. Rate limited. Operates in read-only mode for availability and services; writes bookings on behalf of the salon.

---

## 4. External Services

### 4.1 Supabase

**Role:** Core infrastructure provider: PostgreSQL database, Auth (JWT issuance, session management), Object Storage (files, photos, signatures), optional Realtime (future).

**Communication:** Supabase JS SDK (server-side via SSR client), direct Postgres connections via pooler.

**Data flow:** All persistent data lives in Supabase. Auth tokens are issued by Supabase Auth and validated at the application layer. Sensitive documents use Supabase Storage with signed URLs.

**Dependency risk:** High. Supabase is the foundational data layer. The architecture does not abstract away Supabase at this stage — that would add complexity without benefit for a small team.

---

### 4.2 Upstash Redis + QStash

**Role:** Redis provides distributed rate limiting and cache. QStash provides durable message queuing for campaign processing and automation workflows.

**Communication:** Upstash HTTP API (Redis REST, QStash REST).

**Data flow:** Rate limit counters per tenant/endpoint, campaign job queue, automation step queue.

**Fallback:** In-process in-memory rate limiter is available for development and CI environments without Upstash credentials.

---

### 4.3 Vercel

**Role:** Hosting platform. Serves the Next.js application, executes Edge and Serverless functions, and runs Cron Jobs for scheduled automation triggers.

**Communication:** Platform-managed. Cron jobs invoke platform-internal `/api/cron/*` endpoints on defined schedules.

**Data flow:** Vercel does not store application data. It provides compute and routing.

---

### 4.4 Sentry

**Role:** Error tracking and performance monitoring.

**Communication:** Sentry SDK (server and client side).

**Data flow:** Error events, performance traces. Sensitive client data must not be included in Sentry payloads (scrubbed before transmission).

---

### 4.5 SMSAPI.pl

**Role:** SMS delivery provider.

**Communication:**
- Outbound: REST API from platform to SMSAPI.pl for message send
- Inbound: Webhook from SMSAPI.pl to `/api/webhooks/sms` for delivery status updates

**Data flow:** Phone numbers, message content, delivery status codes. Phone numbers are personal data and must be handled with GDPR compliance.

---

### 4.6 Resend

**Role:** Transactional email delivery.

**Communication:**
- Outbound: Resend SDK / REST API
- Inbound: Webhook from Resend to `/api/webhooks/email` for delivery status

**Data flow:** Email addresses, message content, delivery status.

---

### 4.7 Przelewy24

**Role:** Payment processing gateway for Polish market.

**Communication:**
- Outbound: REST API for transaction creation and verification
- Inbound: Signed webhook for payment status notifications to `/api/webhooks/p24`

**Data flow:** Transaction amounts, session IDs, merchant verification. No card data transits through the platform (PCI scope avoided).

**Security notes:** All Przelewy24 webhooks must verify the merchant signature before processing any payment state changes.

---

### 4.8 Booksy

**Role:** Booking marketplace integration. Booksy is a third-party platform where some salon clients book appointments; those bookings must be synchronised into SimpliSalon.

**Communication:**
- Webhook: Booksy sends booking events to the platform (direct webhook, future)
- Email-based sync: Currently the primary integration path — Booksy sends booking confirmation emails to the salon's Gmail; the platform parses these via Gmail API and imports bookings
- Cron-driven sync: Periodic checks for unprocessed emails

**Data flow:** Booking data, client names, contact information. Significant data quality variation; the integration uses a parser with fallback to a `pending_emails` queue for ambiguous cases.

**Fragility note:** The email-based sync path is brittle by nature (depends on Booksy email format stability). The architecture should prioritise migrating to a direct webhook or API-based integration when Booksy makes this available.

---

### 4.9 Google / Gmail

**Role:** OAuth provider for user authentication (Google Sign-In) and Gmail API access for Booksy email parsing.

**Communication:** Google OAuth 2.0, Gmail API (read scope).

**Data flow:** Auth tokens, email content for Booksy sync. Gmail access is scoped to the minimum required (read emails from Booksy sender).

---

## 5. Platform Boundary Summary

| Entity | Inside Platform | Outside Platform |
|---|---|---|
| Booking data | Yes | No |
| Client profiles | Yes | No |
| Encrypted form responses | Yes | No |
| Payment transaction records | Yes | Card data — No |
| SMS/email content at send time | Yes (before transmission) | Delivery infrastructure |
| Authentication tokens | Issued by Supabase; validated by platform | — |
| Booking marketplace inventory | No | Booksy |
| Email delivery infrastructure | No | Resend, SMSAPI |
| Compute / hosting | No | Vercel |
| Database infrastructure | No | Supabase |

---

## 6. Future External Systems (Planned)

| System | Purpose | Stage |
|---|---|---|
| Google Calendar | Two-way calendar sync for practitioners | L2 |
| WhatsApp Business API | Additional messaging channel for client communications | L2 |
| Accounting systems (e.g. iFirma, Fakturownia) | Invoice export, financial reporting | L2 |
| Before/after photo AI analysis | Automated progress tracking for treatment plans | L3 |
| Regulatory compliance APIs (RODO, GDPR data subject requests) | Automated data subject request handling | L3 |
