# Sprint 02 – Wielowymiarowa Rezerwacja Sprzętu – Schemat Bazy Danych

> **Typ:** DB Migration only  
> **Wymaga:** Sprint 00 ukończony (btree_gist aktywne)  
> **Szacowany czas:** 3–5 dni  
> **Trudność:** 8/10 (złożoność modelu danych)  
> **Priorytet:** 🔴 Fundament – bez tego sprintu nie można budować UI kalendarza

---

## 📎 Pliki do kontekstu Gemini

> Ten sprint to **wyłącznie migracje SQL** – nie modyfikujesz kodu TypeScript. Wklej do Gemini poniższe pliki.

**Istniejące pliki do ODCZYTU (zrozumienie schematu DB):**
- `DATABASE_FUNDAMENTALS.txt` lub `DATABASE_FUNDAMENTALS_SUMMARY.md` – opis istniejącego schematu
- `supabase/migrations/` – przeglądnij ostatnie 2–3 pliki migracji, żeby wiedzieć co już istnieje
- `app/api/bookings/route.ts` – istniejąca logika bookingów; zrozum obecne pola tabeli `bookings`

**Nie istnieją jeszcze – stworzysz je w tym sprincie:**
- `supabase/migrations/YYYYMMDD_equipment_v1.sql` ← tabela `equipment`
- `supabase/migrations/YYYYMMDD_equipment_v2.sql` ← tabela `service_equipment`
- `supabase/migrations/YYYYMMDD_equipment_v3.sql` ← tabela `equipment_bookings` + EXCLUDE constraint

**⚠️ Uwaga na kolejność migracji:** uruchom v1 → v2 → v3, nie równocześnie.

---

## Cel sprintu

Przebudowa modelu danych kalendarza z płaskiej struktury (klient–pracownik–czas) na wielowymiarową (klient–pracownik–sprzęt–czas). Jest to najtrudniejsza migracja w całym projekcie – musi być wykonana przed jakimkolwiek rozwojem UI, bo zmienia fundamentalną logikę zapytań o dostępność.

> ⚠️ **Uwaga:** Migracja modyfikuje zachowanie istniejącej tabeli `bookings`. Wymagane testy regresji po każdym kroku.

---

## 2.1 Analiza istniejącego schematu

Przed migracją zweryfikuj strukturę tabeli `bookings`:

```sql
-- Sprawdź istniejące kolumny
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'bookings'
ORDER BY ordinal_position;

-- Sprawdź istniejące indeksy
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'bookings';
```

Zidentyfikuj czy istnieje już jakiś mechanizm walidacji nakładania się rezerwacji (np. trigger, constraint, aplikacyjny). Jeśli tak – nie można go usunąć, tylko rozszerzyć.

---

## 2.2 Migracja – Krok 1: Tabela sprzętu

> Plik: `supabase/migrations/20260304_equipment_v1.sql`

```sql
-- Encja maszyn i sprzętu salonu
CREATE TABLE equipment (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id    UUID    NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
  name        TEXT    NOT NULL,
  type        TEXT    NOT NULL DEFAULT 'other'
                CHECK (type IN ('laser','fotel','stol_manicure','fotopolimeryzator','inne','other')),
  description TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_equipment_salon ON equipment(salon_id);
CREATE INDEX idx_equipment_active ON equipment(salon_id, is_active);

ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "salon_read_equipment" ON equipment
  FOR SELECT USING (
    salon_id = (SELECT salon_id FROM employees WHERE user_id = auth.uid() LIMIT 1)
  );

CREATE POLICY "owner_write_equipment" ON equipment
  FOR ALL USING (
    salon_id = (
      SELECT salon_id FROM employees 
      WHERE user_id = auth.uid() AND role IN ('owner','manager') LIMIT 1
    )
  );
```

---

## 2.3 Migracja – Krok 2: Powiązanie usługi ze sprzętem

