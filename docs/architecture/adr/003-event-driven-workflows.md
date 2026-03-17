# ADR-003: Event-Driven Workflow Automation

Status: Accepted
Date: 2026-03

---

## Context

SimpliSalon's automation capabilities — pre-appointment forms, post-visit surveys, reminders, CRM campaigns, lifecycle automations — are a major product differentiator. The platform needs to react to business events (booking created, treatment completed, client inactive) and execute multi-step workflows without blocking the user-facing operations that triggered them.

The current implementation achieves this through:
- Vercel CRON jobs for time-based triggers
- QStash for durable async job execution (campaigns)
- Direct function calls within route handlers for immediate side effects

The system works, but the automation logic is scattered across CRON endpoint handlers, CRM route handlers, and the `lib/messaging/campaign-processor.ts`. There is no unified model for what constitutes a "trigger" or a "workflow step".

The team needs to decide how to formalise the automation architecture for the next generation of the platform, particularly as the platform expands to support more complex clinic-level workflows.

The options considered:

1. **Event-driven with in-process bus + QStash** — formalise the current approach with a lightweight event bus abstraction
2. **Full event sourcing** — all state changes are expressed as events; the database is rebuilt from the event log
3. **Workflow orchestration engine** — a dedicated workflow service (e.g. Temporal, Inngest, or similar) manages all automation state
4. **Pure polling CRON** — all automation is driven by scheduled database queries with no event bus

---

## Decision

**We adopt a hybrid event-driven approach: lightweight in-process event bus for immediate reactions, QStash for durable async execution, and Vercel CRON for time-based polling triggers.**

The Automation Engine (see [automation-engine.md](../automation-engine.md)) formalises this into a single coherent model:

- Domain events are emitted via an in-process event bus (`lib/events/bus.ts`)
- Event handlers are registered by the Automation Engine at startup
- The Automation Engine evaluates automation rules and either executes steps immediately or enqueues them to QStash for durable execution
- CRON jobs handle time-based triggers that are not naturally event-driven (e.g. "send forms for tomorrow's bookings")
- All automation execution is idempotent and logged

---

## Alternatives Considered

### Full Event Sourcing

**What it means:** Every state change is stored as an immutable event. The current state of any entity is computed by replaying its event history. Events are the primary storage format; the relational database is derived.

**Arguments for:**
- Complete audit trail for free (events are the truth)
- Time-travel debugging (replay events to any point in time)
- Powerful for building read models from the same event stream

**Arguments against:**
- Dramatic increase in implementation complexity and operational overhead
- Requires event schema versioning from day one (upcasting old events as schemas evolve)
- Query patterns that are natural in relational databases become complex (e.g. "give me all bookings for salon X in March 2026" requires either a snapshot/projection or replaying all booking events)
- The team's primary strength is relational data modelling and Next.js; event sourcing requires deep expertise in event store design, projection management, and eventual consistency
- The platform does not have reporting requirements that justify the complexity (at L3, audit trails are needed — but these can be implemented as append-only audit log tables without full event sourcing)

**Verdict: Rejected.** The complexity premium is not justified by the business requirements. The relational database is the right source of truth. Events are coordination signals, not the system of record.

### Dedicated Workflow Orchestration Engine (Temporal / Inngest)

**What it means:** Introduce a dedicated workflow orchestration service (e.g. Temporal, Inngest, Conductor). Workflows are defined as code; the engine manages execution state, retries, timeouts, and fault tolerance.

**Arguments for:**
- Long-running workflows (multi-day treatment plans, 6-month lifecycle campaigns) are naturally expressed
- Built-in retry, timeout, and compensation logic
- Visible workflow execution history

**Arguments against:**
- Introduces a new infrastructure dependency with its own operational complexity
- Temporal requires a dedicated server (costly and complex to operate); Inngest is SaaS but adds per-execution cost
- The team would need to learn a new programming model (workflow-as-code with activity functions)
- The current automation patterns (pre-appointment forms, surveys, reminders) do not require long-running workflow state — they are stateless checks + dispatches
- At L2/L3, multi-session treatment plans could benefit from workflow orchestration, but the investment is premature at L1

**Verdict: Deferred.** Inngest (or a similar managed workflow-as-code SaaS) is the likely upgrade path when L2 treatment plan automation becomes complex. This ADR should be revisited when treatment plans require cross-day state management. The current design deliberately leaves room for this: the Automation Engine is a separate module whose internals can be replaced without changing event producers or step executors.

### Pure Polling CRON (No Event Bus)

**What it means:** Remove the in-process event bus. All automation is driven by CRON jobs that periodically query the database for records that need processing.

**Arguments for:**
- Simpler: no event bus abstraction to maintain
- Already working for the majority of automation flows (pre-appointment forms, surveys, reminders work this way today)
- No risk of event delivery failure (polling is self-healing)

**Arguments against:**
- High latency for event-triggered reactions (up to 30 minutes if CRON runs every 30 minutes)
- Polling frequency is bounded by Vercel CRON minimum interval (1 minute on Pro plan)
- Booking confirmation SMS must be near-instantaneous; polling cannot deliver this
- Increases database load (many CRON queries scanning tables for unprocessed records)
- Business logic for "should this booking get a confirmation SMS" is scattered across CRON handlers

**Verdict: Not suitable as the sole mechanism.** Pure polling is appropriate for genuinely time-based triggers (pre-appointment forms, inactivity checks). Event-driven delivery is necessary for immediate reactions (confirmation, cancellation, real-time notifications). The hybrid approach retains both.

---

## Consequences

### Positive
- Automation logic is centralised in the Automation Engine module rather than scattered
- Event bus abstraction enables future migration to an external broker without changing domain services
- In-process delivery for immediate reactions (sub-second latency for confirmations)
- QStash provides durable, retryable execution for high-volume or delay-sensitive workflows
- CRON provides the time-based trigger backbone that event-driven systems struggle with

### Negative / Trade-offs
- Two execution paths (in-process vs QStash) must both be understood and maintained
- In-process event delivery is not durable: if the server restarts between `emit` and handler execution, the event is lost. This is acceptable for non-critical side effects; for critical operations (sending a confirmation SMS), the handler should enqueue to QStash immediately
- The event bus is a new abstraction that the team must learn and maintain
- CRON job idempotency requires careful state management (mark-before-send pattern)

### The Idempotency Commitment

This decision commits the team to a discipline: **every automation execution path must be idempotent**. This is non-negotiable. Double-sending a confirmation SMS or a pre-appointment form link is a worse user experience than not sending it at all. Every automation step must check its preconditions before executing and record its execution after completing.
