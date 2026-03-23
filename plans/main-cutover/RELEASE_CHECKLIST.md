# RELEASE CHECKLIST - feature/multi-booking -> main

## Purpose
Ta checklista sluzy do kontrolowanego przeniesienia stabilnej wersji z `feature/multi-booking` na `main`.
Zakladamy, ze branch zawiera zmiany z obszarow `SS2.0` i `SS2.1` i jest aktualnym kandydatem do releasu.

## Release strategy
1. Zamrozic zmiany na `feature/multi-booking` poza blocker fixami.
2. Wybrac konkretny release commit SHA.
3. Utworzyc branch posredni `release/ss2-main-cutover`.
4. Wykonac walidacje techniczna, produktowa i migracyjna.
5. Otworzyc PR z `release/ss2-main-cutover` do `main`.
6. Zmergowac tylko po przejsciu checklisty i w ustalonym oknie wdrozeniowym.

## Scope confirmation
- [ ] Potwierdzony release commit SHA na `feature/multi-booking`
- [ ] Potwierdzone, ze zakres releasu obejmuje zmiany z `SS2.0` i `SS2.1`
- [ ] Potwierdzone, ze nie ma przypadkowych zmian spoza zakresu releasu
- [ ] Potwierdzone, ze nowe feature'y sa zamrozone do czasu merge'u

## Branching and PR flow
- [ ] Utworzony branch `release/ss2-main-cutover` od wybranego SHA
- [ ] Branch release zawiera tylko zmiany przeznaczone do wejscia na `main`
- [ ] PR `release/ss2-main-cutover -> main` zostal otwarty
- [ ] W opisie PR jest lista ryzyk, plan deployu i plan rollbacku

## Technical validation
- [ ] `tsc --noEmit`
- [ ] lint
- [ ] production build
- [ ] wszystkie krytyczne testy automatyczne przechodza
- [ ] brak blocker warningow w build/deploy logach

## Database and migrations
- [ ] Sprawdzona lista migracji obecnych na branchu release
- [ ] Sprawdzony stan migracji na staging/production
- [ ] Potwierdzony brak driftu lub przygotowany plan jego naprawy
- [ ] Zweryfikowana kolejnosc odpalania migracji
- [ ] Backup bazy wykonany przed wdrozeniem
- [ ] Znany i realny plan rollbacku migracji

## Environment and infrastructure
- [ ] Porownane env brancha release i `main`
- [ ] Zweryfikowane sekrety Supabase
- [ ] Zweryfikowane webhook secrets
- [ ] Zweryfikowane ustawienia mail/SMS
- [ ] Zweryfikowane cron jobs
- [ ] Zweryfikowane feature flags
- [ ] Zweryfikowane zmienne Vercel / deployment target

## Product smoke test
### Booking / Calendar
- [ ] Utworzenie nowej wizyty
- [ ] Edycja wizyty
- [ ] Anulowanie wizyty
- [ ] Zakonczenie wizyty
- [ ] Multi-booking
- [ ] Ostrzezenia o konflikcie pracownika
- [ ] Ostrzezenia o konflikcie sprzetu
- [ ] Reczna edycja godziny w modalu `Nowa wizyta`

### Clients / Forms / Reminders
- [ ] Rezerwacja dla istniejacego klienta
- [ ] Rezerwacja dla nowego klienta
- [ ] Formularze przed wizyta
- [ ] Reminder flow
- [ ] Powiazania booking -> forms / reminders dzialaja po zmianach z `SS2.1`

### Payments / Closing
- [ ] Zamykanie wizyty gotowka
- [ ] Zamykanie wizyty karta
- [ ] Voucher, jesli objety zakresem releasu

## SS2.0 / SS2.1 review
- [ ] `docs/SS2.0/` przejrzane pod katem funkcji, ktore musza przejsc smoke test
- [ ] `docs/sprints/SS2.1/` przejrzane pod katem aktywnych zmian i zaleznosci
- [ ] `tests/SS2.1/` wykorzystane jako podstawa UAT / smoke testow

## Release decision
- [ ] Wszystkie blocker issues zamkniete
- [ ] Wszystkie known issues udokumentowane
- [ ] Jest decyzja ship / no-ship
- [ ] Jest wskazana osoba odpowiedzialna za merge
- [ ] Jest wskazana osoba odpowiedzialna za deploy
- [ ] Jest wskazana osoba odpowiedzialna za smoke test po deployu

## Deployment window
- [ ] Ustalona data i godzina wdrozenia
- [ ] Zespol zna okno niedostepnosci / podwyzszonego ryzyka
- [ ] Backup i monitoring gotowe przed merge
- [ ] Deploy `main` gotowy od razu po merge

## Post-deploy verification
- [ ] Smoke test wykonany na produkcji
- [ ] Monitoring i logi sprawdzone po wdrozeniu
- [ ] Krytyczne API endpoints odpowiadaja poprawnie
- [ ] Crony i webhooki dzialaja po wdrozeniu
- [ ] Brak regresji w najwazniejszych flow salonu

## Rollback plan
- [ ] Znany commit rollbackowy dla `main`
- [ ] Wiadomo, kto podejmuje decyzje o rollbacku
- [ ] Wiadomo, jak postepowac przy problemie migracyjnym
- [ ] Wiadomo, jak przywrocic poprzedni deploy aplikacji

## Notes
- Traktowac `feature/multi-booking` jako release candidate, nie jako branch roboczy do dalszego rozjazdu.
- Jesli diff do `main` jest bardzo duzy, review prowadzic sekcjami: booking, UI, API, migrations, automations.
- Nie merge'owac do `main`, dopoki nie ma jasnego release SHA i zamknietej checklisty.
