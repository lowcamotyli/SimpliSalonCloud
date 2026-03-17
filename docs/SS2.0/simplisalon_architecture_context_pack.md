# SimpliSalon --- Architecture Context Pack

Version: 1.0 Purpose: Context document for designing the next-generation
architecture of the SimpliSalon platform.

This document provides architectural context, constraints, and product
direction for the next-generation version of the SimpliSalon platform.
It is intended to be consumed by a principal architect or system
designer responsible for defining the long‑term system architecture.

The goal is NOT to design the architecture here.\
The goal is to provide the strategic and product context necessary to
design the architecture correctly.

------------------------------------------------------------------------

# 1. Product Overview

SimpliSalon is a SaaS platform used by beauty salons and wellness
businesses to manage operations, customer relationships, and treatment
workflows.

The platform currently includes capabilities such as:

• booking and calendar management\
• client CRM\
• messaging and marketing campaigns\
• marketing automations\
• pre‑appointment forms\
• treatment cards\
• medical questionnaires\
• consent tracking\
• encrypted storage of sensitive client data\
• surveys and feedback collection\
• billing and subscriptions\
• integrations (Booksy, SMS providers, payment providers)

The platform already operates in production and is used by real salons.

The next-generation architecture must support expansion into more
complex treatment-based businesses while maintaining usability for
standard beauty salons.

------------------------------------------------------------------------

# 2. Strategic Product Vision

SimpliSalon should evolve into a **modular operating system for beauty
and aesthetic businesses**.

The product should continue serving traditional salons while gradually
expanding capabilities for:

• advanced beauty salons\
• cosmetology clinics\
• laser clinics\
• aesthetic medicine clinics

The strategy is **progressive capability expansion**, not abandoning the
salon market.

The architecture must therefore support **multiple operational maturity
levels** within the same platform.

------------------------------------------------------------------------

# 3. Target Customer Segments

## 3.1 Core Segment --- Beauty Salons

Typical needs:

• booking calendar • staff schedules • CRM • reminders • marketing
campaigns • payments

Operational complexity: LOW--MEDIUM\
Willingness to pay: MEDIUM

This segment provides the core user base and must remain simple and easy
to use.

------------------------------------------------------------------------

## 3.2 Advanced Beauty Salons

These businesses perform more advanced treatments such as:

• skincare treatments • facials • cosmetic procedures • device-based
treatments

Needs include:

• treatment documentation • consent tracking • questionnaires •
repeat-treatment workflows

Operational complexity: MEDIUM--HIGH\
Willingness to pay: HIGH

------------------------------------------------------------------------

## 3.3 Laser Clinics

Laser clinics operate using expensive equipment and multi‑session
treatment plans.

Needs include:

• device-aware scheduling • treatment protocols • session tracking •
equipment utilization monitoring

Operational complexity: HIGH\
Willingness to pay: HIGH

------------------------------------------------------------------------

## 3.4 Cosmetology Clinics

Cosmetology clinics behave similarly to small medical practices.

Needs include:

• treatment history • before/after photos • health questionnaires •
consent records • follow-up workflows

Operational complexity: HIGH\
Willingness to pay: HIGH

------------------------------------------------------------------------

## 3.5 Future Segment --- Aesthetic Medicine Clinics

Aesthetic medicine clinics introduce additional requirements such as:

• patient-style records • strong audit trails • regulatory compliance •
advanced documentation workflows

Operational complexity: VERY HIGH\
Willingness to pay: VERY HIGH

This segment represents a long-term opportunity rather than the initial
target.

------------------------------------------------------------------------

# 4. Key Industry Trends

## Medicalization of Beauty

Beauty businesses increasingly require healthcare-like workflows
including:

• treatment records • health questionnaires • consent documentation •
secure storage of sensitive information

Architecture must support **secure document systems and auditability**.

------------------------------------------------------------------------

## Automation of Client Retention

Businesses rely on software to increase client lifetime value.

Important capabilities include:

• automated rebooking • follow-up workflows • treatment reminders •
lifecycle campaigns

