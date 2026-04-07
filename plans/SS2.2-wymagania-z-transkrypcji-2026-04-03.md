# SS2.2 - wymagania z transkrypcji 2026-04-03

## Cel
Przełożyć rozmowę z pliku `SimpliSalon ulepszenia 01.04.vtt` na listę wymagań i zadań wdrożeniowych dla bieżącego stanu kodu SS2.2.

Ten dokument ma służyć Claude'owi jako materiał do planowania wdrożenia, a nie jako finalna specyfikacja techniczna. Zawiera:
- wyciąg wymagań biznesowych,
- ocenę obecnego stanu w repo,
- backlog wdrożeniowy,
- pytania otwarte do doprecyzowania przed implementacją.

## Źródła
- `SimpliSalon ulepszenia 01.04.vtt`
- `SimpliSalon ulepszenia 01.04.md`
- bieżący kod SS2.2 w repo
- `sprints/SS2.2/README.md`

## Executive Summary
Najważniejsze potrzeby z rozmowy nie dotyczą jednego feature'a, tylko kilku obszarów produktu:
- płatności i przedpłaty,
- ergonomia tworzenia i edycji wizyt,
- przypisywanie usług do pracowników i sprzętu,
- zarządzanie usługami i dodatkami,
- komunikacja i marketing,
- treści publiczne dla klienta: opis usługi, regulamin, portfolio.

W obecnym SS2.2 część fundamentów już istnieje:
- są wdrożone cron-y dla ankiet i formularzy przed wizytą z kanałami `sms | email | both`,
- jest UI ustawień powiadomień,
- istnieje checkout/history pod Przelewy24,
- istnieje walidacja employee-service w API bookingów,
- istnieją CRM, blacklista, kampanie i automatyzacje,
- istnieją dodatki do usług w planie SS2.2,
- istnieją formularze, treatment plans i payment history.

Z rozmowy wynika jednak, że z perspektywy użytkownika największy ból nie jest w "czy feature istnieje", tylko:
- czy jest łatwy do użycia przez recepcję,
- czy da się nim szybko pracować przy dużym obłożeniu,
- czy flow przypomina praktykę salonową zamiast modelu "idealnego",
- czy system wspiera wyjątki i sytuacje niestandardowe.

## Stan obecny SS2.2

### Już wygląda na wdrożone lub częściowo wdrożone
1. Ankiety po wizycie:
   - typy ustawień mają `surveys.channel`,
   - strona powiadomień ma radio `SMS / Email / SMS + Email`,
   - cron `app/api/cron/surveys/route.ts` wysyła SMS i email.
2. Formularze przed wizytą:
   - typy ustawień mają `preAppointmentForms.channel`,
   - strona powiadomień ma radio `SMS / Email / SMS + Email`,
   - cron `app/api/cron/pre-appointment-forms/route.ts` wysyła SMS i email.
3. Employee-service assignment:
   - `app/api/bookings/route.ts` waliduje `employee_services`,
   - w sprintach SS2.2 ten temat jest już prowadzony jako osobny obszar.
4. Przelewy24:
   - są endpointy `app/api/payments/booking/initiate/route.ts`,
   - `app/api/payments/booking/history/route.ts`,
   - `app/(dashboard)/[slug]/payments/page.tsx`,
   - ustawienia P24 są w typach ustawień salonu.
5. CRM / komunikacja:
   - są kampanie, automatyzacje, quick send, logs,
   - w schemacie klientów istnieją `tags`,
   - istnieje `blacklist_status`.
6. Vouchery:
   - jest `app/(dashboard)/[slug]/settings/vouchers/page.tsx`,
   - w migracjach i planach release przewija się `voucher` jako metoda płatności.

### Częściowo istnieje, ale rozmowa wskazuje na brak domknięcia UX
1. Konflikty przy bookingu:
   - system wykrywa konflikty,
   - użytkownik oczekuje trybu "zapisz mimo konfliktu" z jawnym potwierdzeniem.