> Plik: `supabase/migrations/20260304_equipment_v2.sql`

```sql
-- Relacja Usługa ↔ Wymagany sprzęt (wiele-do-wielu)
-- Usługa może wymagać wielu urządzeń jednocześnie
-- Urządzenie może być wymagane przez wiele usług
CREATE TABLE service_equipment (
  service_id   UUID NOT NULL REFERENCES services(id)   ON DELETE CASCADE,
  equipment_id UUID NOT NULL REFERENCES equipment(id)  ON DELETE CASCADE,
  PRIMARY KEY (service_id, equipment_id)
);

CREATE INDEX idx_service_equipment_service   ON service_equipment(service_id);
CREATE INDEX idx_service_equipment_equipment ON service_equipment(equipment_id);

ALTER TABLE service_equipment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "salon_read_service_equipment" ON service_equipment
  FOR SELECT USING (
    service_id IN (
      SELECT s.id FROM services s
      JOIN employees e ON e.salon_id = s.salon_id
      WHERE e.user_id = auth.uid()
    )
  );

CREATE POLICY "owner_write_service_equipment" ON service_equipment
  FOR ALL USING (
    service_id IN (
      SELECT s.id FROM services s
      JOIN employees e ON e.salon_id = s.salon_id
      WHERE e.user_id = auth.uid() AND e.role IN ('owner','manager')
    )
  );
```

---

## 2.4 Migracja – Krok 3: Tabela rezerwacji sprzętu z EXCLUDE constraint

> Plik: `supabase/migrations/20260304_equipment_v3.sql`

> ⚠️ Ten krok wymaga `btree_gist` z Sprint 00.

```sql
-- Tabela blokad sprzętu powiązanych z bookingami
CREATE TABLE equipment_bookings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id   UUID NOT NULL REFERENCES bookings(id)   ON DELETE CASCADE,
  equipment_id UUID NOT NULL REFERENCES equipment(id)  ON DELETE RESTRICT,
  starts_at    TIMESTAMPTZ NOT NULL,
  ends_at      TIMESTAMPTZ NOT NULL,
  CONSTRAINT chk_equipment_booking_time CHECK (ends_at > starts_at),

  -- Kluczowy constraint: nie pozwól na nakładanie się rezerwacji tego samego sprzętu
  EXCLUDE USING gist (
    equipment_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  )
);

CREATE INDEX idx_equipment_bookings_equipment ON equipment_bookings(equipment_id);
CREATE INDEX idx_equipment_bookings_booking   ON equipment_bookings(booking_id);
CREATE INDEX idx_equipment_bookings_time      
  ON equipment_bookings USING gist(equipment_id, tstzrange(starts_at, ends_at, '[)'));

ALTER TABLE equipment_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "salon_read_equipment_bookings" ON equipment_bookings
  FOR SELECT USING (
    equipment_id IN (
      SELECT e.id FROM equipment e
      JOIN employees emp ON emp.salon_id = e.salon_id
      WHERE emp.user_id = auth.uid()
    )
  );

CREATE POLICY "salon_write_equipment_bookings" ON equipment_bookings
  FOR ALL USING (
    equipment_id IN (
      SELECT e.id FROM equipment e
      JOIN employees emp ON emp.salon_id = e.salon_id
      WHERE emp.user_id = auth.uid() AND emp.role IN ('owner','manager','employee')
    )
  );
```

---

## 2.5 Weryfikacja migracji

Po każdym kroku uruchomić:

