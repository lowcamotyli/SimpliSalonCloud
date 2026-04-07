# SS2.2 — Sprint Plan

## Funkcjonalności

| # | Feature | Sprinty | Status |
|---|---------|---------|--------|
| 0 | Treatment card import cutover (tasks 07–09) | **sprint-00** | ⏳ PIERWSZY |
| 1 | Employee-service assignment | sprint-01, sprint-02 | ⏳ |
| 2 | Payment system — Przelewy24 frontend | sprint-07, sprint-08 | ⏳ |
| 3 | Gmail outbound integration | sprint-05, sprint-06 | ⏳ |
| 4 | Payroll — daily & weekly reports | sprint-03 | ⏳ |
| 5 | Service add-ons UI revamp | sprint-04 | ⏳ |
| 6 | Treatment plans — dokończenie | sprint-09, sprint-10 | ⏳ |
| 7 | Employee shift management | sprint-11, sprint-12 | ⏳ |

## Kolejność wdrożenia (zależności)

```
sprint-00 (treatment cards cutover)        ← PIERWSZY — domknięcie SS2.1
    └── niezależny od pozostałych

sprint-01 (employee-service DB+API)        ┐
    └── sprint-02 (employee-service UI)    ┘ po sprint-01

sprint-03 (payroll daily/weekly)           ← niezależny, można równolegle z sprint-01

sprint-04 (add-ons UI revamp)              ← niezależny, najmniejszy

sprint-05 (Gmail integration backend)
    └── sprint-06 (Gmail settings UI)

sprint-07 (Przelewy24 checkout flow)
    └── sprint-08 (Przelewy24 history + UI)

sprint-09 (treatment plans — core fix)
    └── sprint-10 (treatment plans — sessions)

sprint-11 (employee shifts DB+API)          ← niezależny od pozostałych
    └── sprint-12 (employee shifts UI)
```

## Rekomendowana kolejność startów

```
Tydzień 1:  sprint-00 + sprint-03 + sprint-04   (równolegle — niezależne)
Tydzień 2:  sprint-01 → sprint-02               (po sobie)
            sprint-09 → sprint-10               (po sobie, równolegle z sprint-01/02)
Tydzień 3:  sprint-07 → sprint-08               (Przelewy24 — największy)
            sprint-05 → sprint-06               (Gmail — można równolegle z P24)
Tydzień 4:  sprint-11 → sprint-12              (Employee shifts — niezależny)
```

## Zasady dispatchowania

- Wszystkie niezależne sprinty można uruchomić równolegle
- Każdy sprint zawiera gotowe prompty dla workerów
- Wzorzec: codex-main dla nowych plików, codex-dad dla równoległych/fixów, Gemini dla SQL
- Weryfikacja po każdym sprincie: `npx tsc --noEmit`

## Priorytety biznesowe

1. **Sprint-01/02** — Employee-service assignment (blokuje spójność bookingów)
2. **Sprint-07/08** — Przelewy24 (monetyzacja)
3. **Sprint-09/10** — Treatment plans (feature started in 2.1, must close)
4. **Sprint-03** — Payroll reports (quick win)
5. **Sprint-04** — Add-ons UI (quick win)
6. **Sprint-05/06** — Gmail (nice-to-have)

---

## Fala 2 — SS2.2 (z transkrypcji 2026-04-03)

Źródło wymagań: `plans/SS2.2-wymagania-z-transkrypcji-2026-04-03.md`

### Paczki wdrożeniowe

| Paczka | Sprinty | Temat | Priorytet |
|--------|---------|-------|-----------|
| A — Booking UX | 13, 14, 15 | Conflict override, equipment display, extended edit | P0 |
| B — Payments & Deposits | 16, 17 | Client balance DB+API, UI + payment link | P0 |
| C — Services UX | 18, 19 | Service descriptions, salon terms | P1 |
| D — Service Media | 20, 21 | Photos DB+API, Photos UI | P1 |
| E — CRM & Bulk | 22, 23 | Client tags, bulk service actions | P2 |
| F — Marketing | 24 | Premium hours (wymaga ADR) | P2 |

### Szczegóły sprintów Fali 2

| # | Plik | Temat | Status |
|---|------|-------|--------|
| 13 | sprint-13-conflict-override-equipment-ui.md | Conflict override + widoczność sprzętu | ⏳ |
| 14 | sprint-14-extended-booking-edit-api.md | Extended booking edit — API | ⏳ |
| 15 | sprint-15-extended-booking-edit-ui.md | Extended booking edit — UI | ⏳ |
| 16 | sprint-16-client-balance-db-api.md | Client balance — DB + API | ⏳ |
| 17 | sprint-17-client-balance-ui.md | Client balance — UI + payment link | ⏳ |
| 18 | sprint-18-service-descriptions.md | Service descriptions end-to-end | ⏳ |
| 19 | sprint-19-salon-terms.md | Regulamin salonu + akceptacja | ⏳ |
| 20 | sprint-20-service-photos-db-api.md | Service photos — DB + storage + API | ⏳ |
| 21 | sprint-21-service-photos-ui.md | Service photos — UI admin + public | ⏳ |
| 22 | sprint-22-client-tags-crm-segmentation.md | Client tags UI + CRM segmentation | ⏳ |
| 23 | sprint-23-bulk-service-addon-actions.md | Bulk actions: usługi i dodatki | ⏳ |
| 24 | sprint-24-premium-hours.md | Premium hours (ADR required first) | 🔴 BLOKADA |
| 25 | sprint-25-public-api-key-per-salon.md | Security: per-salon API key (IDOR fix) | ⚠️ SECURITY |

### Zależności Fali 2

```
sprint-13 (conflict override)
    └── sprint-14 (booking edit API)
            └── sprint-15 (booking edit UI)
                    └── sprint-17 (opcjonalnie: rozliczenie salda przy wizycie)

sprint-16 (client balance DB+API)
    └── sprint-17 (client balance UI)

sprint-18 (service descriptions)
    └── sprint-20 (service photos DB+API)
            └── sprint-21 (service photos UI)
                    ↑ sprint-18 też wymagany

sprint-19 (salon terms) — niezależny

sprint-22 (client tags) — niezależny
sprint-23 (bulk actions) — po sprint-04

sprint-24 (premium hours) — BLOKOWANY przez decyzję ADR

sprint-25 (security: per-salon API key) — niezależny, może iść równolegle z sprint-13
```

### Kolejność startów Fali 2 (rekomendacja)

```
Tydzień 1: sprint-13 + sprint-16 + sprint-18 + sprint-19 + sprint-25  (równolegle — niezależne)
Tydzień 2: sprint-14 (po sprint-13) + sprint-17 (po sprint-16)
Tydzień 3: sprint-15 (po sprint-14) + sprint-20 (po sprint-18)
Tydzień 4: sprint-21 (po sprint-20) + sprint-22 + sprint-23  (równolegle)
Tydzień 5: sprint-24 (po ADR)
```
