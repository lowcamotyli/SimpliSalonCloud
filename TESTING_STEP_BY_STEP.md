# 🧪 Prosty Przewodnik Testowania - Krok po Kroku

## Test 1: Soft Delete w SQL (NAJŁATWIEJSZY)

### Krok 1: Znajdź ID bookingu
Otwórz Supabase SQL Editor i wykonaj:

```sql
SELECT 
  id,
  booking_date,
  booking_time,
  deleted_at
FROM bookings 
WHERE deleted_at IS NULL 
LIMIT 5;
```

**Wynik będzie wyglądał tak:**
```
id                                    | booking_date | booking_time | deleted_at
--------------------------------------|--------------|--------------|------------
a1b2c3d4-e5f6-7890-abcd-ef1234567890 | 2026-01-27   | 10:00        | null
b2c3d4e5-f6a7-8901-bcde-f12345678901 | 2026-01-27   | 14:00        | null
```

### Krok 2: Skopiuj jedno ID
Kliknij na ID (długi ciąg znaków) i skopiuj go (Ctrl+C)

Przykład ID: `a1b2c3d4-e5f6-7890-abcd-ef1234567890`

### Krok 3: Usuń booking (soft delete)
Wklej skopiowane ID do tego zapytania:

```sql
-- ZAMIEŃ 'TUTAJ_WKLEJ_ID' na skopiowane ID
DELETE FROM bookings WHERE id = 'TUTAJ_WKLEJ_ID';
```

Przykład:
```sql
DELETE FROM bookings WHERE id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
```

### Krok 4: Sprawdź czy działa soft delete
```sql
-- ZAMIEŃ 'TUTAJ_WKLEJ_ID' na to samo ID co wyżej
SELECT 
  id, 
  deleted_at, 
  deleted_by 
FROM bookings 
WHERE id = 'TUTAJ_WKLEJ_ID';
```

**✅ SUKCES jeśli:**
- Rekord nadal istnieje (nie został fizycznie usunięty)
- `deleted_at` ma teraz datę/czas (np. `2026-01-26 20:52:30`)
- `deleted_by` ma UUID (ID użytkownika który usunął)

**❌ BŁĄD jeśli:**
- Rekord nie istnieje (został fizycznie usunięty)
- `deleted_at` jest nadal `null`

---

## Test 2: Sprawdź czy usunięty booking zniknął z aplikacji

### Krok 1: Otwórz aplikację
```
http://localhost:3000
```

### Krok 2: Przejdź do kalendarza/listy bookingów

### Krok 3: Sprawdź czy booking który usunąłeś w SQL zniknął z listy

**✅ SUKCES jeśli:** Booking nie jest widoczny w aplikacji

**Dlaczego?** Bo wszystkie queries mają teraz `.is('deleted_at', null)` - pokazują tylko NIE usunięte rekordy!

---

## Test 3: Version Control (Optimistic Locking)

### Krok 1: Znajdź booking i jego wersję
```sql
SELECT 
  id, 
  version, 
  notes 
FROM bookings 
WHERE deleted_at IS NULL 
LIMIT 1;
```

**Wynik:**
```
id                                    | version | notes
--------------------------------------|---------|-------
c3d4e5f6-a7b8-9012-cdef-123456789012 | 1       | null
```

### Krok 2: Spróbuj update z POPRAWNĄ wersją (powinno działać)
```sql
-- Zamień ID i użyj version z poprzedniego zapytania
UPDATE bookings 
SET notes = 'Test update', version = 1  -- użyj wersji z poprzedniego zapytania
WHERE id = 'c3d4e5f6-a7b8-9012-cdef-123456789012';
```

### Krok 3: Sprawdź czy version się zwiększył
```sql
SELECT id, version, notes, updated_at 
FROM bookings 
WHERE id = 'c3d4e5f6-a7b8-9012-cdef-123456789012';
```

**✅ SUKCES jeśli:**
- `version` zwiększył się o 1 (było 1, teraz jest 2)
- `updated_at` został zaktualizowany
- `notes` zawiera "Test update"