2. Sprzęt:
   - logika sprzętu istnieje,
   - użytkownik chce lepszej widoczności i prostszego modelu pracy w UI.
3. Dodatki:
   - dodatki są już rozwijane w SS2.2,
   - brakuje ergonomii masowego przypisywania i użycia z poziomu wizyty.
4. Płatności:
   - istnieje checkout online,
   - brakuje modelu przedpłat i salda klienta opisanego w rozmowie.

### Wygląda na brak lub brak potwierdzenia w repo
1. Opisy usług widoczne dla klienta i w panelu.
2. Zdjęcia / portfolio przypięte do usług.
3. Regulamin salonu akceptowany przez klienta przy rezerwacji.
4. Premium hours / marketingowe wyjątki poza standardowymi godzinami pracy.
5. Masowe akcje na usługach.
6. Edycja istniejącej wizyty przez dodanie kolejnej usługi lub kolejnego pracownika do już zapisanej wizyty.
7. Saldo klienta z przedpłatami niezależne od konkretnej wizyty.

## Wymagania biznesowe wyciągnięte z rozmowy

### A. Płatności i przedpłaty
1. Płatności online mają iść bezpośrednio do salonu, bez pośrednictwa SimpliSalon w przepływie środków.
2. Potrzebny jest prosty flow wysłania klientowi linku do płatności za wizytę lub przedpłatę.
3. System powinien wspierać:
   - całą kwotę,
   - przedpłatę częściową,
   - zwrot,
   - ponowne użycie niewykorzystanej przedpłaty.
4. Kluczowa potrzeba z rozmowy:
   - przedpłata ma być przypisana do klienta jako saldo,
   - nie tylko do jednej konkretnej wizyty,
   - bo zakres usługi może się zmienić w trakcie lub przed wizytą.
5. Użytkownik potrzebuje widoczności, że klient ma na koncie np. `20 zł` do wykorzystania przy kolejnej wizycie.

### B. Booking flow i edycja wizyty
1. Przy konflikcie system powinien pokazać dokładny komunikat, ale opcjonalnie pozwolić zapisać wizytę po świadomym potwierdzeniu.
2. Potwierdzenie konfliktu powinno być jawne:
   - checkbox,
   - albo dialog z komunikatem typu `Akceptuję kolizję`.
3. Użytkownik chce szybciej pracować na przybliżonych czasach, a dopiero potem skorygować booking.
4. W edycji istniejącej wizyty potrzebna jest możliwość:
   - zmiany usługi,
   - dodania kolejnej usługi,
   - dodania dodatku,
   - przypisania innego pracownika do dodatkowej pozycji,
   - traktowania tego jako rozszerzenie multi-bookingu, nie jako ręczne obejścia.
5. System ma wspierać realny scenariusz salonowy:
   - klient przychodzi na jedną usługę,
   - w trakcie dochodzi kolejna usługa lub dopłata,
   - inny pracownik wykonuje część pracy,
   - prowizja i rozliczenie muszą dać się potem odtworzyć.

### C. Usługi, pracownicy, dodatki
1. Usługi muszą być przypisywane do konkretnych pracowników.
2. Po wyborze usługi system ma filtrować pracowników do tych, którzy ją wykonują.
3. W tworzeniu wizyty i dostępności nie powinny wyświetlać się "wszystkie usługi wszystkich", jeśli wybrano pracownika lub usługę.
4. Potrzebne są masowe akcje na usługach:
   - aktywuj/dezaktywuj,
   - przypisz dodatki,
   - inne wspólne operacje.
5. Dodatki powinny być zarządzane jako osobna baza, a następnie przypisywane hurtowo do wybranych usług.
6. Obecny model "wchodzę w każdą usługę osobno" jest zbyt wolny przy dużym katalogu usług.

