# SimpliSalon — Bounded Contexts

Version: 2.0
Status: Target Architecture

---

## 1. Purpose

This document defines the bounded contexts of the SimpliSalon platform using Domain-Driven Design vocabulary. A bounded context is a boundary within which a particular domain model is consistently defined and applied. Concepts that exist in multiple contexts have different meanings, different representations, and different lifecycle rules in each context.

Understanding bounded contexts prevents the most common architectural failure mode: using the same model everywhere until the system becomes impossible to evolve.

---

## 2. Bounded Contexts

### BC-1: Identity & Access

**Ubiquitous language:** Tenant, User, Role, Permission, Claim, Plan, Feature, Entitlement

**Core invariants:**
- Every user belongs to exactly one tenant (salon)
- A user's effective permissions are the intersection of their role and the tenant's feature entitlements
- Feature entitlements are derived from the active subscription plan
- JWT claims are the authoritative source of role and permission for request-time decisions; the database is the source of truth for persistence

**Context boundaries:**
- Owns authentication and authorisation decisions
- Does not know about bookings, clients, or messages
- Exposes: `AuthContext`, `FeatureFlag`, `Role` — these are primitive shared concepts used by all other contexts but never mutated by them

**Integration with other contexts:** All other contexts consume `AuthContext` as a read-only primitive. No other context can modify roles or feature flags — they call Identity & Access to check.

---

### BC-2: Appointment Scheduling

**Ubiquitous language:** Booking, Slot, Availability, Service, Appointment, Equipment Booking, Cancellation, No-Show

**Core invariants:**
- A booking occupies a contiguous time slot on an employee's calendar
- A booking may also occupy an equipment slot; both must be available
- A booking cannot be created if the client is blacklisted
- Booking state transitions are linear: `pending → confirmed → completed | cancelled | no_show`

**The concept of "Client" here:** In this context, a client is a reference identifier (client_id) plus minimal contact data needed for scheduling. The full client profile lives in BC-3. Scheduling does not own or enrich client data.

**The concept of "Service" here:** A service is a duration and resource requirement (which employee types, which equipment). Pricing and descriptions belong to the Catalog context (currently embedded in Scheduling but could be separated as L3 complexity grows).

**Integration with other contexts:**
- Emits `booking.created`, `booking.completed`, `booking.cancelled`, `booking.no_show` events consumed by Automation Engine and Treatment Records
- Reads client blacklist status from Client & CRM context before accepting a booking
- Writes to Equipment Scheduling sub-context

---

### BC-3: Client Relationship

**Ubiquitous language:** Client, Contact, Visit History, Segment, Tag, Lifetime Value, Blacklist

**Core invariants:**
- A client belongs to exactly one tenant
- A client's segment is derived from their visit history and spend patterns; it is recomputed periodically
- A blacklisted client cannot book; the blacklist score is updated by the Automation Engine based on configured rules

**The concept of "Client" here (vs BC-2):** In this context, the client is a rich entity with history, preferences, tags, and relationship metadata. Scheduling sees the client as a booking party. CRM sees the client as a relationship to cultivate.

**Integration with other contexts:**
- Exposes client segment data consumed by Communications for campaign targeting
- Receives visit events from Scheduling to maintain visit history
- Receives message delivery events from Communications to track engagement

---

### BC-4: Communications

**Ubiquitous language:** Message, Template, Campaign, Recipient, Delivery, Channel (SMS/Email), Segment Filter, Send Window

**Core invariants:**
- Messages are sent on behalf of a tenant; tenant configuration determines sender identity and channel credentials
- A campaign targets a segment; the segment is resolved at send time, not at campaign creation
- Message templates use interpolation variables; variables are resolved per recipient
- SMS credits are consumed atomically; messages are not sent if the wallet has insufficient balance

**The concept of "Client" here:** A recipient — an ID and a contact channel (phone number or email). Communications does not know about treatment history, consent, or bookings.

**Integration with other contexts:**
- Receives dispatch requests from Automation Engine
- Reads segment definitions from Client & CRM to resolve campaign recipients
- Deducts SMS credits from Billing & Commerce

---

### BC-5: Documents & Forms

**Ubiquitous language:** Form Template, Form Schema, Form Field, Field Type, Data Category, Client Form, Consent Record, Signature, Health Data, Submission Token

**Core invariants:**
- Every form field has a `data_category`: `general`, `health`, `sensitive_health`, `consent`
- Fields with `data_category = health` or `sensitive_health` require prior `health_consent` from the client before display
- Responses to `sensitive_health` fields are encrypted with AES-256-GCM before persistence; the key is per-tenant
- A submission token is single-use; it becomes invalid after the form is submitted
- A form template version is immutable after it has been used in a live submission; new versions create new template records

**The concept of "Consent" here:** An explicit, timestamped, per-form act by the client. A GDPR consent capture is a distinct field type that must be present in forms collecting personal data. Health consent is a prerequisite gate, not a field.

**Integration with other contexts:**
- Receives form dispatch triggers from Scheduling (post-booking) and Automation Engine (lifecycle)
- Attaches submitted forms to Treatment Records (via foreign key reference)
- Resolves tenant GDPR data from Identity & Tenancy for dynamic consent text

---

### BC-6: Treatment Records

**Ubiquitous language:** Treatment Record, Treatment Plan, Protocol, Session, Device Parameters, Before Photo, After Photo, Practitioner Note

**Core invariants:**
- A treatment record references exactly one booking (the session that produced it)
- A treatment plan spans multiple sessions; its progress is tracked against a protocol
- Device parameters are recorded at session time; retroactive changes are not permitted
- Before/after photos are stored in Object Storage; the treatment record holds references, not binary data
- A treatment record is considered complete only when all required protocol fields are filled

