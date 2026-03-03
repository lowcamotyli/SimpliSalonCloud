# Plan Testow Manus AI - SimpliSalonCloud

Scenariusze testowe oparte na **rzeczywistym kodzie** aplikacji SimpliSalonCloud.
Logowanie i rejestracja sa juz przetestowane i pominiete.

## Konfiguracja

W kazdym skrypcie PowerShell definiujesz 3 zmienne na gorze pliku:

```powershell
$appUrl    = "https://simplisaloncloud.vercel.app"
$testEmail = "twoj-testowy@email.com"
$testPass  = "TwojeTestoweHaslo123"
```

Prompt jest budowany dynamicznie, wiec Manus automatycznie
otrzyma prawdziwe dane logowania — bez zadnych placeholderow.

---

## Scenariusz 1: Kalendarz i Rezerwacje (CRUD)

**Cel:** Pelny cykl zycia wizyty: utworzenie, podglad, zakonczenie platnosci i anulowanie.

**Prompt dla Manus:**
> "Log in to SimpliSalonCloud at $appUrl/login with email '$testEmail' and password '$testPass'. Navigate to the Calendar page using the sidebar. Switch between Day, Week, and Month views and verify that all three load correctly. Then click the '+' button or click on an empty time slot to open the 'Nowa wizyta' (New Booking) dialog. Fill in all required fields: select an employee from the dropdown, select a service, type a client name (check if autocomplete suggestions appear), enter a phone number, pick a date and time. Click 'Zapisz wizyte' to save the booking. Verify the booking appears on the calendar. Click on the newly created booking to open its details. On the detail view, verify that all fields are displayed correctly (client name, service, employee, date/time, price, status). Click 'Gotowka' (Cash) to complete the booking and verify the status changes. Create another booking, then click 'Anuluj wizyte' (Cancel Booking) and confirm. Verify it disappears or shows cancelled status. Report any UI glitches, missing translations, or errors."

---

## Scenariusz 2: Zarzadzanie Klientami i CRM

**Cel:** Dodawanie klienta, wysylanie wiadomosci, przegladanie historii, nawigacja po sekcjach CRM.

**Prompt dla Manus:**
> "Log in to SimpliSalonCloud at $appUrl/login with email '$testEmail' and password '$testPass'. Navigate to 'Klienci' (Clients) in the sidebar. Verify the client list loads. Click the button to add a new client. Fill in the form with: full name (minimum 2 characters), phone number (9+ digits), email, and optional notes. Save the client and verify it appears in the list. Then click on the client row to see details. Try the 'Quick Send' feature - click the message icon next to a client, select a template from the dropdown, and verify the send dialog works. Navigate to the CRM sub-sections: 'Kampanie' (Campaigns), 'Automatyzacje' (Automations), 'Wiadomosci' (Messages), and 'Szablony' (Templates). Verify each section loads without errors. Check that all UI labels are in Polish and there are no raw English strings or technical variable names visible. Try editing an existing client and then deleting a client. Report any validation errors, missing translations, or broken features."

---

## Scenariusz 3: Zarzadzanie Uslugami

**Cel:** Tworzenie, edycja, dezaktywacja i usuwanie uslugi z walidacja formularza.

**Prompt dla Manus:**
> "Log in to SimpliSalonCloud at $appUrl/login with email '$testEmail' and password '$testPass'. Navigate to 'Uslugi' (Services) in the sidebar. Verify the services list loads, grouped by categories and subcategories. Click the button to add a new service. Fill the form: enter a category name, subcategory name, service name (minimum 2 chars), price (must be greater than 0), and duration in minutes (must be greater than 0). Save and verify the service appears in the list under the correct category. Then edit the service - change the price and save. Verify the updated price is displayed. Try toggling the service's active status using the switch/toggle and confirm the UI reflects the change. Try submitting the form with invalid data (empty name, zero price) and verify that validation error messages appear in Polish. Finally, delete a service and confirm it disappears. Report any issues."

---

## Scenariusz 4: Zarzadzanie Pracownikami i Role

**Cel:** Dodawanie pracownika, ustawianie prowizji, zmiana roli (RBAC) i linkowanie konta.

