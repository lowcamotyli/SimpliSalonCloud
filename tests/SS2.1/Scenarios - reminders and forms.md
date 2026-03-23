Test scenarios — formularze i przypomnienia
1. Ankieta po wizycie (/survey/[token])
 Happy path — wypełnij gwiazdki + NPS + komentarz → submit → ekran "Dziękujemy"
 Tylko gwiazdki (bez NPS i komentarza) → submit działa
 Submit bez gwiazdek → button zablokowany
 Odśwież po submit → ekran "już wypełniona" (token unieważniony)
 Nieprawidłowy token → ekran błędu 404
 Wygasły token → ekran "ankieta wygasła" 410
2. Formularz przed wizytą (/forms/pre/[token])
 Happy path — wypełnij wymagane pola → submit → "Formularz wysłany!"
 Puste wymagane pole → walidacja inline (czerwony błąd, scroll do góry)
 Submit ponownie po wypełnieniu → ekran "już wysłany" 409
 Wygasły token → ekran "link wygasł" 410
 Nieprawidłowy token → ekran błędu
3. Formularz niestandardowy (/forms/fill/[token])
 Happy path z podpisem → narysuj podpis → submit → "Formularz wypełniony!"
 Happy path bez podpisu (jeśli pole niewymagane)
 Warunkowo widoczne pole — odpowiedź X pokazuje ukryte pole Y
 Zgoda GDPR wymagana → submit bez zaznaczenia → błąd
 Zgoda zdrowotna (data_category: health) → wymagana osobna zgoda
 Upload zdjęcia → podgląd w polu → submit
 Wygasły/użyty token → 410
4. Przypomnienia (/api/cron/reminders)
 Wizyta za hours_before ± 7.5min → SMS wysłany
 Przypomnienie z potwierdzeniem → SMS zawiera link /api/bookings/confirm/[token]
 Kliknięcie linku potwierdzenia → status wizyty zmienia się na "potwierdzona"
 Brak numeru telefonu klienta → skipped (bez crash)
 Wizyta już przypomniana → nie wysyła drugi raz
5. Edge cases wspólne
 Klient bez numeru → skipped, CRON nie crashuje
 SMS wallet pusty (0 kredytów) → CRON nie crashuje, loguje błąd
 Dwa szybkie submity (double submit) → tylko jeden zapis (idempotentność)