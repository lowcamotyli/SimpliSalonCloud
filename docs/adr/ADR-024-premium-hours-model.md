# ADR-024 — Premium Hours Model

**Date:** 2026-04-09  
**Status:** Accepted  
**Deciders:** Bartosz (owner)

---

## Context

Salon needs to define special time slots outside standard operating hours — or within them — with optional price surcharges or mandatory prepayment. Three options were evaluated:

- **Opcja A** — extend `employee_availability` exception type with `premium` + service/price fields  
- **Opcja B** — standalone `premium_slots` table (scheduling-only, no CRM link)  
- **Opcja C** — `premium_slots` table with `segment_criteria JSONB` (CRM segment integration)

Sprint-22 delivered CRM segmentation (client tags, filters: `tags`, `lastVisitDaysBefore`, `minVisitCount`, `minTotalSpent`, etc.), making Opcja C feasible.

---

## Decision

**Opcja C — `premium_slots` table + `segment_criteria JSONB`**

### Schema

```sql
premium_slots (
  id UUID PK,
  salon_id UUID NOT NULL FK salons,
  name TEXT NOT NULL,                    -- admin label
  employee_id UUID FK employees,         -- null = any employee
  service_ids UUID[],                    -- null = any service
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  price_modifier NUMERIC(5,2),           -- 1.5 = +50%; null = no surcharge
  requires_prepayment BOOLEAN DEFAULT false,
  segment_criteria JSONB,                -- null = open to all; otherwise CRM filter object
  created_at TIMESTAMPTZ DEFAULT now()
)
```

`segment_criteria` uses the same filter schema as CRM segment builder:
```json
{ "tags": ["VIP"], "minVisitCount": 3 }
```
These are interpreted by `applySegmentFilters` in `lib/messaging/campaign-processor.ts`.

### Rationale

- **Reuse CRM segment infrastructure** — no new segment model, same filter schema
- **Future-proof** — `segment_criteria JSONB` is nullable, so slots without targeting behave identically to Opcja B
- **Clean separation** — premium scheduling stays in its own table, CRM stays in CRM (read-only reference via shared filter schema)

---

## Implementation Phases

### Phase 1 (Sprint 24 — this sprint)
- `premium_slots` table with full schema (including `segment_criteria`)
- Admin API: `GET/POST /api/premium-slots`, `DELETE/PATCH /api/premium-slots/[id]`
- Admin UI: `/settings/premium-hours/page.tsx`
- Public availability API: enhanced response includes `premiumMeta` — map of `HH:mm → { name, priceModifier, requiresPrepayment }` so future booking widgets can display badges

### Phase 2 (future sprint — pending public booking UI)
- Public booking widget (`app/booking/[slug]` or embedded widget) with time-slot-picker showing premium badges
- Segment enforcement: client identifies via phone at booking start → system calls `applySegmentFilters` → premium slots hidden if client outside segment

---

## Consequences

- **Positive:** Admin can create premium slots immediately; API returns metadata for frontend consumption
- **Positive:** Segment targeting is stored (ready for Phase 2) without requiring enforcement now
- **Negative:** Phase 2 requires a "phone-first" identification step in public booking flow before showing slots
- **Accepted risk:** Until Phase 2, segment_criteria is stored but not enforced — all premium slots are visible to all clients in availability response

---

## Rejected Alternatives

- **Opcja A:** Mixes scheduling concerns with marketing — rejected for architectural cleanliness
- **Opcja B:** Would require a separate migration to add segment support later; Opcja C is strictly a superset