### D. Sprzęt i stanowiska
1. Sprzęt ma być powiązany z usługą w sposób, który nie wymaga ręcznego ustawiania osobnych grafików dla każdego stanowiska.
2. Użytkownik nie chce modelu, w którym klient "rezerwuje sprzęt" zamiast usługi.
3. System powinien pilnować konfliktów sprzętu automatycznie.
4. Przeniesienie lub edycja wizyty powinny przenosić rezerwację sprzętu razem z usługą.
5. W podglądzie/edycji wizyty powinno być widać, jaki sprzęt / stanowisko zostało przypisane.
6. Dla większych salonów ta informacja ma znaczenie operacyjne i wzrokowe.

### E. Publiczna oferta salonu
1. Usługa powinna mieć opis, który klient może przeczytać przed rezerwacją.
2. Opis ma ograniczać nieporozumienia i obawy klienta.
3. Do usług powinno dać się dodać zdjęcia pracy / portfolio.
4. Klient rezerwujący ma widzieć, jak wygląda efekt lub charakter usługi.

### F. Regulamin salonu
1. Salon powinien móc wkleić lub zdefiniować własny regulamin.
2. Regulamin ma być widoczny dla klienta podczas rezerwacji.
3. Rezerwacja powinna mieć opcję potwierdzenia akceptacji regulaminu.
4. To ma działać per salon, nie globalnie.

### G. Marketing, segmentacja, premium hours
1. Użytkownik chce segmentować klientów kategoriami/tagami:
   - stały klient,
   - VIP,
   - wymagający,
   - inne własne tagi.
2. Na tej bazie chce kierować komunikację i oferty.
3. Potrzebne są specjalne godziny premium poza standardowymi godzinami otwarcia:
   - np. dodatkowe sloty,
   - tylko dla wybranych usług,
   - z pełną płatnością lub dopłatą,
   - jako wyjątek, a nie zmiana całych godzin pracy.
4. Rozmowa sugeruje osobną zakładkę lub moduł marketingowy dla:
   - promocji,
   - godzin premium,
   - ofert do segmentów klientów.

### H. Onboarding i ergonomia
1. Nowy pracownik powinien móc szybciej zrozumieć system.
2. Rozmowa wprost wskazuje potrzebę tutoriali.
3. Interfejs powinien dawać szybsze skróty w kalendarzu i szybsze przejścia do najczęstszych działań.

## Proponowana ocena priorytetów

### P0 - najwyższy priorytet operacyjny
1. Konflikt bookingu z opcją świadomego override.
2. Edycja wizyty: zmiana usługi / dodanie usługi / dodanie dodatku.
3. Saldo klienta z przedpłat.
4. Domknięcie sprzętu w UI:
   - widoczność przypisanego sprzętu,
   - brak ręcznego chaosu przy stanowiskach.

### P1 - mocny wpływ na sprzedaż i samoobsługę klienta
1. Opisy usług.
2. Regulamin salonu z akceptacją.
3. Zdjęcia / portfolio usług.
4. Link do płatności / przedpłaty z panelu recepcji.

### P2 - wzrost i marketing
1. Segmentacja klientów tagami.
2. Godziny premium / marketingowe wyjątki.
3. Masowe akcje na usługach i dodatkach.
4. Tutoriale i szybkie skróty UX.

## Backlog wdrożeniowy w kontekście obecnego kodu

### 1. Booking conflict override
Status:
- konflikt jest wykrywany,
- brak potwierdzonego trybu zapisu mimo konfliktu.

Zakres:
- dodać `override conflict` w UI tworzenia/edycji wizyty,
- rozróżnić konflikty:
  - pracownik,
  - sprzęt,
  - czas,
- w backendzie dopuścić zapis tylko po jawnym fladze override tam, gdzie biznesowo ma to być możliwe.

Miejsca do weryfikacji:
- `components/calendar/booking-dialog.tsx`
- `app/(dashboard)/[slug]/calendar/booking-dialog.tsx`
- `app/api/bookings/route.ts`

### 2. Rozszerzona edycja wizyty
Status:
- multi-booking istnieje,
- ale rozmowa wskazuje brak ergonomicznej edycji już istniejącej wizyty.

Zakres:
- dodać w edycji wizyty możliwość:
  - zmiany usługi,
  - dodania kolejnej usługi,
  - dodania dodatku,
  - wskazania pracownika dla nowej pozycji,
  - przeliczenia ceny i czasu po zmianach.

