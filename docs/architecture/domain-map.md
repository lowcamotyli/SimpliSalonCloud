# SimpliSalon — Domain Map

Version: 2.0
Status: Target Architecture

---

## 1. Overview

This document maps all platform domains, their responsibilities, internal components, and inter-domain relationships. Each domain is a cohesive unit of business capability. Domains are implemented as internal modules within the monolith (`lib/<domain>/`), not as separate services.

---

## 2. Domain Inventory

### 2.1 Identity & Tenancy

**Responsibility:** The foundational domain. Manages the lifecycle of salons (tenants), users, roles, permissions, subscription plans, and feature availability. Every other domain depends on this domain for context.

**Internal components:**
- Tenant management (salon creation, slug, settings)
- User management (profiles, invitations, onboarding)
- Authentication (Supabase Auth — JWT issuance, session management)
- RBAC (role assignment, JWT claims, permission resolution)
- Feature flags (plan-based feature gating, per-tenant overrides)
- Subscription state (current plan, trial status, feature entitlements)

**Owns tables:** `salons`, `profiles`, `employees` (identity aspects), `subscription_plans`, `feature_flags`

**Exposes to other domains:**
- `getAuthContext()` — resolves authenticated user, salon, and permissions
- `hasFeature(salonId, feature)` — checks feature availability
- `hasRole(userId, role)` — checks user role within tenant
- Tenant context object consumed by all API route handlers

**Maturity level:** L1

---

### 2.2 Scheduling

**Responsibility:** Manages time-based resources: bookings, calendars, employee availability, equipment allocation, and slot computation. The operational heartbeat of the platform.

**Internal components:**
- Booking management (create, update, cancel, status transitions)
- Calendar view aggregation
- Availability computation (employee slots, working hours, breaks)
- Equipment scheduling (equipment booking, conflict detection)
- Public booking API (tokenised access for widgets and external integrations)
- Atomic booking creation (RPC `create_booking_atomic`)
- Blacklist enforcement (client restriction checks)

**Owns tables:** `bookings`, `equipment_bookings`, `working_hours`, `breaks`, `schedule_overrides`

**Publishes events:**
- `booking.created`
- `booking.completed`
- `booking.cancelled`
- `booking.no_show`

**Consumes from:**
- Identity & Tenancy (auth context, feature flags)
- Client & CRM (client lookup/creation)
- Staff & Operations (employee schedules)
- Documents & Forms (post-booking form dispatch)

**Maturity level:** L1 core; L2 adds multi-session treatment plan bookings

---

### 2.3 Client & CRM

**Responsibility:** Manages the full lifecycle of client relationships. Owns client profiles, visit history, segmentation, blacklisting, and lifecycle state that drives automation.

**Internal components:**
- Client profiles (personal data, contact, notes, tags)
- Visit history aggregation
- Client segmentation engine (tag-based, visit frequency, spend-based)
- Blacklist management (scoring, manual entries)
- Client lifetime value tracking
- Client search and deduplication

**Owns tables:** `clients`, `client_tags`, `blacklist_entries`, `blacklist_scores`

**Publishes events:**
- `client.created`
- `client.blacklisted`
- `client.reactivated`
- `client.segment_changed`

**Consumes from:**
- Scheduling (booking events for visit history)
- Communications (message delivery status)
- Billing (subscription events that affect CRM feature availability)

**Maturity level:** L1

---

### 2.4 Communications

**Responsibility:** All outbound and inbound message flows. Owns SMS and email sending, message templates, campaign execution, and delivery tracking. Provides the messaging infrastructure that the Automation Engine uses.

**Internal components:**
- SMS sender (SMSAPI.pl integration)
- Email sender (Resend integration)
- Message template engine (variable interpolation, per-tenant templates)
- Campaign processor (segmentation → job creation → QStash enqueue → delivery)
- Campaign management (CRUD, scheduling, status tracking)
- Automation message dispatch (triggered by Automation Engine events)
- Delivery logs and webhook processing
- Usage tracking (SMS credits, campaign limits)

**Owns tables:** `message_templates`, `crm_campaigns`, `crm_messages`, `message_logs`, `sms_messages`

**Publishes events:**
- `message.delivered`
- `message.failed`
- `campaign.completed`

**Consumes from:**
- Identity & Tenancy (feature flags: `crm_sms`, `crm_campaigns`)
- Client & CRM (segments for campaign targeting)
- Automation Engine (workflow-triggered message requests)
- Billing (SMS wallet balance)

**Maturity level:** L1

---

### 2.5 Documents & Forms

**Responsibility:** The platform's document intelligence layer. Manages dynamic form schemas, treatment card templates, client form instances, consent records, and encrypted health data. This is a high-compliance domain.