**The concept of "Client" here:** The subject of clinical documentation. The treatment record domain needs only the client identifier for linkage; the client's full profile (contact, preferences) belongs to BC-3.

**Integration with other contexts:**
- Created from `booking.completed` events from Scheduling
- Attaches form submissions from Documents & Forms
- Emits `treatment.completed` and `treatment_plan.completed` events consumed by Automation Engine

---

### BC-7: Billing & Commerce

**Ubiquitous language:** Subscription, Plan, Feature Entitlement, Invoice, Payment, Wallet, Top-Up, Dunning, Trial

**Core invariants:**
- Feature entitlements are activated only after a successful payment confirmation from the payment gateway
- An invoice is immutable after it is issued
- The SMS wallet balance cannot go negative; messages are blocked if balance is insufficient
- Dunning is triggered automatically after a defined grace period following a failed payment

**The concept of "Feature" here:** An entitlement flag derived from the subscription plan. Billing knows which flags to activate; Identity & Access knows how to enforce them. These two contexts must stay synchronised via events.

**Integration with other contexts:**
- Emits `subscription.activated`, `subscription.cancelled`, `payment.succeeded` events consumed by Identity & Tenancy (to update feature flags)
- Receives SMS credit deduction requests from Communications

---

### BC-8: Automation Engine

**Ubiquitous language:** Trigger, Condition, Workflow, Step, Kill Switch, Automation Rule, CRON, Queue Job

**Core invariants:**
- An automation is owned by a tenant and operates only within that tenant's data scope
- Every automation has a kill switch; if the kill switch is off, the automation does not execute regardless of triggers
- Automation steps are idempotent where possible; the system records execution state to prevent duplicate sends
- The engine does not own message content or form content; it delegates dispatch to Communications and Documents & Forms

**The concept of "Event" here:** A business occurrence (booking created, treatment completed, client inactive for N days) that may trigger automation evaluation. Events are lightweight: an event type plus a reference to the entity that changed.

**Integration with other contexts:**
- Subscribes to events from: Scheduling, Treatment Records, Client & CRM, Billing
- Delegates dispatch to: Communications (messages), Documents & Forms (forms)
- Reads automation rules and kill switch configuration from its own store

---

### BC-9: Integrations

**Ubiquitous language:** Integration, Adapter, Webhook, Sync, Pending Import, Mapping, External Reference

**Core invariants:**
- Each integration is configured per tenant; credentials are encrypted at rest
- External IDs are mapped to internal IDs; the mapping is owned by the Integrations context
- Webhook processing is idempotent; duplicate events from the same external source do not create duplicate records
- Integration failures are recorded and surfaced to the tenant; they do not silently drop data

**The concept of "Booking" here (Booksy context):** An external reference to an appointment in a third-party system, translated into SimpliSalon's internal booking model via the import processor. The translation is lossy in both directions.

**Integration with other contexts:**
- Writes to Scheduling (imported bookings)
- Writes to Client & CRM (imported clients)
- Reads per-tenant credentials from Identity & Tenancy

---

## 3. Shared Kernel

These concepts are shared across multiple bounded contexts without ownership ambiguity. They are primitive types — small, stable, and widely referenced.

| Concept | Definition | Used By |
|---|---|---|
| `TenantId` / `SalonId` | UUID identifier for a tenant | All contexts |
| `UserId` | UUID identifier for a user | Identity, Scheduling, Documents, Treatment Records |
| `ClientId` | UUID identifier for a client | Scheduling, CRM, Documents, Treatment Records, Communications |
| `BookingId` | UUID identifier for a booking | Scheduling, Treatment Records, Documents, Automation |
| `AuthContext` | Resolved auth: `{ user, salonId, role, permissions }` | All API-layer contexts |
| `FeatureFlag` | String key for a platform feature | Identity, Billing, Automation |

---

## 4. Context Integration Patterns

### Pattern 1 — Shared Database (current)

All contexts share the same Postgres database. Context boundaries are enforced by code convention (modules do not query other domains' tables directly) and by RLS policies. This is appropriate for the modular monolith phase.

**Rule:** A domain module may only query tables it owns. Cross-domain data access goes through a service function exposed by the owning domain.

### Pattern 2 — Domain Events (target)

Significant state changes in a context are published as named events. Other contexts subscribe and react. Events are currently delivered via QStash (async, durable) for automation workflows and via in-process function calls for synchronous reads.

**Target:** Formalise a lightweight event bus abstraction (`lib/events/`) that unifies in-process and async event delivery. This decouples producers from consumers without requiring a distributed message broker.

### Pattern 3 — Anti-Corruption Layer (Integrations)

External systems (Booksy, payment providers) speak their own language. The Integrations context contains anti-corruption layers that translate external models into SimpliSalon's internal domain models. No other context ever sees raw external API responses.

---

## 5. Context Boundaries — What Not to Cross

The following cross-context data accesses are explicitly prohibited in the target architecture:

| Violation | Why It's Prohibited |
|---|---|
| Communications querying `bookings` table directly | Scheduling owns booking data; Communications should receive booking information via events or through a service call to Scheduling |
| Automation Engine writing to `client_forms` directly | Documents & Forms owns form lifecycle; Automation Engine calls the form dispatch service |
| Analytics reading `encrypted_responses` | Decryption requires access to tenant encryption keys; analytics reads must go through the Documents & Forms decryption service |
| Integrations writing directly to `clients` table | Client & CRM owns client identity; Integrations calls the client upsert service and receives back a `ClientId` |
| Any context updating `feature_flags` directly | Identity & Tenancy owns feature flag state; Billing emits events, Identity & Tenancy updates flags |