**Prompt dla Manus:**
> "Log in to SimpliSalonCloud at $appUrl/login with email '$testEmail' and password '$testPass'. Navigate to 'Pracownicy' (Employees) in the sidebar. Verify the employee list loads with cards or a table showing employee details. Click the button to add a new employee. Fill in: first name, last name, phone number (9+ digits), email, base salary, commission rate (0-100%), and base threshold. Save and verify the employee appears in the list. Then edit the employee - change the commission rate. Verify the updated value is saved. Try the 'Change Role' feature - click the role button on an employee card and try changing between available roles (e.g., owner, manager, employee, receptionist). Verify the role badge updates. Check if the 'Link Account' feature is available - try to link an employee to a user account by entering an email. Finally, delete an employee and confirm removal. Report any validation errors or UI issues."

---

## Scenariusz 5: Dashboard i Nawigacja

**Cel:** Weryfikacja dashboardu (statystyki, wykresy), nawigacji bocznej i responsywnosci.

**Prompt dla Manus:**
> "Log in to SimpliSalonCloud at $appUrl/login with email '$testEmail' and password '$testPass'. After login, verify the Dashboard page loads correctly. Check that the following elements are visible: summary stat cards (e.g., bookings count, revenue, clients count, trends), and the employee revenue chart. Verify that all text is in Polish. Then systematically navigate through every item in the sidebar menu: Dashboard, Kalendarz (Calendar), Klienci (Clients), Uslugi (Services), Pracownicy (Employees), Raporty (Reports), Rozliczenia (Payroll), Subskrypcja (Billing), Ustawienia (Settings). For each page, verify it loads without errors and shows appropriate content or an empty state. Check that there are no console errors visible in the UI, no 404 pages, and no English fallback text. Take a screenshot of each page. Report any broken links, missing pages, or navigation issues."

---

## Scenariusz 6: Ustawienia i Subskrypcja

**Cel:** Przegladanie wszystkich podstron ustawien i weryfikacja strony subskrypcji/billing.

**Prompt dla Manus:**
> "Log in to SimpliSalonCloud at $appUrl/login with email '$testEmail' and password '$testPass'. Navigate to 'Ustawienia' (Settings) via the sidebar. On the settings overview page, verify that all setting cards are visible: Wyglad (Appearance), Informacje o biznesie (Business Info), Integracje (Integrations), Powiadomienia (Notifications), Import danych (Data Import). Click into each sub-section: (1) Wyglad - verify theme selector works and displays available themes. (2) Informacje o biznesie - verify business name and contact details form loads. (3) Integracje - check if integration cards are displayed (e.g., Booksy). (4) Powiadomienia - verify notification settings toggle. (5) Import danych - verify CSV import UI is present. Then navigate to 'Subskrypcja' (Billing) in the sidebar. Verify the billing page shows: current plan name (Starter/Professional/Business/Enterprise), usage bars showing limits (e.g., employees, clients, SMS), and action buttons (upgrade/cancel). Check all labels are in Polish. Report any issues, broken links, or missing functionality."

---

## Scenariusz 7: Modul Wynagrodzen (Payroll) — pelny cykl

**Cel:** Weryfikacja obliczen prowizji, poprawnosci danych per pracownik, eksportu PDF, wysylki emaila i kontroli dostepu (RBAC).

**Kontekst techniczny:**
- Strona: `/[slug]/payroll`
- Formula wyplaty: `Do wyplaty (W) = Podstawa + max(0, Przychod - Prog) * Prowizja%`
- API: `GET /api/payroll?month=YYYY-MM` (odczyt), `POST /api/payroll` (generowanie i zapis)
- Generowanie zapisuje rekordy w tabelach `payroll_runs` i `payroll_entries`
- Dostep: tylko role z uprawnieniem `finance:view` (owner, manager) — employee widzi ekran "Brak dostepu"

