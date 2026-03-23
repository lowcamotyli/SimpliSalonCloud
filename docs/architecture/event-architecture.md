# SimpliSalon — Event Architecture

Version: 2.0
Status: Target Architecture

---

## 1. Overview

The SimpliSalon platform uses a **lightweight event-driven architecture** for inter-domain coordination and workflow automation. Events are not a replacement for synchronous service calls — they complement them. Domain state changes that have downstream consequences (trigger automation, update another domain's derived data, kick off async processing) are expressed as events.

The platform deliberately avoids full event sourcing. The relational database is the system of record. Events are signals that something changed, not the primary storage format.

---

## 2. Event Delivery Mechanisms

The platform uses two delivery mechanisms, chosen based on the coupling and reliability requirements of each event type:

### 2.1 In-Process Event Dispatch (Synchronous, Lightweight)

Used for: events that trigger immediate, low-latency domain reactions within the same request lifecycle (e.g. booking created → check if a pre-appointment form should be queued).

**Implementation:** A lightweight in-process event bus (`lib/events/bus.ts`). Domain services call `eventBus.emit(event)`. Subscribers registered at application startup react synchronously within the same request. No external infrastructure required.

**Suitable for:** notification gating checks, immediate state updates, logging side-effects.

**Not suitable for:** fan-out to many recipients, operations that could time out the HTTP request, retryable workflows.

### 2.2 QStash Message Queue (Async, Durable)

Used for: events that trigger async workflows — campaign delivery, treatment plan automation, high-volume message dispatch.

**Implementation:** Route handlers or CRON endpoints enqueue jobs to QStash via the Upstash QStash API. QStash delivers the job to a consumer endpoint (`/api/queue/*`) with automatic retry on failure.

**Suitable for:** campaign fan-out, automation workflow execution, retry-required operations, long-running processing.

**Not suitable for:** low-latency reactions, simple state updates, in-request side effects.

### 2.3 Vercel Cron (Scheduled Polling)

Used for: time-based triggers that are not naturally event-driven (e.g. "find all bookings tomorrow that have not had a pre-appointment form sent").

**Implementation:** `vercel.json` schedules cron endpoints. Cron endpoints poll the database for qualifying records and process them. Each cron run is idempotent — records are marked to prevent double processing.

---

## 3. Domain Event Catalogue

### Scheduling Domain

| Event | Trigger | Consumers |
|---|---|---|
| `booking.created` | Booking persisted successfully | Automation Engine, Documents & Forms (form dispatch gate) |
| `booking.completed` | Booking status → `completed` | Automation Engine (survey trigger), Treatment Records (record creation gate) |
| `booking.cancelled` | Booking status → `cancelled` | Automation Engine (cancellation notification) |
| `booking.no_show` | Booking status → `no_show` | Automation Engine (no-show rule), Client & CRM (blacklist scoring) |
| `booking.rescheduled` | Booking time changed | Automation Engine (reschedule notification) |

### Client & CRM Domain

| Event | Trigger | Consumers |
|---|---|---|
| `client.created` | New client record created | Automation Engine (welcome flow) |
| `client.blacklisted` | Client blacklist entry created | Scheduling (prevent future bookings) |
| `client.segment_changed` | Client segment recomputed | Automation Engine (segment-triggered campaigns) |
| `client.inactive` | Client has not visited for N days | Automation Engine (reactivation campaign trigger) |

### Documents & Forms Domain

| Event | Trigger | Consumers |
|---|---|---|
| `form.dispatched` | Form token created and SMS sent | Audit log |
| `form.submitted` | Client submits form | Treatment Records (attach form to record), Automation Engine |
| `consent.captured` | Health consent field submitted | Audit log, Identity & Tenancy (update consent timestamp) |

### Treatment Records Domain (L2+)

| Event | Trigger | Consumers |
|---|---|---|
| `treatment.completed` | Treatment record marked complete | Automation Engine (post-treatment follow-up) |
| `treatment_plan.milestone_reached` | Session N of M completed | Automation Engine (milestone notification) |
| `treatment_plan.completed` | All sessions completed | Automation Engine (completion flow, rebooking suggestion) |

### Billing & Commerce Domain

| Event | Trigger | Consumers |
|---|---|---|
| `subscription.activated` | Payment succeeded, plan activated | Identity & Tenancy (enable feature flags) |
| `subscription.upgraded` | Plan changed to higher tier | Identity & Tenancy (update feature flags) |
| `subscription.cancelled` | Subscription cancelled | Identity & Tenancy (disable premium features) |
| `subscription.past_due` | Payment failed, grace period entered | Automation Engine (dunning notifications), UI (DunningBanner) |
| `payment.succeeded` | Payment gateway confirmed success | Billing (create invoice, update wallet) |
| `payment.failed` | Payment gateway reported failure | Billing (retry scheduling) |
| `sms_wallet.low_balance` | Wallet balance below threshold | Automation Engine (low balance notification to owner) |

### Communications Domain

| Event | Trigger | Consumers |
|---|---|---|
| `message.delivered` | Delivery webhook received | Message logs (status update), Usage tracker |
| `message.failed` | Delivery failure webhook | Message logs (status update), Automation Engine (retry gate) |
| `campaign.completed` | All campaign jobs processed | Campaign record (status update), Analytics |

---

## 4. Event Schema

All platform events follow a consistent envelope structure:

```typescript
interface DomainEvent<T = unknown> {
  id: string;              // UUID, unique event identifier
  type: string;            // namespaced: 'domain.entity.action'
  version: number;         // event schema version (start at 1)
  occurredAt: string;      // ISO 8601 UTC timestamp
  tenantId: string;        // salon_id — always present for tenant-scoped events
  aggregateId: string;     // ID of the primary entity (bookingId, clientId, etc.)
  aggregateType: string;   // entity type ('booking', 'client', etc.)
  payload: T;              // event-specific data (no encrypted values)
  causedBy?: string;       // optional: ID of the event or request that caused this
}
```

**Example — booking.completed:**
```typescript
{
  id: "evt_01HXYZ...",
  type: "booking.completed",
  version: 1,
  occurredAt: "2026-03-12T14:00:00Z",
  tenantId: "salon_abc",
  aggregateId: "booking_123",
  aggregateType: "booking",
  payload: {
    clientId: "client_456",
    employeeId: "emp_789",
    serviceId: "svc_321",
    completedAt: "2026-03-12T14:00:00Z"
  }
}
```

---

## 5. CRON Job Schedule

| Job | Schedule | Purpose |
|---|---|---|
| `pre-appointment-forms` | Daily 08:00 | Dispatch forms for tomorrow's bookings |
| `reminders` | Daily 09:00 | Send appointment reminder SMS/emails |
| `surveys` | Every 30 min | Dispatch post-visit satisfaction surveys |
| `crm-automations` | Every 30 min | Evaluate and execute automation rules |
| `blacklist-scoring` | Daily 02:00 | Recompute client blacklist scores |
| `booksy-sync` | Every 15 min | Process Booksy pending emails |
| `process-subscriptions` | Daily 06:00 | Check subscription states, activate/expire features |
| `check-trial-expirations` | Daily 07:00 | Handle trial period end |
| `billing-dunning` | Daily 06:30 | Process past-due subscription retry |
| `send-usage-reports` | Monthly 1st 08:00 | Send usage summaries to owners |

---

## 6. Idempotency

All event consumers and CRON job processors are designed to be **idempotent**. Processing the same event twice must produce the same result as processing it once.

**Implementation patterns:**

- **State check before action:** Before sending a survey, check `booking.survey_sent = true`. If already sent, skip.
- **Unique constraint on outcome:** Pre-appointment form tokens use a unique index on `(booking_id)` to prevent duplicate records.
- **QStash deduplication:** QStash `Content-Id` headers are used for campaign jobs to prevent duplicate delivery on retry.
- **Audit log:** All outbound message sends include an audit record that is checked before re-send.

---

## 7. Error Handling in Async Flows

### QStash jobs

- QStash automatically retries failed jobs with exponential backoff (up to 3 attempts by default)
- After max retries, the job is moved to a dead-letter queue
- Dead-letter queue is monitored; operators are alerted on accumulation

### CRON jobs

- CRON endpoints are wrapped in error handling that logs failures to Sentry without crashing the scheduler
- A failed CRON run for one tenant does not block other tenants' processing
- Failed items are logged with enough context to replay manually if needed

### In-process events

- Subscriber failures are caught per-subscriber; one subscriber's failure does not prevent others from receiving the event
- Critical subscriber failures are logged to Sentry

---

## 8. Event Bus Implementation (Target)

The target implementation formalises the in-process event bus as a reusable abstraction:

```typescript
// lib/events/bus.ts
interface EventBus {
  emit<T>(event: DomainEvent<T>): void;
  on(eventType: string, handler: EventHandler): () => void;  // returns unsubscribe fn
}

// Domain service usage:
import { eventBus } from '@/lib/events/bus';

async function completeBooking(bookingId: string): Promise<void> {
  // ... update booking status in DB ...

  eventBus.emit({
    type: 'booking.completed',
    aggregateId: bookingId,
    // ...
  });
}

// Automation Engine subscription (registered at startup):
eventBus.on('booking.completed', async (event) => {
  await automationEngine.evaluateTrigger('booking.completed', event);
});
```

This abstraction enables future migration to an external event broker (e.g. Supabase Realtime, Redis Pub/Sub) without changing domain service code.
