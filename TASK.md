# TASK — Testowanie E2E: formularze, SMS przed wizytą, ankiety

## Branch
`feature/forms-treatment-records`

## Baza danych
**STAGING** — `https://bxkxvrhspklpkkgmzcge.supabase.co`
`.env.local` już przełączony na staging.

## Bugi naprawione dziś podczas testów

1. **CRON pre-appointment** — `status = 'scheduled'` akceptowany (był: tylko confirmed/pending)
2. **CRON pre-appointment** — używa formularza przypisanego do usługi zamiast hardcoded built-in
3. **CRON pre-appointment** — skipuje jeśli usługa nie ma przypisanego formularza
4. **`/api/forms/pre/[token]` GET+POST** — ładuje i waliduje custom template z DB (był: zawsze built-in)
5. **Submissions page** — pokazuje `pre_appointment_responses` obok `client_forms` z badge "Przed wizytą"
6. **SubmissionViewDialog** — nowy komponent pokazujący odpowiedzi klienta

## Status testów

### BLOK A — Formularze dashboard
- [ ] Tworzenie szablonu przez UI
- [ ] Podgląd szablonu
- [ ] "Przypisz do usług" dialog
- [x] Submissions page wyświetla wpisy
- [ ] "Zobacz" dialog — zaimplementowany, jeszcze NIE przetestowany

### BLOK B — Formularz przed wizytą
- [x] CRON znajduje wizytę i tworzy token
- [x] Formularz ładuje custom template (formularz usługi)
- [x] Submit działa, pojawia się w submissions
- [ ] Test podwójnego submit
- [ ] Test wygasłego tokenu
- [ ] SMS — nie działa na staging (brak kredencjałów SMSAPI)

### BLOK C — Ankiety po wizycie
- [x] CRON survey — znajdowanie bookingu (features.surveys + notif_settings.surveys.enabled)
- [x] CRON survey — tworzenie satisfaction_survey + fill_token
- [x] Submit ankiety (rating/NPS/comment zapisane, fill_token=null po submit)
- [x] Double-submit protection (fill_token=null → 404)
- [x] CRON de-duplikacja (UNIQUE booking_id blokuje podwójne wysłanie)
- [ ] UI ankiety w przeglądarce — świeży token gotowy (patrz niżej)
- [ ] NPS w /anastazja/reports — wymaga auth w przeglądarce

### URL do testu UI ankiety (ważny do 2026-03-20):
http://localhost:3000/survey/eyJhbGciOiJIUzI1NiJ9.eyJib29raW5nSWQiOiI0NGEyMWU5NC1lYzYxLTRiOTMtOGQ5YS03MDQ4ZmNiODQ1MTAiLCJzYWxvbklkIjoiZjVkMGY0NzktNTk1OS00Y2Y4LThhM2YtMjRmNjNhOTgxZjliIiwidHlwIjoic3VydmV5IiwiaWF0IjoxNzczODQyNTQ0LCJleHAiOjE3NzQwMTUzNDR9.KHVxBynagYnRXLMJODhIWmqn4QZNnLb9csaHXHVoCmw

## Konfiguracja staging (gotowe)
- Salon ANASTAZJA: `f5d0f479-5959-4cf8-8a3f-24f63a981f9b`
- features.forms = true
- preAppointmentForms.enabled = true
- Usługa "Strzyzenie damskie" (967638b5) ma przypisany formularz (040a619c)

## Polecenia PowerShell

```powershell
# CRON pre-appointment
Invoke-WebRequest -Uri "http://localhost:3000/api/cron/pre-appointment-forms" -Headers @{"Authorization"="Bearer f4339491fbb19089839f4ba9ba27232786b85d750b0e0fd3e2ee008ec7bc4b21"} | Select-Object -ExpandProperty Content

# CRON ankiety
Invoke-WebRequest -Uri "http://localhost:3000/api/cron/surveys" -Headers @{"Authorization"="Bearer f4339491fbb19089839f4ba9ba27232786b85d750b0e0fd3e2ee008ec7bc4b21"} | Select-Object -ExpandProperty Content
```

## Supabase REST
- Base: `https://bxkxvrhspklpkkgmzcge.supabase.co/rest/v1/`
- Key: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ4a3h2cmhzcGtscGtrZ216Y2dlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzgyNjIzMiwiZXhwIjoyMDg5NDAyMjMyfQ.1ffgncO6lnmdOub_xNAu_aY2W0YGY4Cgaf9FFpY-1gg`

## Jak zacząć BLOK C
1. Znajdź booking_id na staging dla salonu ANASTAZJA
2. Ustaw: status=completed, survey_sent=false, booking_date=today, booking_time=2.5h temu
3. Wywołaj CRON surveys (polecenie wyżej)
4. Sprawdź token w satisfaction_surveys
5. Otwórz /survey/[token], wypełnij
6. Sprawdź NPS w /[slug]/reports

## Znane problemy
- SMS na staging nie wysyła (brak SMSAPI credentials)
- pre_appointment_responses.form_template_id to TEXT bez FK (do migracji później)
