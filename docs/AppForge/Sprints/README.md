# AppForge — Sprint Plan

Branch: `appforge/platform`
Base: `main` (post SS2.4)

## Overview

Przekształcenie SimpliSalonCloud w modularną platformę do budowania vertical SaaS.
Każda nowa aplikacja = fork repo + wizard (Data Gathering Workbook) + dostarczone komponenty.

## Architektura referencyjna

Przed każdym sprintem sprawdź `docs/AppForge/INDEX.md` — który doc czytać.
Pełny design doc: `docs/architecture/platform-design-doc.md` (nie ładuj w sprintach).

---

## Fazy i sprinty

### Faza 0 — Platform Infrastructure

| # | Sprint | Temat | Priorytet | Status |
|---|--------|-------|-----------|--------|
| AF-01 | Module System Infrastructure | types, registry, EventBus, AppConfig | P0 | [ ] |
| AF-02 | Theme System Infrastructure | ComponentRegistry, ThemeProvider, _default | P0 | [ ] |
| AF-03 | workspace_modules DB + Module Gating | migration, middleware | P0 | [ ] |

### Faza 1 — Module Manifests (istniejące funkcje → moduły)

| # | Sprint | Temat | Priorytet | Status |
|---|--------|-------|-----------|--------|
| AF-04 | Calendar Module Manifest + Public API | wyodrębnienie z istniejącego kodu | P1 | [ ] |
| AF-05 | Employees Module Manifest + Public API | podstawowy (przed HCM) | P1 | [ ] |
| AF-06 | CRM Module Manifest + Public API | campaigns, automations | P1 | [ ] |
| AF-07 | Absence + Payroll Module Manifests | istniejące tabele → moduły | P1 | [ ] |

### Faza 2 — Nowe moduły

| # | Sprint | Temat | Priorytet | Status |
|---|--------|-------|-----------|--------|
| AF-08 | HCM DB — nowe tabele | hr_employees, hr_demographics, hr_contracts, hr_documents | P1 | [ ] |
| AF-09 | HCM API — CRUD | endpoints dla wszystkich 4 tabel | P1 | [ ] |
| AF-10 | HCM UI — Employee Detail | tabs: przegląd, kontrakty, dokumenty, demografia | P2 | [ ] |
| AF-11 | Time Tracking — DB + API | tt_entries, tt_timesheets, clock in/out | P1 | [ ] |
| AF-12 | Time Tracking — UI | panel pracownika, arkusze, zatwierdzanie | P2 | [ ] |

### Faza 3 — Theme System

| # | Sprint | Temat | Priorytet | Status |
|---|--------|-------|-----------|--------|
| AF-13 | _default Theme — ComponentRegistry impl | wrap shadcn/ui | P1 | [ ] |
| AF-14 | Migracja istniejących modułów → useComponents() | calendar, employees, crm | P2 | [ ] |

### Faza 4 — Application Wizard

| # | Sprint | Temat | Priorytet | Status |
|---|--------|-------|-----------|--------|
| AF-15 | Wizard Steps 1–3 | profil, moduły, konfiguracja | P1 | [ ] |
| AF-16 | Wizard Steps 4–5 + Generate | theme, generowanie app-config + migracje | P1 | [ ] |

---

## Kolejność wykonania (dependency graph)

```
AF-01 ──┐
AF-02 ──┤── AF-03 ──┬── AF-04 ──┐
         │           ├── AF-05 ──┤── AF-08 ──── AF-09 ──── AF-10
         │           ├── AF-06 ──┘
         │           └── AF-07
         └── AF-13 ──── AF-14
                              └── AF-15 ──── AF-16
```

AF-01, AF-02, AF-13 mogą iść równolegle (brak zależności).
AF-03 wymaga AF-01.
AF-04 – AF-07 wymagają AF-01 + AF-03.
AF-08 – AF-12 wymagają odpowiednich manifestów z Fazy 1.

---

## Klucz skills

| Zadanie | Skill |
|---------|-------|
| Nowa implementacja TS/TSX | `scoped-implementation` |
| SQL / migracje | `sql-migration-safe` |
| Naprawa TS errors | `typescript-repair` |
| Review diff przed zwrotem | `review-ready-diff` |
| Odczyt dużego pliku | `targeted-file-read` |
| Security / auth | `safe-sensitive-change` |