```sql
-- Test 1: Czy tabele istnieją?
SELECT table_name FROM information_schema.tables 
WHERE table_name IN ('equipment','service_equipment','equipment_bookings');

-- Test 2: Czy btree_gist działa? (EXCLUDE constraint)
-- Wstaw pierwszy slot
INSERT INTO equipment_bookings (booking_id, equipment_id, starts_at, ends_at)
VALUES ('...', '...', '2026-03-04 10:00', '2026-03-04 11:00');

-- Spróbuj wstawić nakładający się slot – musi rzucić błąd
INSERT INTO equipment_bookings (booking_id, equipment_id, starts_at, ends_at)
VALUES ('...', '...', '2026-03-04 10:30', '2026-03-04 11:30');
-- OCZEKIWANY BŁĄD: conflicting key value violates exclusion constraint

-- Test 3: Sąsiadujące sloty NIE powinny kolidować
INSERT INTO equipment_bookings (booking_id, equipment_id, starts_at, ends_at)
VALUES ('...', '...', '2026-03-04 11:00', '2026-03-04 12:00');
-- OCZEKIWANE: sukces (końcowy slot = '[)' nie obejmuje końca)
```

---

## 2.6 Funkcja SQL – sprawdzanie dostępności sprzętu

Stworzyć reużywalną funkcję PostgreSQL jako podstawę dla API:

```sql
CREATE OR REPLACE FUNCTION check_equipment_availability(
  p_equipment_ids UUID[],
  p_starts_at     TIMESTAMPTZ,
  p_ends_at       TIMESTAMPTZ,
  p_exclude_booking_id UUID DEFAULT NULL  -- do edycji istniejącej rezerwacji
) RETURNS TABLE(equipment_id UUID, is_available BOOLEAN, conflict_booking_id UUID)
LANGUAGE sql STABLE AS $$
  SELECT 
    e.id AS equipment_id,
    NOT EXISTS (
      SELECT 1 FROM equipment_bookings eb
      WHERE eb.equipment_id = e.id
        AND tstzrange(eb.starts_at, eb.ends_at, '[)') && tstzrange(p_starts_at, p_ends_at, '[)')
        AND (p_exclude_booking_id IS NULL OR eb.booking_id != p_exclude_booking_id)
    ) AS is_available,
    (
      SELECT eb.booking_id FROM equipment_bookings eb
      WHERE eb.equipment_id = e.id
        AND tstzrange(eb.starts_at, eb.ends_at, '[)') && tstzrange(p_starts_at, p_ends_at, '[)')
        AND (p_exclude_booking_id IS NULL OR eb.booking_id != p_exclude_booking_id)
      LIMIT 1
    ) AS conflict_booking_id
  FROM equipment e
  WHERE e.id = ANY(p_equipment_ids)
$$;
```

---

## 2.7 Testy regresji istniejącego systemu bookingów

> ⚠️ Ten krok jest krytyczny – weryfikacja że stary flow bookingów nadal działa.

```bash
# Uruchom istniejące testy E2E dla bookingów
npx playwright test tests/bookings/ --reporter=html

# Sprawdź że:
# [ ] Tworzenie bookingu bez sprzętu nadal działa
# [ ] Edycja bookingu nadal działa
# [ ] Anulowanie bookingu nadal działa
# [ ] UI kalendarza nadal wyświetla bookings poprawnie
```

---

## Checklist weryfikacyjna

- [ ] `equipment` tabela z RLS – przetestowana (SELECT jako pracownik, INSERT jako owner)
- [ ] `service_equipment` tabela – powiązanie działa (JOIN z services)
- [ ] `equipment_bookings` – EXCLUDE constraint blokuje nakładające się sloty
- [ ] EXCLUDE NIE blokuje slotów sąsiadujących (ważne dla kolejnych rezerwacji)
- [ ] Funkcja `check_equipment_availability` zwraca poprawne wyniki dla 3 scenariuszy
- [ ] Testy regresji bookingów (bez sprzętu) zdane
- [ ] `npm run build` bez błędów TypeScript

---

## Poprzedni / Następny sprint

⬅️ [Sprint 01 – Billing Przelewy24](./Sprint-01-Billing-Przelewy24.md)  
➡️ [Sprint 03 – Rezerwacja Sprzętu – Backend i Frontend](./Sprint-03-Equipment-Backend-Frontend.md)
