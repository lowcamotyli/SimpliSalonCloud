# Sprinty v2.0 — Indeks

Definicja wersji: `docs/SS2.0/v2.0-definition.md`
Architektura: `docs/architecture/`

---

## Trzy filary architektury v2.0

Sprinty budowane są w trzech warstwach. Warstwy 1 i 2 to **fundament** — muszą być solidne zanim budujemy features na warstwie 3.

```
WARSTWA 1 — SECURITY          WARSTWA 2 — TRACEABILITY       WARSTWA 3 — FEATURES
─────────────────────         ──────────────────────────      ──────────────────────
TC-1  data_category           L2-A  AES-256-GCM encryption    L2-B  Treatment Records UI
TC-2  consent enforcement     L3-A  health data access log     L2-C  Protocols
      RLS hardening                 (append-only, no delete)   L2-D  Session plans (uproszczone)
      data_category filter                                      L2-E  Photo documentation
```

**Zasada:** Nie budujemy features (Warstwa 3) bez gotowego fundamentu (Warstwa 1+2).

> **Dlaczego L3-A jest w fundamencie, nie w feature layer:**
> Audit trail to nie "feature dla klinik" — to odpowiedź na pytanie "co się stało" gdy cokolwiek
> pójdzie nie tak. Każdy salon przechowujący dane zdrowotne (health questionnaire, consent,
> encrypted notes) ma ten problem niezależnie od segmentu. Jeśli klient złoży skargę GDPR i
> nie ma logu — to brak fundamentu, nie brak feature'u.

---

## Kolejność realizacji

```
[Warstwa 1 — Security]
TC-1 → TC-2
         │
[Warstwa 2 — Traceability]
         └─ L2-A ──────────┐
                           L3-A  ← równolegle z L2-A (schema+log function), po L2-A (instrument)
                           │
[Warstwa 3 — Features]     │
              L2-B ─────────┤
              L2-C ─────────┤
              L2-D ─────────┤  (uproszczone — śledzenie sesji bez automation)
              L2-E ─────────┘  (równolegle z L2-C/D)
                           │
                       v2.0 SHIP ✓
```

---

## Status sprintów

| Warstwa | Sprint | Plik | Status | Zależności |
|---------|--------|------|--------|------------|
| 🔐 Security | **TC-1** | [TC-1_treatment-cards-finalizacja.md](TC-1_treatment-cards-finalizacja.md) | ⬜ NEXT | — |
| 🔐 Security | **TC-2** | [TC-2_forms-security-hardening.md](TC-2_forms-security-hardening.md) | ⬜ TODO | TC-1 |
| 🔍 Traceability | **L2-A** | [L2-A_treatment-records-foundation.md](L2-A_treatment-records-foundation.md) | ⬜ TODO | TC-1, TC-2 |
| 🔍 Traceability | **L3-A** | [L3-A_clinical-audit-trail.md](L3-A_clinical-audit-trail.md) | ⬜ TODO | L2-A (instrument po) |
| 🚀 Features | **L2-B** | [L2-B_treatment-records-ui.md](L2-B_treatment-records-ui.md) | ⬜ TODO | L2-A, L3-A |
| 🚀 Features | **L2-C** | [L2-C_treatment-protocols.md](L2-C_treatment-protocols.md) | ⬜ TODO | L2-B |
| 🚀 Features | **L2-D** *(uproszczony)* | [L2-D_multi-session-plans.md](L2-D_multi-session-plans.md) | ⬜ TODO | L2-C |
| 🚀 Features | **L2-E** | [L2-E_photo-documentation.md](L2-E_photo-documentation.md) | ⬜ TODO | L2-A, TC-2 |

### Uwagi do kolejności:
- **L3-A** można zacząć **równolegle z L2-A sesja 1** (SQL + log function) — nie wymaga czekania na L2-B/UI
- **L3-A instrumentacja** (dodanie log calls do decryptField) — dopiero po L2-A (tabela musi istnieć)
- **L2-E i L2-D** mogą iść równolegle po L2-C

