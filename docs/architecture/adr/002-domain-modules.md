# ADR-002: Domain Module Boundaries

Status: Accepted
Date: 2026-03

---

## Context

The SimpliSalon platform has grown into a multi-domain system. The current `lib/*` structure reflects organic growth rather than deliberate domain boundaries. The team needs to establish formal domain module boundaries that:

1. Map correctly to the business capabilities the platform supports
2. Support the evolution from salon platform to clinic platform without requiring rewrite
3. Can be maintained by a small team
4. Provide clear ownership for each business capability

The primary challenge is that some concepts (the "client", the "booking") appear in multiple domains but mean different things in each. Without explicit boundaries, these shared concepts become a single god-model that tries to serve all purposes and serves none well.

The secondary challenge is the Documents & Forms domain, which is already the largest and most complex part of the codebase, and will become more complex as treatment-card workflows expand.

---

## Decision

**We adopt eleven domain modules as the primary structural unit of the application.**

The eleven modules are:

1. `lib/identity/` — Identity & Tenancy
2. `lib/scheduling/` — Scheduling
3. `lib/clients/` — Client & CRM
4. `lib/communications/` — Communications
5. `lib/documents/` — Documents & Forms
6. `lib/treatment-records/` — Treatment Records (introduced at L2)
7. `lib/billing/` — Billing & Commerce
8. `lib/staff/` — Staff & Operations
9. `lib/analytics/` — Analytics & Reporting
10. `lib/automation/` — Automation Engine
11. `lib/integrations/` — Integrations

Each module exposes a public API surface (explicit service functions). Internal module files are not imported by other modules.

### Cross-Domain Access Rule

A module may access another module's data only by calling a function exposed by the owning module. Direct cross-module table queries are prohibited. This rule is enforced by:

1. Code review policy
2. ESLint rule (future): no imports of internal module files from outside the module
3. Architecture documentation as the canonical reference for what each module owns

### Shared Kernel

A minimal set of shared primitive types lives in `lib/types/shared.ts`: `TenantId`, `UserId`, `ClientId`, `BookingId`, `AuthContext`. These are value types — they carry no behaviour and no business rules.

---

## Domain Boundary Decisions

### Why Identity & Tenancy is the Root Domain

Every other domain depends on Identity for auth context, feature flag checks, and tenant resolution. If Identity fails, the entire platform is unavailable. Keeping this domain small, well-tested, and never depending on other domains keeps the root of the dependency graph stable.

### Why Scheduling and Client/CRM Are Separate

The Scheduling domain views a "client" as a booking party — an ID and enough contact data to send a confirmation. The Client & CRM domain views a "client" as a relationship to cultivate — with history, tags, lifetime value, and behavioural data. These are genuinely different concerns. Merging them creates a module that is too large and has conflicting responsibilities.

The separation introduces a coordination point: when a booking is created, Scheduling needs a `clientId`. If the client doesn't exist, it creates one via the Client & CRM module's client-create service. This is a synchronous cross-domain call with a clear contract.

### Why Documents & Forms Is Separate from Treatment Records

Documents & Forms owns the **template and submission infrastructure** — how forms are built, versioned, dispatched, submitted, and stored. Treatment Records owns the **clinical meaning of a submitted form** — what treatment was performed, with which device, following which protocol.

The separation allows the form infrastructure to evolve independently (new field types, new consent mechanisms) from the treatment record structure (new treatment categories, protocol versions). At L2, a treatment record will have form submissions attached to it — but the form submission system does not need to know anything about treatment protocols.

### Why Automation Engine Is a Separate Domain

The Automation Engine orchestrates across multiple domains (Communications, Documents & Forms, Scheduling). If it were embedded in any one of those domains, the others would need to import it — creating circular dependencies. As a separate domain, the Automation Engine depends on the others (as event consumers and action targets) but no other domain depends on the Automation Engine.

### Why Analytics Is Read-Only

The Analytics domain only reads data — it never writes. This makes it safe to query data across domain tables for aggregation purposes (with the exception of encrypted health data, which is never decrypted by analytics queries). The read-only nature means analytics does not create coupling to other domains' write paths.

---

## Alternatives Considered

### Fewer, Larger Modules

**Example:** Combine Scheduling + Client/CRM + Treatment Records into a single "Operations" module.

**Rejected because:** The combined module would have too many responsibilities. The "client" model would need to serve booking, CRM, and clinical use cases simultaneously — leading to a bloated model with conditional logic everywhere.

### More Granular Modules (Per Entity)

**Example:** Separate modules for `bookings`, `services`, `employees`, `clients`, `campaigns`.

**Rejected because:** Too granular modules have thin logic and high cross-module call overhead. The module boundary should align with a bounded context (a coherent domain of business rules), not with individual database tables.

### Technology-Based Modules

**Example:** `lib/database`, `lib/api`, `lib/queue` rather than domain-based modules.

**Rejected because:** Technology-based modules split coherent business logic across multiple modules. To understand how a booking reminder is sent, you'd need to look in `lib/database`, `lib/queue`, `lib/api`, and `lib/email`. Domain-based modules keep the business logic cohesive.

---

## Consequences

### Positive
- Each domain is independently understandable: a new engineer can read one module and understand a complete business capability
- Domain events have clear producers (the owning domain) and consumers (subscribing domains)
- Module boundaries guide extraction decisions: if a module needs to be extracted as a service, its contract is already defined
- Responsibility for each business capability is unambiguous

### Negative / Trade-offs
- More modules means more code to navigate initially
- Cross-domain operations require explicit service calls rather than ad-hoc database queries — more structured but more verbose
- The migration from the current organic structure to the formal module structure is a refactoring effort (not a rewrite, but not zero cost)

### Migration Path

The migration from the current `lib/*` structure to the formal module structure is incremental:

1. Identify the largest risk area (currently: Documents & Forms — split from emerging Treatment Records concept)
2. Create `lib/documents/` as the first formally structured module
3. Move related functionality from `lib/forms/` into `lib/documents/` with explicit public exports
4. Repeat for each domain module, starting with the most complex and highest-risk domains
5. Remove old module paths after migration

No "big bang" refactor. Each module migration is a discrete PR.
