# Diagnostyka błędu daty w kalendarzu

## Problem
Kliknięcie na datę w widoku miesiąca (np. 29) uzupełnia formularz datą dzisiejszą (np. 25).

## Hipotezy do testowania

### Hipoteza 1: Błąd w formatowaniu daty z `formatDate()`
- `formatDate()` zwraca string w formacie 'yyyy-MM-dd'
- `prefilledSlot.date` powinien być stringiem w tym formacie
- Sprawdzić: czy `formatDate(day)` w MonthView zwraca prawidłowy format

### Hipoteza 2: Błąd w synchronizacji `useEffect` w BookingDialog
- `prefilledSlot` zmienia się, ale `form.reset()` nie jest wywoływany
- Sprawdzić: czy dependency array zawiera `prefilledSlot`

### Hipoteza 3: Błąd w obsłudze kliknięcia w MonthView
- `onDayClick(day)` jest wywoływany, ale `day` nie jest prawidłowym obiektem Date
- Sprawdzić: czy `day` z `eachDayOfInterval` jest prawidłowym Date

### Hipoteza 4: Błąd w resetowaniu formularza
- `form.reset()` jest wywoływany, ale z opóźnieniem
- Sprawdzić: czy `useEffect` ma prawidłowe zależności

## Plan testów

1. Dodaj console.log w MonthView przy kliknięciu
2. Dodaj console.log w handleDayClick
3. Dodaj console.log w BookingDialog useEffect
4. Sprawdź wartości w DevTools