**Prompt dla Manus:**
> "Log in to SimpliSalonCloud at $appUrl/login with email '$testEmail' and password '$testPass'. Navigate to 'Rozliczenia' (Payroll) in the sidebar. If the entry is not visible, the account lacks the finance:view permission — note this as a finding.
>
> **Test 1 — Podstawowy widok:** Verify the page loads with a month picker (format YYYY-MM) defaulting to the current month and a 'Generuj' button with a refresh icon. If no completed bookings exist for the current month, verify the empty state appears in Polish (e.g. 'Brak rozliczen' with a DollarSign icon and grey message). Switch to a previous month and verify the data reloads automatically without a full page refresh.
>
> **Test 2 — Karty podsumowujace:** When payroll data exists, verify two summary cards at the top of the page: 'Laczny przychod' (total salon revenue in PLN) and 'Laczne wyplaty' (total payout to employees in PLN). Both must display values formatted with 2 decimal places and a 'zl' suffix, e.g. '4 250,00 zl'.
>
> **Test 3 — Weryfikacja obliczen prowizji:** For each employee card verify 5 labeled fields are visible: 'Liczba wizyt' (visit count integer), 'Przychod (U)' (revenue in PLN), 'Prog (P)' (threshold in PLN), 'Prowizja' (commission amount in PLN with a green % badge), 'Do wyplaty (W)' (total payout highlighted in an emerald-green box). Manually verify the formula for at least one employee: payout = base_salary + max(0, revenue - threshold) x commission_rate. If the displayed 'Do wyplaty' does not match this calculation, report it as a critical calculation bug and include all actual values.
>
> **Test 4 — Rozwijana lista wizyt:** Click 'Szczegoly' (Details) on each employee card. Verify a visit breakdown table appears with 4 columns: Data (YYYY-MM-DD format), Klient (client full name), Usluga (service name), Cena (price with 2 decimal places and 'zl'). Verify the row count matches the 'Liczba wizyt' field. Click 'Ukryj wizyty' and confirm the table collapses.
>
> **Test 5 — Przycisk Generuj:** Click 'Generuj'. A browser confirm dialog must appear in Polish: 'Czy na pewno chcesz wygenerowac wynagrodzenia za YYYY-MM?'. Click OK. Verify the page either shows updated data or a meaningful Polish error message. Flag any English error text (e.g. 'No completed bookings for this period') as an untranslated string bug.
>
> **Test 6 — Pobierz PDF:** Click 'POBIERZ PDF' on at least one employee card. Verify a file download begins or a browser save-as dialog opens. If a toast error appears instead, capture the exact message text and note whether it is in Polish.
>
> **Test 7 — Wyslij email:** Click 'WYSLIJ EMAIL' on at least one employee card. Verify the button immediately changes to 'WYSYLANIE...' with a spinning icon and becomes disabled. After completion verify a success or error toast appears in Polish. Capture the exact toast message text.
>
> **Test 8 — Kontrola dostepu RBAC:** If possible to log in as a user with the 'employee' role (no finance:view permission), navigate to the Payroll page URL directly. Verify an access-denied card appears with a red DollarSign icon, heading 'Brak dostepu', and a Polish message about contacting the administrator. If actual payroll data is visible to an employee-role account, report this immediately as a critical RBAC authorization bypass.
>
> Report any calculation errors, formatting issues, missing Polish translations, broken PDF or email functionality, and RBAC bypass possibilities."

---

## Scenariusz 8: Integracja Booksy — konfiguracja, synchronizacja i weryfikacja danych

**Cel:** Przetestowanie pelnego flow integracji Booksy — Gmail OAuth, reczna synchronizacja, statystyki, logi rezerwacji oraz weryfikacja zgodnosci danych w kalendarzu i liscie klientow po syncu.

**Kontekst techniczny:**
- Strona: `/[slug]/settings/integrations/booksy`
- Mechanizm: Gmail OAuth — system czyta emaile od Booksy i tworzy wizyty w kalendarzu
- Reczna synchronizacja: `POST /api/integrations/booksy/sync` (max 20 emaili na raz)
- Statystyki: `GET /api/integrations/booksy/stats` (auto-refresh co 60 sekund)
- Logi: `GET /api/integrations/booksy/logs`
- Dostep: tylko owner (uprawnienie `settings:manage`)
- Opcje: filtr nadawcy, interwal sync (5/15/30/60 min), auto-tworzenie klientow i uslug, powiadomienia email