Ryzyko:
- rozjazd między pojedynczym bookingiem, group bookingiem i payment history.

Miejsca do weryfikacji:
- `components/calendar/booking-dialog.tsx`
- `app/api/bookings/group/route.ts`
- `app/api/bookings/[id]/route.ts`

### 3. Saldo klienta i przedpłaty
Status:
- checkout P24 istnieje,
- booking payments istnieją,
- brak jawnego modelu "client balance".

Zakres:
- zaprojektować saldo przedpłat per klient,
- pozwolić:
  - dopisać przedpłatę,
  - rozliczyć ją przy kolejnej wizycie,
  - pokazać historię użycia,
  - obsłużyć częściowe wykorzystanie i zwrot.

Prawdopodobnie wymaga:
- nowej tabeli lub rozszerzenia obecnego modelu płatności,
- decyzji czy saldo jest:
  - księgowe,
  - czy tylko operacyjne.

Miejsca do weryfikacji:
- `app/api/payments/booking/initiate/route.ts`
- `app/api/payments/booking/history/route.ts`
- `app/(dashboard)/[slug]/payments/page.tsx`
- migracje `booking_payments`

### 4. Sprzęt w widoku wizyty
Status:
- konflikt sprzętu jest sprawdzany,
- rozmowa wskazuje brak dobrej ekspozycji sprzętu w UI.

Zakres:
- pokazać przypisany sprzęt/stanowisko:
  - w hover card,
  - w dialogu edycji,
  - opcjonalnie na kaflu wizyty.
- sprawdzić, czy przenoszenie wizyty zawsze aktualizuje rezerwację sprzętu razem z bookingiem.

Miejsca do weryfikacji:
- `components/calendar/booking-card.tsx`
- `components/calendar/booking-dialog.tsx`
- `lib/equipment/availability*`

### 5. Opisy usług
Status:
- brak potwierdzenia w UI i publicznym flow.

Zakres:
- dodać pole `description` w usługach tam, gdzie jeszcze nie jest obsłużone end-to-end,
- pokazać opis:
  - w panelu,
  - na publicznej stronie rezerwacji,
  - opcjonalnie w szczegółach usługi.

Miejsca do weryfikacji:
- `app/api/services*`
- strony i komponenty usług
- public booking flow

### 6. Zdjęcia / portfolio usług
Status:
- brak śladów gotowego feature'a.

Zakres:
- model danych dla galerii usług,
- upload i podgląd miniatur,
- pokazanie zdjęć w publicznym booking flow.

Prawdopodobnie wymaga:
- storage bucket,
- polityk dostępu,
- kompresji / limitów.

### 7. Regulamin salonu
Status:
- brak potwierdzonego pola i akceptacji w flow rezerwacji.

Zakres:
- dodać pole regulaminu lub URL regulaminu w settings business,
- pokazać regulamin w public booking flow,
- dodać checkbox akceptacji,
- zapisać fakt akceptacji przy rezerwacji.

Miejsca do weryfikacji:
- `app/(dashboard)/[slug]/settings/business/page.tsx`
- `app/api/settings/route.ts`
- `app/api/public/bookings/route.ts`

### 8. Segmentacja klientów tagami
Status:
- w schemacie danych są `tags`,
- z rozmowy wynika potrzeba realnego użycia biznesowego.

Zakres:
- dodać wygodne UI do tagowania klientów,
- filtrowanie listy klientów po tagach,
- wykorzystanie tagów w kampaniach CRM i segment preview.

Miejsca do weryfikacji:
- `app/(dashboard)/[slug]/clients/page.tsx`
- `app/api/clients/route.ts`
- `app/api/crm/segments/preview/route.ts`
- `app/api/crm/campaigns*`

### 9. Premium hours / wyjątki marketingowe
Status:
- brak dedykowanego feature'a,
- istnieją zwykłe godziny pracy i wyjątki grafiku.

