# ADR-001: Modular Monolith Over Microservices

Status: Accepted
Date: 2026-03

---

## Context

SimpliSalon is a multi-domain SaaS platform with the following characteristics:
- Small engineering team (2–5 engineers)
- Fast iteration requirements (new features weekly)
- Moderate infrastructure budget
- Privacy-sensitive data requiring careful access control
- Strategic direction: gradual expansion from salon management to clinic-grade workflows
- Current technology stack: Next.js App Router + Supabase

The platform already has clear domain boundaries emerging from the codebase: `lib/forms`, `lib/messaging`, `lib/payments`, `lib/booksy`, `lib/payroll`. The question is how to formalise and evolve this structure.

The team evaluated three architectural approaches:

1. **Modular monolith** — single deployable application with clear internal domain modules
2. **Microservices** — separate deployable services per domain, communicating over HTTP/events
3. **Hybrid** — monolith today with planned service extraction for specific domains

---

## Decision

**We adopt a Modular Monolith as the primary architectural pattern.**

The application deploys as a single Next.js application on Vercel. Domain boundaries are enforced through code organisation (`lib/<domain>/`), module contracts (explicit public APIs per domain), and cross-domain access rules. The database is shared (Supabase Postgres with RLS).

Service extraction is permitted — and planned — but only when explicit criteria are met (see Service Architecture document). It is not the default.

---

## Alternatives Considered

### Microservices from the Start

**Arguments for:**
- Independent deployability of domains
- Technology heterogeneity possible
- Independent scaling per domain

**Arguments against:**
- Dramatically increases operational complexity (service discovery, distributed tracing, network failures, contract testing)
- Distributed data management requires either complex sagas or eventual consistency — neither is appropriate for booking+payment operations that need strong consistency
- Small team cannot effectively operate multiple services; the overhead exceeds the benefit
- Premature decomposition creates wrong service boundaries — boundaries discovered by splitting a running monolith are more accurate than boundaries invented upfront
- The platform does not have domains with genuinely different scaling requirements at this stage

**Verdict: Rejected.** The operational overhead significantly exceeds the benefits at current scale and team size. Microservices would slow iteration speed, not increase it.

### Big Ball of Mud (Unstructured Monolith)

**Arguments for:** Zero upfront structure cost; fastest to start

**Arguments against:**
- The current system already shows the cost of unstructured growth: large route handlers mixing business logic, `lib/*` files without clear ownership
- The platform will need to support clinic-grade workflows; an unstructured system cannot absorb that complexity without a rewrite

**Verdict: Rejected.** The current partially-structured state is a liability, not a feature. Formalising domain modules is necessary.

### Hybrid (Monolith + Immediate Extraction of Forms)

**Arguments for:**
- The Documents & Forms domain is already a candidate for independent deployment (template library, compliance requirements)
- Extract it now while it's fresh

**Arguments against:**
- Premature extraction. The domain boundary needs to stabilise before extraction is safe
- Current form system is still being developed (treatment card import pipeline is not complete)
- Extraction before the domain is stable creates a distributed system problem on top of an unsolved product problem

**Verdict: Deferred.** The hybrid approach is the likely evolution path, but extraction should happen after the domain is stable and extraction criteria are met.

---

## Consequences

### Positive
- Single deployment: fast iteration, zero distributed systems complexity
- Shared database: strong consistency for booking + payment operations
- Supabase RLS handles tenant isolation at the DB layer regardless of application structure
- Refactoring across module boundaries is a local code change, not a distributed contract change
- TypeScript type safety across module boundaries (no serialisation/deserialisation overhead or type loss)
- Team can focus on product domain depth, not infrastructure management

### Negative / Trade-offs
- All domains share the same deployment lifecycle (a bug in one domain requires redeploying all)
- Database schema is shared: a poorly designed migration affects all domains
- Module boundary discipline must be maintained by code review (not enforced by the compiler or network boundary)
- The largest domain (Documents & Forms) will grow; if the template library reaches 500MB+ of data in code, this creates a build performance problem (already visible with `BUILTIN_TEMPLATES` at 264k lines)

### Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Module boundaries erode over time | Code review policy: no cross-domain table access; enforced by lint rules |
| Build performance degrades with template library growth | Extract BUILTIN_TEMPLATES from code to database (separate backlog item) |
| Single domain incident takes down the whole system | Domain-level error boundaries; cron job isolation; circuit breakers for integrations |
| Wrong extraction boundaries when we do extract | Formalise domain contracts (interfaces and events) now; extraction follows the contract |

### What This Decision Enables

- All ADR-002 through ADR-006 decisions are compatible with and build on this decision
- Future service extraction is guided by [service-architecture.md](../service-architecture.md) criteria
- The architecture is evolvable: the modular monolith can become a hybrid architecture by extracting one domain at a time without restructuring the remaining monolith