**Internal components:**
- Form template registry (built-in templates, salon-specific templates)
- Template versioning (schemas evolve; submitted responses reference the schema version at submission time)
- Client form lifecycle (dispatch, fill, submit, review)
- Consent management (GDPR consent capture, `health_consent_at`, signature storage)
- Encrypted response store (AES-256-GCM for `health` and `sensitive_health` fields)
- Public form access (tokenised public URLs, no auth required)
- Form-to-service assignment (linking templates to specific services)
- Pre-appointment form automation (triggered by Scheduling)
- Import pipeline (treatment card import, review, compliance gates)
- Conditional field logic (show/hide fields based on previous answers)
- Data category classification (`general`, `health`, `sensitive_health`, `consent`)

**Owns tables:** `form_templates`, `client_forms`, `pre_appointment_responses`, `form_field_responses` (encrypted)

**Publishes events:**
- `form.dispatched`
- `form.submitted`
- `consent.captured`

**Consumes from:**
- Identity & Tenancy (tenant context, GDPR text resolution)
- Scheduling (post-booking form dispatch trigger)
- Storage layer (signature and photo upload)

**Maturity level:** L1 (basic forms) → L2 (full treatment card library, conditional logic, versioning) → L3 (regulatory audit trails)

---

### 2.6 Treatment Records

**Responsibility:** The clinical documentation layer. Owns the structured history of what was done to a client, with which device, by which practitioner, using which protocol. This domain is the foundation for L2 and L3 capabilities.

**Note:** This domain is partially present in the current system via Documents & Forms and booking notes. The target architecture formally separates it as a distinct domain with its own data model.

**Internal components:**
- Treatment visit records (structured per-visit documentation)
- Treatment protocols (reusable protocol definitions: device settings, session counts, intervals)
- Multi-session treatment plans (linking bookings across sessions)
- Protocol version tracking (treatments evolve; historical records reference the protocol version used)
- Before/after photo management (linked to treatment records, stored in Object Storage)
- Equipment utilisation records (which device was used at what settings)
- Practitioner notes (rich text, per-visit)

**Owns tables:** `treatment_records`, `treatment_protocols`, `treatment_plans`, `treatment_sessions`, `treatment_photos`

**Publishes events:**
- `treatment.completed`
- `treatment_plan.milestone_reached`
- `treatment_plan.completed`

**Consumes from:**
- Scheduling (booking completion trigger)
- Documents & Forms (form responses attached to treatment records)
- Staff & Operations (practitioner identity)
- Identity & Tenancy (feature flag: `treatment_records`)

**Maturity level:** L2 (basic treatment records) → L3 (full protocol tracking, audit trails)

---

### 2.7 Billing & Commerce

**Responsibility:** All commercial flows. Owns subscription management, payment processing, invoice generation, feature entitlement activation, and SMS wallet operations.

**Internal components:**
- Subscription manager (create, upgrade, downgrade, cancel, trial)
- Payment processing (Przelewy24 integration)
- Invoice management
- SMS wallet (top-up, balance tracking, deduction)
- Dunning management (past-due handling, retry logic)
- Feature activation on payment success
- Usage reporting

**Owns tables:** `subscriptions`, `invoices`, `payment_transactions`, `sms_wallet`

**Publishes events:**
- `subscription.activated`
- `subscription.upgraded`
- `subscription.cancelled`
- `subscription.past_due`
- `payment.succeeded`
- `payment.failed`
- `sms_wallet.low_balance`

**Consumes from:**
- Identity & Tenancy (salon context for plan lookup)

**Maturity level:** L1

---

### 2.8 Staff & Operations

**Responsibility:** Manages the human operational layer of the salon. Owns employee records, working schedules, payroll computation, and equipment registry.

**Internal components:**
- Employee management (profiles, roles, contact, service assignments)
- Working hours and schedule management
- Payroll computation (commission, hourly, fixed — configurable per employee)
- Equipment registry (device catalogue, maintenance tracking)
- Role assignment within salon context

**Owns tables:** `employees`, `working_hours`, `breaks`, `payroll_entries`, `equipment`, `equipment_types`

**Publishes events:**
- `employee.added`
- `employee.schedule_changed`

**Consumes from:**
- Identity & Tenancy (user–employee linking)
- Scheduling (bookings for payroll computation)

**Maturity level:** L1; L2 adds equipment utilisation tracking

---

### 2.9 Analytics & Reporting

**Responsibility:** Aggregates operational data into business intelligence views. Provides revenue analysis, NPS tracking, service performance, and staff productivity reports.

**Internal components:**
- Revenue reports (by period, service, employee)
- NPS and satisfaction score aggregation
- Top services analysis
- Staff productivity metrics
- CSV export (UTF-8 BOM for Excel compatibility)
- Usage reports (subscription usage, feature utilisation)

**Owns tables:** None — reads from other domain tables via controlled queries. May materialise aggregate views for performance.

**Publishes events:** None

**Consumes from:**
- Scheduling (bookings, completion data)
- Client & CRM (visit history)
- Communications (delivery stats, campaign performance)
- Billing (revenue data)
- Documents & Forms (survey/NPS responses)