### v2.x (po v2.0 ship)
| Track | Co | Kiedy |
|-------|----|-------|
| **L2-D full** | Automation hook w session plans (event bus trigger, SMS po sesji) | Po INFRA-A |
| INFRA-A | Event Bus refactor (`lib/events/bus.ts`) | Po ship |
| INFRA-B | Builtin Templates extraction (264k-linii plik) | Po ship |
| **v1.x** | Ulepszenia kalendarza, CRM, raportów dla fryzjerstwa/beauty | Parallel sprint |
| v1.x | Booksy direct API | Maintenance |
| L3-B | GDPR full + per-tenant encryption keys | v3.0 |

---

## Zasady prowadzenia sprintów

### Na początku każdej sesji
1. Przeczytaj plik sprintu
2. Przeczytaj TYLKO pliki kontekstowe wymienione w sprincie (nie więcej)
3. Sprawdź stan (`ls`, `grep`) zanim zaczniesz — może część jest już zrobiona

### W trakcie sesji
- Deleguj wg tabeli: SQL → Gemini, nowe pliki 20-150 linii → Codex, edycje < 50 linii → Claude
- Jeden Gemini call = jeden plik
- Po każdym Codex/Gemini: `head -5 plik` + `npx tsc --noEmit`

### Na końcu sesji
- `/compact` przed nową sesją
- Zaktualizuj status w tej tabeli (zmień ⬜ na ✅)
- Jeśli sprint nie skończony: zaktualizuj "Resume command" w pliku sprintu

### Bramka między sprintami
Każdy sprint musi mieć `npx tsc --noEmit` zielony ZANIM zaczyna się następny.

---

## Jak ADR-y są używane w sprintach

ADR (Architecture Decision Record) to dokument decyzji architekturalnej — opisuje **co** postanowiono i **dlaczego**. W sprintach ADR-y pełnią rolę **ograniczeń implementacyjnych**, nie tylko dokumentacji.

| ADR | Co decyduje | Gdzie blokuje (sprint) |
|-----|------------|----------------------|
| [ADR-001 Modular Monolith](../architecture/adr/001-modular-monolith.md) | Jeden deployment, granice w kodzie (`lib/<domain>/`) | Wszystkie — nie twórz osobnych service'ów |
| [ADR-002 Domain Modules](../architecture/adr/002-domain-modules.md) | 11 domain modułów, public API przez `index.ts` | L2-A, L2-B, L2-C, L2-D, L2-E, L3-A — nowe sub-moduły idą do `lib/treatment-records/`, nie tworzą osobnych `lib/` |
| [ADR-003 Event-Driven Workflows](../architecture/adr/003-event-driven-workflows.md) | Nie wywołuj side effects bezpośrednio — emit event | L2-D — automation hook to `console.log` placeholder, pełna implementacja po event bus refactorze |
| [ADR-004 Tenant Isolation](../architecture/adr/004-tenant-isolation.md) | Każda tabela: `salon_id NOT NULL` + RLS mandatory | Każdy sprint z SQL — bez RLS migracja nie przechodzi review |
| [ADR-005 Document & Form System](../architecture/adr/005-document-form-system.md) | Templates = dane nie kod; consent gate = architekturalny wymóg | TC-1, TC-2 — decyzje o `data_category`, `health_consent_at`, `conditionalShowIf` wywodzą się z tego ADR |
| [ADR-006 Integration Boundaries](../architecture/adr/006-integration-boundaries.md) | Zewnętrzne API tylko przez adapter w `lib/integrations/{provider}/` | Nie dotyczy v2.0 bezpośrednio — referencja dla przyszłych integracji |

### Praktyczna zasada na każdą sesję
Przed każdą nową tabelą SQL → sprawdź ADR-004 (masz `salon_id`? masz RLS?).
Przed każdym nowym plikiem `lib/` → sprawdź ADR-002 (do którego domain module to należy?).
Przed każdym side effect w route handlerze → sprawdź ADR-003 (czy to powinno być event?).

---

## Reguły cross-cutting — obowiązkowe w każdym sprincie

