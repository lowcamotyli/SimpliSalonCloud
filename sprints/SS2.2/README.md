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
