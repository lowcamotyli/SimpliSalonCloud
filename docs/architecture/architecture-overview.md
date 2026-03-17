# SimpliSalon — Architecture Overview

Version: 2.0
Status: Target Architecture
Date: 2026-03

---

## 1. Purpose of This Document

This document describes the target architecture for the next-generation SimpliSalon platform. It synthesises the current system state, the strategic product direction, and the engineering constraints into a coherent architectural vision that the team can execute incrementally — without rewriting the platform.

---

## 2. Platform Vision

SimpliSalon is evolving from a **beauty salon management tool** into a **modular operating system for beauty and aesthetic businesses**. The platform must serve three distinct customer maturity levels within a single coherent product:

| Level | Segment | Operational Complexity | Key Differentiators |
|---|---|---|---|
| **L1** | Beauty Salons | Low–Medium | Booking, CRM, reminders, payments |
| **L2** | Advanced Treatment Salons | Medium–High | Treatment documentation, consent, equipment scheduling |
| **L3** | Cosmetology & Aesthetic Clinics | High–Very High | Clinical records, audit trails, protocol tracking, regulatory compliance |

The architecture enables progression from L1 → L2 → L3 through **additive capability modules**, not replacement of the core platform.

---

## 3. Architectural Philosophy

### Principle 1 — Modular Monolith First

The platform is a **modular monolith** running on a unified Next.js + Supabase infrastructure. Domains are separated by clear internal boundaries (modules), not by deployment topology. This maximises iteration speed and minimises operational complexity for a small team.

Service extraction happens when a domain has genuinely independent scaling, deployment, or team ownership needs — not by default.

### Principle 2 — Domain Boundaries Are the Architecture

Each domain owns its data, its business rules, and its public contract. Domains communicate through well-defined events and service interfaces, not direct database queries across domain boundaries. This ensures the system remains decomposable in the future.

### Principle 3 — Automation Is a First-Class Concern

Lifecycle automation (pre-appointment flows, post-treatment follow-ups, retention campaigns, billing events) is not bolted on. It is a core domain with its own engine. Every significant domain event can trigger automation workflows.

### Principle 4 — Secure by Default

Sensitive health and consent data is encrypted at the application layer. Every tenant's data is isolated by Row Level Security policies. Access control is enforced at three levels: middleware, application logic, and database. There are no exceptions for convenience.

### Principle 5 — Extensibility Over Premature Optimisation

The system is designed to support more complex clinic workflows in the future. This does not mean building clinic features now. It means avoiding architectural decisions today that would make clinic-grade features impossible later (e.g. schema designs that cannot accommodate treatment protocols, or document systems that cannot be versioned).

### Principle 6 — Feature Flags Gate Complexity

Advanced capabilities are hidden behind feature flags tied to subscription plans. This keeps the L1 experience simple while supporting L2/L3 workflows in the same codebase. The billing system controls real product behaviour, not just UI visibility.

---

## 4. High-Level Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                                  │
│  Dashboard (staff)  │  Public Booking Widget  │  Client-facing Forms  │
└─────────────────────────────┬────────────────────────────────────────┘
                               │ HTTPS
┌─────────────────────────────▼────────────────────────────────────────┐
│                      APPLICATION LAYER                                │
│            Next.js App Router  (SSR + API Routes)                    │
│                                                                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐  │
│  │Scheduling│ │  CRM &   │ │Documents │ │ Billing  │ │Automation │  │
│  │ Domain   │ │  Client  │ │& Forms   │ │& Commerce│ │  Engine   │  │
│  │          │ │  Domain  │ │  Domain  │ │  Domain  │ │           │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └───────────┘  │
│                                                                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐                │
│  │  Staff & │ │Treatment │ │Analytics │ │Integrat. │                 │
│  │Operations│ │ Records  │ │& Reports │ │  Layer   │                 │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘                │
│                                                                       │
│            Identity & Tenancy  │  Auth  │  RBAC                      │
└─────────────────────────────┬────────────────────────────────────────┘
                               │
┌─────────────────────────────▼────────────────────────────────────────┐
│                       DATA LAYER                                      │
│  PostgreSQL (Supabase)  │  Object Storage  │  Upstash Redis           │
│  RLS tenant isolation   │  (files/photos)  │  (cache / rate limit)    │
└──────────────────────────────────────────────────────────────────────┘
                               │
┌─────────────────────────────▼────────────────────────────────────────┐
│                    ASYNC PROCESSING LAYER                             │
│  QStash (message queue)  │  Vercel Cron  │  Webhook receivers         │
└──────────────────────────────────────────────────────────────────────┘
                               │
┌─────────────────────────────▼────────────────────────────────────────┐
│                    EXTERNAL INTEGRATIONS                              │
│  Booksy  │  SMSAPI  │  Resend  │  Przelewy24  │  Google  │  Future   │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 5. Core Domains