**Prompt dla Manus:**
> "Log in to SimpliSalonCloud at $appUrl/login with email '$testEmail' and password '$testPass'. Navigate to Settings -> Integracje -> Booksy. If Settings is not visible in the sidebar, the account lacks owner permissions — note this as a finding and stop.
>
> **Test 1 — Status polaczenia:** In the page header area verify a status badge shows either 'Polaczono' (green background, checkmark icon) or 'Nie polaczono' (gray background, X icon). Note which state is active — subsequent tests depend on this.
>
> **Test 2 — Polacz z Gmail (stan: niepodlaczony):** If not connected, verify the 'Konto Gmail' card shows a Polish explanation and a 'Polacz z Gmail' button with a mail icon. Click the button and verify the browser redirects to a Google OAuth URL (domain must be accounts.google.com). Go back without completing OAuth and note the redirect worked correctly.
>
> **Test 3 — Polaczone konto Gmail (stan: podlaczony):** If connected, verify: (a) the connected Gmail address is shown in a styled row with a blue mail icon and label 'Polaczone konto Gmail', (b) a 'Zmien konto' button with a refresh icon is present, (c) a red 'Odlacz integracje' button is present next to the note 'Istniejace rezerwacje nie zostana usuniete'. Click 'Odlacz integracje' — a Polish confirm dialog must appear. Click CANCEL and verify the integration is still active.
>
> **Test 4 — Statystyki synchronizacji:** If connected, verify 5 colored stat tiles: 'Emaili przetworzonych (lacznie)' (blue), 'Sukcesy (lacznie)' (green), 'Bledy (lacznie)' (red), 'Rezerwacje z Booksy' (purple), 'Aktywne' (emerald). All values must be non-negative integers. Verify 'Ostatnia synchronizacja:' shows a Polish-format timestamp (DD.MM.YYYY GG:MM) or the word 'Nigdy'.
>
> **Test 5 — Reczna synchronizacja:** Click 'Synchronizuj teraz'. Verify: (a) button immediately changes to 'Synchronizuje...' with a spinner and becomes disabled, (b) after completion a toast appears — success format: 'Synchronizacja zakonczona: X nowych, Y bledow', or a Polish error. Special case: if Gmail session expired, toast must say 'Sesja Gmail wygasla. Trwa ponowne laczenie konta...' and page must auto-redirect to Gmail auth after ~1 second. After a successful sync, verify the 'Emaili przetworzonych' counter incremented.
>
> **Test 6 — Opcje synchronizacji:** Verify all 4 configuration controls: (a) text input 'Adres e-mail nadawcy (Booksy)' with default 'noreply@booksy.com' — change the value; (b) dropdown 'Interwal automatycznej synchronizacji' — verify exactly 4 options: Co 5 minut, Co 15 minut, Co 30 minut, Co godzine; (c) switch 'Auto-tworzenie klientow'; (d) switch 'Auto-tworzenie uslug' — when switched OFF, verify amber warning appears: 'Wylaczone — nieznane uslugi spowoduja blad synchronizacji'. After changing any setting, verify a 'Zapisz ustawienia' button appears and a success toast confirms the save.
>
> **Test 7 — Powiadomienia email:** Toggle 'Nowa rezerwacja' switch ON. Verify an email input 'Adres e-mail do powiadomien' appears with placeholder 'salon@example.com'. Enter a valid email. Also toggle 'Anulowanie rezerwacji' ON. Save and verify success toast. Toggle both switches OFF and verify the email input disappears.
>
> **Test 8 — Tabela ostatnich rezerwacji z Booksy:** Scroll to 'Ostatnie rezerwacje z Booksy'. If data exists, verify 6 columns: Data wizyty (date + time), Klient (name in bold + phone below in smaller text), Usluga, Pracownik, Status (colored badge: Zaplanowana / Anulowana / Zakonczona), Cena (X.XX zl). Click 'Odswiez' and verify the table reloads without a full page refresh. If empty, verify Polish text: 'Brak przetworzonych rezerwacji z Booksy'.
>
> **Test 9 — Weryfikacja danych w kalendarzu i liscie klientow po syncu:** After a successful sync (Test 5), navigate to Kalendarz (Calendar). Verify Booksy-imported bookings appear on the correct dates. Click one booking — verify all fields are populated: client name, service name, employee name, date, time, status (nothing should be empty, 'null', or 'undefined'). Then navigate to Klienci (Clients list) and verify auto-created clients appear. Cross-check: the phone number in the Clients list must exactly match what was in the Booksy notification email.
>
> **Test 10 — Sekcja 'Jak to dziala':** Scroll to the very bottom of the page. Verify the 'Jak dziala integracja?' card shows exactly 4 numbered steps in Polish covering: (1) connecting Gmail, (2) automatic sync, (3) supported booking actions (new / reschedule / cancel), (4) data matching logic (by phone number, employee name, service name).
>
> Report all issues: connection failures, sync errors, wrong stat counts, settings not persisting after save, broken table data, calendar or client data mismatches after sync, and any UI text in English that should be in Polish."

---

## Jak Uruchomic

Kazdy scenariusz mozna uruchomic za pomoca skryptu PowerShell analogicznego do `run_auth_test.ps1`.
Wystarczy podmienic zmienna `$prompt` na tresc promptu z wybranego scenariusza.
Zmienne `$appUrl`, `$testEmail` i `$testPass` sa zdefiniowane na gorze skryptu
i PowerShell automatycznie wstawi ich wartosci do prompta przed wyslaniem do Manus AI.
