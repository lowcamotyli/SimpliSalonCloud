# 🧪 Instrukcje Testowania Database Fundamentals

## Metoda 1: Testy SQL w Supabase Dashboard (ZALECANE)

### Krok 1: Podstawowa Weryfikacja
1. Otwórz: https://supabase.com/dashboard/project/ubkueiwelarplnbhqmoa/sql/new
2. Skopiuj i wykonaj zapytanie z sekcji "PODSUMOWANIE TESTÓW" z pliku `supabase/test_migration.sql`

**Oczekiwane wyniki:**
```
Indeksy: 14
Funkcje: 4
Triggery: 6
Tabele z deleted_at: 6
Tabele z version: 4
```

### Krok 2: Test Soft Delete (Praktyczny)

**2.1 Znajdź testowy booking:**
```sql
SELECT id, salon_id, client_id, booking_date, deleted_at 
FROM bookings 
WHERE deleted_at IS NULL 
LIMIT 1;
```

**2.2 Zapisz ID i spróbuj usunąć:**
```sql
-- Zamień 'YOUR_BOOKING_ID' na prawdziwe ID
DELETE FROM bookings WHERE id = 'YOUR_BOOKING_ID';
```

**2.3 Sprawdź czy został soft-deleted:**
```sql
SELECT id, deleted_at, deleted_by 
FROM bookings 
WHERE id = 'YOUR_BOOKING_ID';
```

**✅ Oczekiwany wynik:**
- Rekord nadal istnieje w bazie
- `deleted_at` ma wartość (timestamp)
- `deleted_by` ma UUID użytkownika

### Krok 3: Test Version Control (Optimistic Locking)

**3.1 Znajdź testowy booking:**
```sql
SELECT id, version, notes, updated_at 
FROM bookings 
WHERE deleted_at IS NULL 
LIMIT 1;
```

**3.2 Update z poprawną wersją (POWINNO DZIAŁAĆ):**
```sql
-- Zamień wartości na prawdziwe
UPDATE bookings 
SET notes = 'Test update', version = 1  -- użyj aktualnej wersji
WHERE id = 'YOUR_BOOKING_ID';
```

**3.3 Sprawdź czy version został zwiększony:**
```sql
SELECT id, version, notes, updated_at 
FROM bookings 
WHERE id = 'YOUR_BOOKING_ID';
```

**✅ Oczekiwany wynik:**
- `version` zwiększył się o 1 (np. z 1 na 2)
- `updated_at` został zaktualizowany
- `notes` zawiera nową wartość

**3.4 Update z niepoprawną wersją (POWINNO RZUCIĆ BŁĄD):**
```sql
UPDATE bookings 
SET notes = 'Test update 2', version = 999  -- zła wersja
WHERE id = 'YOUR_BOOKING_ID';
```

**✅ Oczekiwany błąd:**
```
ERROR: Record has been modified by another user (expected version 2, got 999)
```

### Krok 4: Test Constraints

**4.1 Test: Data za daleko w przyszłości (POWINNO RZUCIĆ BŁĄD):**
```sql
INSERT INTO bookings (
  salon_id, client_id, service_id, employee_id, 
  booking_date, booking_time, status
)
VALUES (
  (SELECT id FROM salons LIMIT 1),
  (SELECT id FROM clients LIMIT 1),
  (SELECT id FROM services LIMIT 1),
  (SELECT id FROM employees LIMIT 1),
  CURRENT_DATE + INTERVAL '2 years',  -- Za daleko!
  '10:00',
  'scheduled'
);
```

**✅ Oczekiwany błąd:**
```
ERROR: new row violates check constraint "bookings_date_future_check"
```

**4.2 Test: Niepoprawny format telefonu (POWINNO RZUCIĆ BŁĄD):**
```sql
INSERT INTO clients (salon_id, client_code, full_name, phone)
VALUES (
  (SELECT id FROM salons LIMIT 1),
  'TEST001',
  'Test Client',
  'abc123'  -- Niepoprawny format!
);
```

**✅ Oczekiwany błąd:**
```
ERROR: new row violates check constraint "clients_phone_format"
```

**4.3 Test: Ujemna cena usługi (POWINNO RZUCIĆ BŁĄD):**
```sql
INSERT INTO services (salon_id, name, category, subcategory, duration, price)
VALUES (
  (SELECT id FROM salons LIMIT 1),
  'Test Service',
  'Test',
  'Test',
  30,
  -10  -- Ujemna cena!
);
```

**✅ Oczekiwany błąd:**
```
ERROR: new row violates check constraint "services_price_non_negative"
```

### Krok 5: Test Wydajności Indeksów

```sql
EXPLAIN ANALYZE
SELECT * FROM bookings 
WHERE salon_id = (SELECT id FROM salons LIMIT 1)
  AND booking_date = CURRENT_DATE
  AND deleted_at IS NULL;
```