------------------------------------------------------------------------

## Growth of Multi-Location Chains

Salon and clinic chains are expanding.

Platforms must support:

• centralized reporting • location-level configuration • permission
hierarchies

------------------------------------------------------------------------

# 5. High-Level System Capabilities

The architecture must support the following major product domains.

Core domains:

• scheduling • CRM • messaging • billing • subscriptions • reporting

Treatment domains:

• treatment documentation • treatment cards • consent tracking •
questionnaires • before/after photo records

Operational domains:

• staff management • payroll • equipment management

Automation domains:

• marketing automation • lifecycle workflows • background processing

Integration domains:

• public booking APIs • SMS providers • payment providers • marketplace
integrations

------------------------------------------------------------------------

# 6. Core Architecture Requirements

## Modular Domain Architecture

The platform should be structured into modular domains so new vertical
features can be added without destabilizing the core product.

Examples of domains:

• Scheduling Domain • CRM Domain • Documents & Forms Domain • Treatment
Records Domain • Billing Domain • Communications Domain • Automation
Domain

Modules must remain loosely coupled.

------------------------------------------------------------------------

## Tenant Isolation

The platform is multi-tenant.

Architecture must support:

• strong tenant isolation • tenant-level configuration • tenant-level
encryption keys (future consideration)

------------------------------------------------------------------------

## Role-Based Access Control

As workflows become more clinical, strict permission systems are
required.

Example roles:

• salon owner • practitioner • receptionist • admin • compliance
reviewer

------------------------------------------------------------------------

## Secure Sensitive Data Handling

Sensitive client data may include:

• health questionnaires • treatment documentation • photos • consent
signatures

Architecture must support:

• encryption at rest • encryption in transit • audit logging •
controlled access to records

------------------------------------------------------------------------

## Flexible Document & Form System

The platform relies heavily on structured forms and documents.

The architecture should support:

• dynamic form schemas • versioned templates • reusable treatment
templates • signed consent records

------------------------------------------------------------------------

## Event-Driven Workflow Engine

Lifecycle automation is a major product feature.

Architecture should support event-driven workflows triggered by:

• bookings • completed treatments • client inactivity • subscription
events

------------------------------------------------------------------------

## Integration-Friendly Architecture

The platform must integrate easily with external systems including:

• marketplace platforms • messaging providers • payment providers •
analytics tools

Architecture should support:

• stable public APIs • webhook infrastructure • integration adapters

------------------------------------------------------------------------

# 7. Non-Functional Requirements

The architecture must support:

• high security standards\
• high reliability\
• scalable infrastructure\
• low operational cost\
• fast iteration cycles

Security and privacy are particularly important due to sensitive
health-related data.

------------------------------------------------------------------------

# 8. Strategic Constraints

The architecture design must account for several constraints.

## Small Team

Development resources are limited.

Architecture should favor:

• simplicity • modularity • maintainability

------------------------------------------------------------------------

## Fast Iteration

The product must evolve quickly.

Architecture should support:

• incremental development • independent module releases

------------------------------------------------------------------------

## Infrastructure Efficiency

Infrastructure costs must remain reasonable while the company grows.

Cloud-native patterns are recommended.

------------------------------------------------------------------------

# 9. Architectural Priorities for the Next 3--5 Years

The architecture should optimize for:

1.  modular extensibility\
2.  strong security and privacy controls\
3.  workflow automation infrastructure\
4.  flexible document and treatment systems\
5.  scalable multi-tenant architecture

The goal is to support a gradual evolution from **salon platform →
treatment platform → clinic platform**.

------------------------------------------------------------------------

# 10. Final Design Principles

When designing the architecture, prioritize the following principles.

1.  Keep the core platform simple for standard salons.
2.  Add advanced functionality through modular domains.
3.  Protect sensitive client data with strong security practices.
4.  Design automation as a first-class system capability.
5.  Ensure the system can evolve into clinic-grade software without
    rewriting the platform.

The architecture should enable SimpliSalon to scale from a salon
management tool into a **full operational platform for beauty and
aesthetic businesses**.
