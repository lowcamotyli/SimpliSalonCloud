# Sprint SS2.2-24 — Premium Hours / Marketingowe Wyjątki Grafiku

## Cel
(P2) Umożliwić salonowi definiowanie specjalnych slotów poza standardowymi godzinami otwarcia —
np. dla wybranych usług, z wyższą ceną lub wymaganą pełną przedpłatą.

## ⚠️ Decyzja architektoniczna wymagana PRZED dispatchem

**Ten sprint nie może być zdispatchowany bez rozstrzygnięcia poniższego pytania.**
Napisz ADR w `docs/adr/` przed rozpoczęciem implementacji.

### Kluczowe pytanie
Premium hours — jak to modelować?

**Opcja A — Wyjątek w `employee_availability`**
- Dodaj typ `premium` do istniejących wyjątków grafiku
- Powiąż opcjonalnie z listą service_ids i ceną premium
- Pros: reuses existing availability engine
- Cons: miesza scheduling z marketingiem

**Opcja B — Osobna tabela `premium_slots`**
- `id, salon_id, employee_id?, service_ids[], start_at, end_at, price_override?, requires_prepayment`
- Publiczny booking sprawdza premium_slots przy dostępności
- Pros: czysta separacja
- Cons: kolejny model dostępności do utrzymania

**Opcja C — Kampania marketingowa z overriding slots**
- Premium hours jako typ kampanii CRM (sprint-22 → segmentacja)
- Slot dostępny tylko dla klientów z wybranym tagiem lub grupy odbiorców
- Pros: integracja z CRM
- Cons: największa złożoność, wymaga sprint-22 gotowego

**Rekomendacja do dyskusji z Bartoszem:** Opcja B (dedykowana tabela) — najprostsza dla etapu 1, możliwa migracja do C w SS2.3.

---

## Zakres (po rozstrzygnięciu ADR)

### A — SQL Migration (zakładam Opcję B)
- [ ] Tabela `premium_slots`:
  - `id UUID PK`
  - `salon_id UUID NOT NULL`
  - `name TEXT NOT NULL` — opis dla recepcji
  - `employee_id UUID REFERENCES employees(id)` — null = wszyscy
  - `service_ids UUID[]` — null = wszystkie usługi
  - `date DATE NOT NULL`
  - `start_time TIME NOT NULL`
  - `end_time TIME NOT NULL`
  - `price_modifier NUMERIC(5,2)` — np. 1.5 = 50% drożej, null = brak nadpłaty
  - `requires_prepayment BOOLEAN DEFAULT false`
  - `created_at TIMESTAMPTZ DEFAULT now()`
- [ ] RLS: salon_id isolation

### B — API
- [ ] `GET/POST/DELETE /api/premium-slots` — CRUD
- [ ] Integracja z availability check w public booking: jeśli slot to premium → pokaż info o wyższej cenie i wymaganej przedpłacie

### C — UI Panel
- [ ] Nowa zakładka w ustawieniach lub kalendarzu: "Godziny Premium"
- [ ] Formularz: nazwa, data, godziny, pracownik (opcjonalnie), usługi (opcjonalnie), modyfikator ceny, wymagana przedpłata
- [ ] Lista slotów z możliwością usunięcia

### D — Public Booking
- [ ] Przy wyborze slotu premium: badge "Premium — wymagana przedpłata" lub "Cena podwyższona"
- [ ] Jeśli `requires_prepayment = true`: wymuszaj płatność online (nie opcja "płatność na miejscu")

## Pliki do stworzenia / modyfikacji (po ADR)

| Plik | Akcja | Worker |
|------|-------|--------|
| `docs/adr/ADR-XXX-premium-hours-model.md` | CREATE | Claude (przed dispatchem) |
| `supabase/migrations/[ts]_premium_slots.sql` | CREATE | codex-dad |
| `app/api/premium-slots/route.ts` | CREATE | codex-main |
| `app/(dashboard)/[slug]/settings/premium-hours/page.tsx` | CREATE | codex-dad |
| `app/booking/[slug]/components/time-slot-picker.tsx` | EDIT — premium badge | codex-dad |

## Zależności
- **Wymaga:** ADR rozstrzygnięty, sprint-16 (saldo/płatności — dla requires_prepayment flow), sprint-22 (opcjonalnie — jeśli tagi klientów w Opcji C)
- **Blokuje:** nic

---

## Uwaga dla Bartosza
Zanim ten sprint zostanie zdispatchowany — odpowiedz na pytanie z sekcji ADR.
Najszybsza ścieżka: zatwierdź Opcję B i uruchom sprint jak pozostałe.
