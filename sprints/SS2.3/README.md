# SimpliSalonCloud — Release SS2.3

Branch: `release/SS2.3`
Base: `release/SS2.2` → merged to `main`

## Overview

SS2.3 expands the core booking experience with conflict management, extended editing, client balance/prepayments, service enrichment (descriptions, photos), and CRM segmentation. Sprints are grouped by theme and delivered iteratively.

---

## Sprint Plan

| # | Sprint | Theme | Priority | Status |
|---|--------|-------|----------|--------|
| 13 | Conflict Override + Equipment Visibility | Calendar UX | P0 | [ ] |
| 14 | Extended Booking Edit — API Layer | Booking | P0 | [ ] |
| 15 | Extended Booking Edit — UI Layer | Booking | P0 | [ ] |
| 16 | Client Balance & Prepayments — DB + API | Payments | P0 | [ ] |
| 17 | Client Balance & Prepayments — UI | Payments | P0 | [ ] |
| 18 | Service Descriptions End-to-End | Services | P1 | [ ] |
| 19 | Salon Terms & Acceptance at Booking | Public Booking | P1 | [ ] |
| 20 | Service Photos / Gallery — DB + Storage + API | Services | P1 | [ ] |
| 21 | Service Photos / Gallery — UI (Admin + Public) | Services | P1 | [ ] |
| 22 | Client Tags UI + CRM Segmentation | CRM | P2 | [ ] |
| 23 | Bulk Actions: Services & Add-ons | Services | P2 | [ ] |
| 24 | Premium Hours / Schedule Exceptions | Calendar | P2 | [ ] |

---

## Themes

### P0 — Booking Core
- **S13** — Save booking despite conflict (force_override flag + audit log); display assigned equipment in dialog
- **S14** — PATCH `/api/bookings/[id]`: change service, add service (multi-service), change employee, with conflict re-check
- **S15** — Booking dialog UI: service/employee picker inline, multi-service list, conflict re-check flow

### P0 — Client Balance
- **S16** — `client_balance_transactions` table, RLS, API: top-up, deduct, refund, balance query
- **S17** — Balance widget in client profile, top-up/deduct form, transaction history list

### P1 — Service Enrichment
- **S18** — `description` column on services, admin editor, public booking display
- **S19** — Salon terms (text or URL), checkbox at public booking finalization, stored on booking row
- **S20** — `service_photos` table + Supabase Storage bucket, upload/delete API
- **S21** — Admin gallery UI (drag-reorder, delete), public booking photo carousel

### P2 — CRM & Operations
- **S22** — Tag chips in client profile, multi-tag filter on client list, CRM audience filter by tag
- **S23** — Multi-select on services/add-ons table, bulk activate/deactivate/delete/price-update
- **S24** — `premium_hours` table: time slots with optional price modifier and prepayment requirement

---

## Architecture Notes

- Conflict override: **internal panel only** — `/api/public/bookings` never accepts `force_override`
- All new tables: RLS enabled, filtered by `salon_id`
- Equipment data: JOIN in existing booking query, no separate fetch
- Service photos: Supabase Storage (CDN), signed URLs for private; public bucket for booking flow
- Client balance: append-only transaction log, current balance = SUM of transactions

---

## Stack

Next.js 14 App Router · TypeScript · Supabase (Postgres + Storage) · Tailwind CSS · shadcn/ui

---

## Workflow

Each sprint is dispatched via codex-main / codex-dad in parallel where possible.
After each sprint: `npx tsc --noEmit` → fix → commit → push.

```bash
# After each sprint
npx tsc --noEmit
git add -p
git commit -m "feat(SS2.3): sprint-NN — <description>"
git push
```
