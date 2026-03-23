# ADR-005: Document and Form System Design

Status: Accepted
Date: 2026-03

---

## Context

The document and form system is one of the most strategically important and architecturally complex parts of SimpliSalon. It must support:

- **Basic salon forms:** simple intake questions, allergy checks, consent to service
- **Treatment cards:** detailed pre/post care instructions, contraindications, health questionnaires — the current `BUILTIN_TEMPLATES` library contains 100+ treatment-specific card templates
- **Medical consent forms:** GDPR compliance, health consent gating, signature capture
- **Clinic-grade documentation (future):** treatment records with device parameters, protocol references, before/after photo attachments

The system currently has several architectural issues:

1. **BUILTIN_TEMPLATES as code:** The template library (`lib/forms/builtin-templates.ts`) is ~264,000 lines. It is a static data asset embedded in the application code. This causes slow builds, difficult diffs, no versioning of individual templates, and makes the file impossible to review meaningfully.

2. **No schema versioning:** When a form template schema changes, there is no mechanism to associate historical submissions with the schema version that was active at submission time.

3. **Conditional field logic is incomplete:** The renderer partially supports `conditionalShowIf` but the implementation is not complete (backlog task 08 is open).

4. **No separation between template structure and clinical meaning:** A form template is a bag of fields. The system does not understand that certain field combinations constitute a "health questionnaire for laser epilaction" vs. "standard client intake".

The team must decide how to evolve the document and form system to support the L1→L2→L3 progression.

---

## Decision

The document and form system is designed around four architectural principles:

### 1. Templates Are Versioned Data, Not Code

`BUILTIN_TEMPLATES` must be migrated from a code file to the database. The migration path:

- Phase 1: Extract BUILTIN_TEMPLATES to a seed script that populates the database on first run
- Phase 2: Built-in templates are stored in `form_templates` with `is_builtin = true` and `salon_id = null`
- Phase 3: Salon-specific templates are copies of built-in templates with `salon_id = salon.id`, allowing customisation without affecting the canonical template
- Template updates in the canonical library trigger a "new version available" notification for salons that have customised the template

This eliminates the build performance problem, enables template versioning, and makes template management a data operation rather than a code deployment.

### 2. Template Versioning Is Immutable

When a template is used in a live submission, that version is frozen:

```sql
-- form_templates tracks version number
-- client_forms references the template_version at submission time

client_forms (
  template_id      UUID REFERENCES form_templates(id),
  template_version INTEGER NOT NULL,  -- snapshot of version at dispatch time
  -- ...
)
```

If a salon updates a template, new forms use the new version. Historical submissions remain readable using the schema version that was active at submission time. The renderer resolves the schema for any historical version.

This is essential for clinic-grade use: a patient record must be readable using the form structure that was in place when it was completed.

### 3. Data Category Classification Is Mandatory

Every form field must declare its `data_category`:

```typescript
type DataCategory = 'general' | 'health' | 'sensitive_health' | 'consent';
```

This classification drives:
- Encryption decisions (`health` and `sensitive_health` → AES-256-GCM before persistence)
- Health consent gating (`health` fields are not shown until `health_consent_at` is captured)
- GDPR deletion strategy (each category has a different retention and deletion approach)
- Import review gates (new templates with `sensitive_health` fields require compliance review)

New fields default to `general`. Promoting a field to `health` or `sensitive_health` is a deliberate, reviewed action.

### 4. The Form System Renders Templates; Treatment Records Store Clinical Meaning

The Documents & Forms domain renders forms and stores responses. It does not interpret clinical meaning.

The Treatment Records domain (L2+) attaches form submissions to treatment records and understands what the responses mean in the context of a treatment protocol.

Example: A laser epilaction treatment record knows that the form submission with `template_id = "laser_consultation_v3"` contains the contraindication check result. The form system does not need to know this; it only needs to render the form and store the response securely.

---

## Form Lifecycle

```
Template exists in form_templates
    │
    ▼
[Trigger: booking created OR automation rule]
    │
    ▼
Form dispatched: client_forms record created with token
    │ token delivered to client by SMS
    ▼
Client opens public form URL (tokenised)
    │ server validates token, resolves template schema for the version
    ▼
Client fills form (conditional logic evaluated client-side, validated server-side)
    │
    ▼
Client submits
    │ server validates token (single-use check)
    │ server validates input against schema
    │ server checks health_consent_at for health fields
    │ server encrypts sensitive_health fields
    │ server writes form_field_responses
    │ server invalidates token
    │ server records consent capture in audit_log
    ▼
client_forms.status = 'submitted'
    │
    ▼
[Optional] form.submitted event emitted
    │ Treatment Records attaches form to record (L2+)
    │ Automation Engine triggers follow-up (if configured)
```

---

## Alternatives Considered

### Keep BUILTIN_TEMPLATES as Code Forever

**Arguments for:** Simplest to implement (no migration needed); TypeScript type safety on template definitions.

**Arguments against:** The current size (264k lines) is already a problem. Adding L2 treatment card templates would make it larger. Build times will continue to grow. Template updates require code deployments. Individual template diffs are unreadable. TypeScript compilation of a 264k-line file is expensive.

**Verdict: Rejected as the long-term approach.** The migration to database-stored templates is a necessary investment. The TypeScript type safety concern is addressed by defining the template schema type separately from the data — the type system validates the structure at import time during the seed migration.

### Use a Dedicated Form Builder SaaS (Typeform, JotForm, etc.)

**Arguments for:** No need to build form infrastructure; focus on salon operations.

**Arguments against:**
- Loses control over data residency and GDPR compliance
- Cannot implement health_consent gating within a third-party system
- Cannot encrypt health fields at the application layer
- Cannot integrate form submissions into treatment records with the required context
- Cost scales with submission volume (50,000 form submissions/month × cost per submission = significant)
- Treatment card templates have very specific requirements (contraindication checks, protocol references) that generic form builders don't support

**Verdict: Rejected.** The form system is a core competitive differentiator and compliance requirement, not a commodity function.

### Separate Form Service

**Arguments for:** Independent deployment, independent scaling, reusable form infrastructure.

**Arguments against:** See ADR-001. The form system's value comes from its integration with booking dispatch, encryption keys, health consent lifecycle, and treatment records. Separating it as a service introduces distributed system complexity for marginal benefit at current scale.

**Verdict: Deferred.** If the template library grows to a scale that justifies independent deployment (e.g. it becomes a white-label product for other platforms), extraction can be done then. The domain boundary defined here makes extraction safe when that time comes.

---

## Consequences

### Positive
- Build performance improves dramatically when BUILTIN_TEMPLATES is moved to database
- Template versioning enables historical form readability — required for clinical use
- Data category classification is a first-class architectural concept, not an afterthought
- The form system is extensible: new field types, new consent mechanisms, new data categories can be added without restructuring

### Negative / Trade-offs
- Migrating BUILTIN_TEMPLATES to the database is a significant one-time effort
- Template versioning adds complexity to the rendering path (resolver must select the correct schema version)
- The boundary between Documents & Forms and Treatment Records requires discipline to maintain — there will be pressure to "just add this clinical field to the form template"

### Phase 1 Backlog Items (immediate)

1. Complete conditional field renderer (backlog task 08)
2. Complete `write-to-builtin-templates` pipeline (backlog task 07)
3. Complete tests and cutover (backlog task 09)
4. Design the database migration for BUILTIN_TEMPLATES extraction
5. Add `template_version` column to `client_forms`