**✅ Oczekiwany wynik:**
W planie wykonania powinieneś zobaczyć:
```
Index Scan using idx_bookings_salon_date on bookings
```

To oznacza że indeks jest używany! 🚀

---

## Metoda 2: Test przez API (Szybki Test)

### Krok 1: Uruchom endpoint testowy

Otwórz w przeglądarce lub użyj curl:
```
http://localhost:3000/api/test-db-fundamentals
```

Lub w terminalu:
```bash
curl http://localhost:3000/api/test-db-fundamentals
```

**✅ Oczekiwany wynik:**
```json
{
  "timestamp": "2026-01-26T...",
  "tests": [
    { "name": "Bookings table has new columns", "passed": true },
    { "name": "Soft delete filter works", "passed": true },
    { "name": "Indexes created", "passed": true },
    { "name": "Constraints created", "passed": true },
    { "name": "Triggers created", "passed": true },
    { "name": "Version control columns populated", "passed": true }
  ],
  "summary": {
    "passed": 6,
    "failed": 0,
    "total": 6,
    "successRate": "100%",
    "status": "ALL TESTS PASSED ✅"
  }
}
```

---

## Metoda 3: Test w Aplikacji (Manualny)

### Test 1: Soft Delete w UI

1. Otwórz aplikację: http://localhost:3000
2. Przejdź do listy bookings
3. Usuń jakiś booking
4. Sprawdź w Supabase Dashboard czy booking ma `deleted_at` ustawione
5. Sprawdź czy booking zniknął z listy w aplikacji

### Test 2: Version Control w UI

1. Otwórz booking do edycji w dwóch zakładkach przeglądarki
2. W zakładce 1: Zmień notatkę i zapisz
3. W zakładce 2: Spróbuj zmienić notatkę i zapisz
4. Powinieneś zobaczyć błąd: "Record has been modified by another user"

---

## 📊 Checklist Testów

Po wykonaniu testów, zaznacz co przeszło:

### Podstawowa Weryfikacja
- [ ] Wszystkie indeksy utworzone (14)
- [ ] Wszystkie funkcje utworzone (4)
- [ ] Wszystkie triggery utworzone (6)
- [ ] Wszystkie tabele mają `deleted_at` (6)
- [ ] Wszystkie tabele mają `version` (4)

### Soft Delete
- [ ] DELETE ustawia `deleted_at` zamiast usuwać rekord
- [ ] `deleted_by` zawiera UUID użytkownika
- [ ] Soft-deleted rekordy nie pojawiają się w queries z `.is('deleted_at', null)`

### Version Control
- [ ] UPDATE zwiększa `version` o 1
- [ ] UPDATE aktualizuje `updated_at`
- [ ] UPDATE z niepoprawną wersją rzuca błąd

### Constraints
- [ ] Nie można dodać bookingu z datą > 1 rok w przyszłość
- [ ] Nie można dodać klienta z niepoprawnym telefonem
- [ ] Nie można dodać usługi z ujemną ceną
- [ ] Status bookingu musi być z listy dozwolonych wartości

### Wydajność
- [ ] Indeksy są używane (widoczne w EXPLAIN ANALYZE)
- [ ] Queries są szybsze niż przed migracją

---

## 🐛 Troubleshooting

### Problem: "column deleted_at does not exist"
**Rozwiązanie:** Migracja nie została wykonana poprawnie. Wykonaj ponownie `complete_migration.sql`

### Problem: Soft delete nie działa
**Rozwiązanie:** Sprawdź czy triggery zostały utworzone:
```sql
SELECT * FROM information_schema.triggers 
WHERE trigger_name LIKE '%soft_delete%';
```

### Problem: Version control nie działa
**Rozwiązanie:** Sprawdź czy triggery zostały utworzone:
```sql
SELECT * FROM information_schema.triggers 
WHERE trigger_name LIKE '%version_check%';
```

### Problem: Indeksy nie są używane
**Rozwiązanie:** Wykonaj ANALYZE:
```sql
ANALYZE bookings;
ANALYZE clients;
ANALYZE services;
ANALYZE employees;
```

---

## 📈 Metryki Sukcesu

Po testach, powinieneś zobaczyć:

✅ **100% testów przeszło**
✅ **Soft delete działa** - rekordy nie są usuwane fizycznie
✅ **Version control działa** - konflikty są wykrywane
✅ **Constraints działają** - niepoprawne dane są odrzucane
✅ **Indeksy działają** - queries są szybsze

---

## 🎉 Gratulacje!

Jeśli wszystkie testy przeszły, Twoja baza danych jest teraz:
- 🚀 **Szybsza** - dzięki indeksom
- 🔒 **Bezpieczniejsza** - dzięki constraints i version control
- 💾 **Bardziej niezawodna** - dzięki soft delete
- 📝 **Łatwiejsza w utrzymaniu** - dzięki audit trail (deleted_by, updated_at)