**Maturity level:** L1; L2 adds treatment efficacy analytics

---

### 2.10 Automation Engine

**Responsibility:** The lifecycle automation backbone. Evaluates trigger conditions and executes workflow steps: dispatching forms, sending messages, updating client state, triggering campaigns. The engine is stateless — it reacts to events and delegates execution to other domains.

**Internal components:**
- Trigger registry (what events can trigger automations)
- Automation rule evaluation (condition matching per tenant configuration)
- Workflow step executor (dispatch form, send message, update state, queue task)
- CRON job orchestration (scheduled trigger evaluation)
- QStash job producer (enqueue async steps)
- Kill switch integration (per-feature automation enables/disables)

**Owns tables:** `crm_automations`, `automation_logs`, `notification_settings` (configuration)

**Publishes events:** (via delegation to other domains)

**Consumes from:**
- All other domains (as event sources)
- Identity & Tenancy (feature flags, notification settings)
- Communications (message dispatch)
- Documents & Forms (form dispatch)

**Maturity level:** L1 (basic reminders, surveys, pre-appointment flows) → L2 (treatment plan automations, protocol-driven reminders) → L3 (compliance-driven notifications)

---

### 2.11 Integrations

**Responsibility:** The external connectivity layer. Manages all connections to third-party platforms: booking marketplaces, messaging providers, payment gateways, calendar services. Provides stable adapter interfaces so external API changes are absorbed at the integration layer.

**Internal components:**
- Booksy integration (email-based sync, webhook receiver, booking import processor)
- Gmail/Google integration (OAuth, email parsing for Booksy flow)
- SMSAPI.pl adapter (outbound SMS, delivery webhook)
- Resend adapter (transactional email)
- Przelewy24 adapter (payment initiation, webhook verification)
- Integration health monitoring
- Webhook signature verification utilities
- Integration configuration per tenant

**Owns tables:** `integration_configs`, `booksy_sync_logs`, `booksy_pending_emails`

**Publishes events:**
- `booksy.booking_imported`
- `booksy.sync_completed`
- `payment.webhook_received`

**Consumes from:**
- Identity & Tenancy (per-tenant integration credentials)
- Scheduling (booking write target for Booksy imports)
- Client & CRM (client write target for Booksy imports)

**Maturity level:** L1; extensible for new integrations via adapter pattern

---

## 3. Domain Dependency Graph

```
Identity & Tenancy ──────────────────────────────────────────► [all domains]
                                                                 (auth context, feature flags)

Billing & Commerce ──────────────────────────────────────────► Identity & Tenancy
                                                                 (activates features)

Scheduling ──────────────────────────────────────────────────► Client & CRM
                         └──────────────────────────────────► Staff & Operations
                         └──────────────────────────────────► Documents & Forms (dispatch)
                         └──────────────────────────────────► Automation Engine (events)

Client & CRM ────────────────────────────────────────────────► Communications
                         └──────────────────────────────────► Automation Engine

Communications ──────────────────────────────────────────────► Automation Engine (triggered by)

Automation Engine ───────────────────────────────────────────► Communications (dispatch)
                         └──────────────────────────────────► Documents & Forms (dispatch)
                         └──────────────────────────────────► Scheduling (reads events)

Documents & Forms ───────────────────────────────────────────► Treatment Records
                                                                 (forms attached to records)

Treatment Records ───────────────────────────────────────────► Scheduling
                         └──────────────────────────────────► Documents & Forms

Analytics & Reporting ───────────────────────────────────────► [reads all domains]
                                                                 (read-only aggregation)

Integrations ────────────────────────────────────────────────► Scheduling (import target)
                         └──────────────────────────────────► Client & CRM (import target)
```

---

## 4. Domain-to-Module Mapping (Current → Target)

| Domain | Current Location | Target Module Path |
|---|---|---|
| Identity & Tenancy | `lib/supabase/`, `lib/rbac/`, `lib/middleware/` | `lib/identity/` |
| Scheduling | `app/api/bookings/`, `lib/equipment/` | `lib/scheduling/` |
| Client & CRM | `app/api/clients/`, `app/api/crm/` | `lib/clients/`, `lib/crm/` |
| Communications | `lib/messaging/` | `lib/communications/` |
| Documents & Forms | `lib/forms/` | `lib/documents/` |
| Treatment Records | (nascent — in forms + booking notes) | `lib/treatment-records/` |
| Billing & Commerce | `lib/payments/` | `lib/billing/` |
| Staff & Operations | `app/api/employees/`, `lib/payroll/` | `lib/staff/` |
| Analytics & Reporting | `app/api/reports/` | `lib/analytics/` |
| Automation Engine | `app/api/cron/`, `lib/messaging/campaign-processor.ts` | `lib/automation/` |
| Integrations | `lib/booksy/`, integration route handlers | `lib/integrations/` |