| Domain | Responsibility | Maturity Level |
|---|---|---|
| Identity & Tenancy | Salons, users, roles, subscription plans, feature flags | L1 |
| Scheduling | Bookings, calendar, availability, equipment allocation | L1 |
| Client & CRM | Client profiles, segmentation, lifecycle state | L1 |
| Communications | SMS/email sending, templates, campaigns, automation triggers | L1 |
| Billing & Commerce | Subscriptions, payments, invoices, SMS wallet | L1 |
| Documents & Forms | Form templates, treatment cards, consent records | L1–L2 |
| Staff & Operations | Employees, schedules, payroll | L1 |
| Analytics & Reporting | Revenue reports, NPS, usage dashboards | L1 |
| Automation Engine | Workflow triggers, lifecycle rules, CRON orchestration | L1–L2 |
| Treatment Records | Visit records, protocol tracking, multi-session plans | L2–L3 |
| Integrations | External API adapters, webhook infrastructure | L1+ |

Full domain descriptions are in [domain-map.md](domain-map.md).

---

## 6. Platform Maturity Model

### Level 1 — Core Salon Platform

Domains active: Scheduling, Client/CRM, Communications, Billing, Documents/Forms (basic), Staff, Analytics, Automation (basic).

Key capabilities: booking calendar, staff scheduling, client management, SMS/email reminders, basic treatment forms, subscription billing.

### Level 2 — Advanced Treatment Platform

Adds: Documents/Forms (advanced schemas, versioning, conditional logic), Treatment Records, equipment-aware scheduling, multi-session treatment workflows, consent lifecycle management, photo documentation stubs.

### Level 3 — Clinic-Grade Platform

Adds: Clinical audit trails, strict treatment protocol tracking, regulatory compliance tooling, advanced before/after photo workflows, patient-style records, compliance reviewer roles.

L3 capabilities are introduced as additive modules. The core platform does not change.

---

## 7. Key Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Deployment model | Modular monolith | Small team, fast iteration, Supabase as backbone |
| Database | Single Postgres instance per environment | Simpler RLS-based isolation, no sharding complexity yet |
| Tenant isolation | Row Level Security (Supabase/Postgres) | Declarative, auditable, eliminates class of cross-tenant bugs |
| Event processing | QStash + Vercel Cron | Managed queue, no infrastructure to operate |
| Sensitive data | Application-layer AES-256-GCM encryption | Protects health data even from DB-level access |
| Service extraction | On demand | Only extract when domain has clear independent lifecycle |

Full ADRs are in [adr/](adr/).

---

## 8. What This Architecture Is Not

- **Not microservices.** Each domain is a module within the monolith, not a separately deployed service. Decomposition happens later if justified.
- **Not event sourcing.** Domain events trigger automation but the system of record is the relational database. Full event sourcing adds complexity that is not warranted yet.
- **Not a healthcare EMR.** The system supports clinic-adjacent workflows. It is not a regulated medical records system and should not be architected as one. Compliance requirements are addressed at the data and access control layer, not by adopting EMR architecture patterns.

---

## 9. Evolution Path

```
Current State (2026)
  └─ Modular monolith, Next.js + Supabase
  └─ Feature-flagged domains
  └─ QStash-based async processing

Stage 1 (2026–2027) — Strengthen Core Architecture
  └─ Formalise domain boundaries in lib/*
  └─ Introduce explicit event bus abstraction
  └─ Extract automation engine to a well-defined module
  └─ Separate treatment records as own domain

Stage 2 (2027–2028) — Treatment Platform
  └─ Full treatment record system (L2)
  └─ Photo documentation
  └─ Protocol tracking
  └─ Potential extraction: Documents/Forms as a standalone service
     (only if multi-tenant template library justifies independent deployment)

Stage 3 (2028+) — Clinic Platform
  └─ Compliance and audit trail modules
  └─ Consider partial service extraction for compliance-sensitive domains
     if regulatory requirements demand separate deployment topology
```

---

## 10. Document Index

| Document | Contents |
|---|---|
| [domain-map.md](domain-map.md) | All platform domains and their responsibilities |
| [bounded-contexts.md](bounded-contexts.md) | DDD bounded contexts and integration contracts |
| [system-context.md](system-context.md) | External systems, actors, system boundaries |
| [service-architecture.md](service-architecture.md) | Internal service structure and module boundaries |
| [data-architecture.md](data-architecture.md) | Data models, tenant isolation, encryption strategy |
| [event-architecture.md](event-architecture.md) | Domain events, event bus, async processing |
| [automation-engine.md](automation-engine.md) | Workflow automation design |
| [security-model.md](security-model.md) | Auth, RBAC, encryption, audit |
| [multi-tenant-architecture.md](multi-tenant-architecture.md) | Multi-tenancy patterns and isolation strategy |
| [integration-architecture.md](integration-architecture.md) | External integrations and adapter layer |
| [scalability-strategy.md](scalability-strategy.md) | Scaling approach and growth plan |
| [infra-architecture.md](infra-architecture.md) | Infrastructure, deployment, observability |
| [adr/001-modular-monolith.md](adr/001-modular-monolith.md) | Decision: Modular monolith over microservices |
| [adr/002-domain-modules.md](adr/002-domain-modules.md) | Decision: Domain module boundaries |
| [adr/003-event-driven-workflows.md](adr/003-event-driven-workflows.md) | Decision: Event-driven automation approach |
| [adr/004-tenant-isolation.md](adr/004-tenant-isolation.md) | Decision: Tenant isolation via RLS |
| [adr/005-document-form-system.md](adr/005-document-form-system.md) | Decision: Document and form system design |
| [adr/006-integration-boundaries.md](adr/006-integration-boundaries.md) | Decision: Integration adapter boundaries |