Poniższe zasady wynikają z trzech filarów (Security / Traceability / Reliability) i obowiązują ZAWSZE.

### 1. Granice modułów (ADR-001 + ADR-002)
- Każdy nowy plik `lib/` trafia do właściwego modułu domenowego (`lib/treatment-records/`, `lib/audit/`, itp.)
- Route handler NIE zawiera logiki biznesowej — wywołuje funkcję z `lib/<domain>/`
- Żaden moduł nie importuje wewnętrznych plików innego modułu — tylko przez `lib/<domain>/index.ts`
- Cross-cutting infrastructure (`lib/audit/`, `lib/supabase/`, `lib/events/`) to wyjątek — można importować wszędzie

### 2. Tenant isolation (ADR-004 + multi-tenant-architecture.md)
- Każda nowa tabela: `salon_id uuid NOT NULL REFERENCES salons(id) ON DELETE CASCADE` + RLS
- Weryfikacja: `SELECT * FROM pg_policies WHERE tablename='x'` — minimum 1 SELECT policy, brak DELETE na audit tabelach
- Test: zapytanie bez auth lub z innym salon_id → empty result lub 403

### 3. Idempotency (event-architecture.md + automation-engine.md)
- Każdy CRON handler: **ustaw flagę PRZED wysłaniem** (mark-before-send), nie po
- Każda automation action: sprawdź precondition state zanim ją wykonasz
- Duplikowane triggery muszą dać ten sam efekt lub być no-op

### 4. Event-driven side effects (ADR-003)
- Żaden route handler nie wywołuje SMS/email bezpośrednio — emit event lub enqueue do QStash
- Jeśli `lib/events/bus.ts` jeszcze nie istnieje → placeholder `// TODO(INFRA-A-event-bus): emit('event.name', payload)`
- Search tag dla future refactora: `TODO(INFRA-A-event-bus)` — wszystkie takie komentarze zostaną zastąpione przy INFRA-A

### 5. L1 → L2 addytywność (architecture-overview.md)
- L2 features są DODATKIEM do L1, nie zastępują — nie usuwaj istniejącej funkcjonalności
- Każda L2 feature musi być za feature flagiem (`lib/features.ts`) powiązanym z subscription planem
- Test: salon bez flagi `treatment_records` → wszystkie endpointy L2 zwracają 402 (FeatureGateError)

### 6. Szyfrowanie danych zdrowotnych (data-architecture.md)
- T4/T5 dane: encrypt przed INSERT, decrypt tylko server-side po auth check
- Weryfikacja po insercie: `SELECT notes_encrypted FROM treatment_records LIMIT 1` → powinien być base64, nie plaintext
- `decryptField` wywołuj TYLKO w kontekście authenticated request z audit context

### 7. Thin route handlers (service-architecture.md)
- Pattern: `route handler → validate → call lib/<domain>/service.ts → return NextResponse.json()`
- Logika biznesowa (obliczenia, decyzje) idzie do `lib/<domain>/`, nie inline w route
- Weryfikacja po Codex: jeśli handler > 80 linii — prawdopodobnie za gruby, wydziel logikę

---

## Poza zakresem v2.0 (osobne track-i)

| Track | Co | Kiedy |
|-------|----|-------|
| **L3-A** | Clinical Audit Trail (plik istnieje, szczegóły gotowe) | v2.x — gdy targetujemy kliniki z wymogami prawnymi |
| **L2-D full** | Automation hook w multi-session plans (event bus trigger) | v2.x — po INFRA-A event bus |
| INFRA-A | Event Bus refactor (`lib/events/bus.ts`) | v2.x — po ship |
| INFRA-B | Builtin Templates extraction (264k-linii plik) | v2.x — po ship |
| L3-B | GDPR full + per-tenant encryption keys | v3.0 |
| **v1.x parallel** | Ulepszenia kalendarza, CRM, raportów dla fryzjerstwa/beauty | Parallel — osobna sesja, nie blokuje v2.0 |
| v1.x | Booksy direct API (zastąpienie email parsera) | Maintenance sprint |