Zakres:
- zdecydować, czy to ma być:
  - wyjątek w godzinach otwarcia,
  - osobny typ availability rule,
  - osobny typ oferty marketingowej.
- ograniczyć dostępność takich slotów do wskazanych usług.
- dodać komunikat o wyższej cenie lub pełnej przedpłacie.

### 10. Masowe akcje na usługach i dodatkach
Status:
- rozmowa wskazuje silny ból operacyjny,
- feature add-ons jest już w SS2.2, ale UX masowy wygląda na brakujący.

Zakres:
- checkbox selection w liście usług,
- bulk actions:
  - aktywuj/dezaktywuj,
  - przypisz dodatek,
  - usuń przypisanie dodatku.

## Otwarte pytania do doprecyzowania przed planem implementacji
1. Czy override konfliktu ma dotyczyć tylko panelu wewnętrznego, czy też public booking flow nigdy nie może z niego korzystać?
2. Czy saldo klienta ma być rzeczywistym modułem finansowym, czy tylko uproszczonym kredytem do wykorzystania?
3. Czy regulamin ma być:
   - treścią HTML/markdown,
   - plain text,
   - czy tylko linkiem do zewnętrznej strony?
4. Czy zdjęcia usług mają być pojedynczym coverem czy pełną galerią?
5. Czy premium hours mają być:
   - per salon,
   - per pracownik,
   - per usługa,
   - per kampania?
6. Czy tagi klientów mają być tylko wolnymi etykietami, czy też mieć predefiniowane typy?
7. Czy dodatki w edycji wizyty mają być rozliczane jako:
   - osobne pozycje,
   - czy tylko dopłata do bazowej usługi?
8. Czy sprzęt ma być zawsze wybierany automatycznie, czy recepcja ma mieć możliwość ręcznego nadpisania przypisania?

## Proponowana kolejność planowania dla Claude'a
1. Potwierdzić z biznesem zakres P0:
   - conflict override,
   - edycja wizyty,
   - saldo klienta,
   - widoczność sprzętu.
2. Rozdzielić tematy na:
   - szybkie UX wins,
   - zmiany modelu danych,
   - większe moduły.
3. Dla tematów danych i płatności przygotować osobne ADR-y lub mini-speci:
   - client balance,
   - regulamin acceptance,
   - service media.
4. Potem rozpisać wdrożenie na sprinty lub paczki:
   - Booking UX,
   - Payments & Deposits,
   - Service Catalog UX,
   - Public Booking Content,
   - CRM Segmentation.

## Szybki podział na paczki wdrożeniowe

### Paczka A - Booking UX
- conflict override,
- zmiana usługi w istniejącej wizycie,
- dodanie dodatkowej usługi do istniejącej wizyty,
- wyświetlanie sprzętu przy wizycie.

### Paczka B - Payments & Deposits
- dopłaty i przedpłaty,
- saldo klienta,
- wygodny link do płatności z recepcji,
- wykorzystanie salda przy finalizacji wizyty.

### Paczka C - Services & Add-ons UX
- masowe akcje na usługach,
- hurtowe przypisywanie dodatków,
- opisy usług,
- zdjęcia usług.

### Paczka D - Public Booking Trust Layer
- regulamin salonu,
- akceptacja regulaminu,
- lepsza prezentacja opisów i zdjęć.

### Paczka E - CRM & Marketing
- tagi klientów,
- segmentacja,
- premium hours / wyjątki marketingowe,
- kampanie do wybranych segmentów.

## Uwagi końcowe
- Rozmowa mieszała trzy typy potrzeb:
  - rzeczy już częściowo gotowe,
  - realne bugi/UX gaps,
  - pomysły rozwojowe.
- Przed rozpoczęciem implementacji warto oznaczyć każdy temat jako:
  - `already in progress`,
  - `needs polish`,
  - `new feature`.
- Największa wartość biznesowa wydaje się obecnie w dwóch osiach:
  - szybsza obsługa recepcji przy edycji wizyt,
  - lepsze rozliczanie płatności/przedpłat bez chaosu operacyjnego.