### Krok 4: Spróbuj update z BŁĘDNĄ wersją (powinno rzucić błąd)
```sql
-- Użyj ZŁEJ wersji (np. 999)
UPDATE bookings 
SET notes = 'To nie powinno działać', version = 999
WHERE id = 'c3d4e5f6-a7b8-9012-cdef-123456789012';
```

**✅ SUKCES jeśli:** Dostaniesz błąd:
```
ERROR: Record has been modified by another user (expected version 2, got 999)
```

---

## Test 4: Constraints (Walidacja Danych)

### Test A: Data za daleko w przyszłości
```sql
INSERT INTO bookings (
  salon_id, 
  client_id, 
  service_id, 
  employee_id,
  booking_date, 
  booking_time, 
  status
) VALUES (
  (SELECT id FROM salons LIMIT 1),
  (SELECT id FROM clients LIMIT 1),
  (SELECT id FROM services LIMIT 1),
  (SELECT id FROM employees LIMIT 1),
  CURRENT_DATE + INTERVAL '2 years',  -- Za daleko!
  '10:00',
  'scheduled'
);
```

**✅ SUKCES jeśli:** Błąd:
```
ERROR: new row violates check constraint "bookings_date_future_check"
```

### Test B: Niepoprawny numer telefonu
```sql
INSERT INTO clients (
  salon_id, 
  client_code, 
  full_name, 
  phone
) VALUES (
  (SELECT id FROM salons LIMIT 1),
  'TEST001',
  'Test Client',
  'abc123'  -- Niepoprawny format!
);
```

**✅ SUKCES jeśli:** Błąd:
```
ERROR: new row violates check constraint "clients_phone_format"
```

### Test C: Ujemna cena usługi
```sql
INSERT INTO services (
  salon_id, 
  name, 
  category, 
  subcategory, 
  duration, 
  price
) VALUES (
  (SELECT id FROM salons LIMIT 1),
  'Test Service',
  'Test',
  'Test',
  30,
  -10  -- Ujemna cena!
);
```

**✅ SUKCES jeśli:** Błąd:
```
ERROR: new row violates check constraint "services_price_non_negative"
```

---

## 📊 Checklist Testów

Zaznacz co przetestowałeś:

### Soft Delete
- [ ] Znalazłem ID bookingu
- [ ] Wykonałem DELETE
- [ ] Rekord nadal istnieje w bazie
- [ ] `deleted_at` ma wartość
- [ ] `deleted_by` ma UUID
- [ ] Booking zniknął z aplikacji

### Version Control
- [ ] Update z poprawną wersją działa
- [ ] Version zwiększył się o 1
- [ ] `updated_at` został zaktualizowany
- [ ] Update z błędną wersją rzuca błąd

### Constraints
- [ ] Data za 2 lata rzuca błąd
- [ ] Niepoprawny telefon rzuca błąd
- [ ] Ujemna cena rzuca błąd

---

## 🎉 Jeśli Wszystko Działa

Gratulacje! Twoja baza danych ma teraz:
- ✅ Soft Delete - możesz odzyskać usunięte dane
- ✅ Version Control - wykrywa konflikty przy edycji
- ✅ Constraints - waliduje dane na poziomie bazy
- ✅ Indeksy - szybsze zapytania
- ✅ Triggery - automatyczne akcje

---

## ❓ Pytania?

**Q: Co jeśli chcę NAPRAWDĘ usunąć rekord?**
A: Musisz najpierw ustawić `deleted_at` na NULL, potem usunąć:
```sql
UPDATE bookings SET deleted_at = NULL WHERE id = 'ID';
DELETE FROM bookings WHERE id = 'ID';
```

**Q: Jak przywrócić soft-deleted booking?**
A: Ustaw `deleted_at` na NULL:
```sql
UPDATE bookings SET deleted_at = NULL WHERE id = 'ID';
```

**Q: Jak zobaczyć WSZYSTKIE bookings (włącznie z usuniętymi)?**
A: Usuń filtr `.is('deleted_at', null)` z query lub w SQL:
```sql
SELECT * FROM bookings;  -- bez WHERE deleted_at IS NULL
```
