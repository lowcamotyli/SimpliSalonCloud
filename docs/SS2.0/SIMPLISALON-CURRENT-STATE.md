# SimpliSalon - Current State Design Doc

## Dokument
- Data: 2026-03-12
- Zakres: aktualny stan repozytorium `SimpliSalonCloud`
- Cel: opisac, czym SimpliSalon jest dzisiaj jako produkt i jako system, jakie obszary sa juz wdrozone, jak dziala architektura oraz gdzie sa glówne ryzyka i niedomkniete elementy

## 1. Executive Summary

SimpliSalon jest juz nie "starterem CRM dla salonu", tylko rozbudowanym, wielomodulowym systemem operacyjnym dla salonów beauty i wellness. Repo obejmuje dashboard wielotenantowy, publiczny booking flow, CRM i messaging, payroll, raporty, subskrypcje i billing, integracje z Booksy, ankiety satysfakcji, formularze medyczne i przedzabiegowe oraz automation przez CRON-y.

Najwazniejsza cecha obecnej architektury to polaczenie Next.js App Router + Supabase jako glownej warstwy danych i auth, z dodatkowymi procesami domenowymi realizowanymi w route handlerach i bibliotekach `lib/*`. System ma juz wyrazne cechy produktu produkcyjnego: RLS, RBAC, feature flags, health endpoint, cron jobs, rate limiting, szyfrowanie odpowiedzi formularzy i obsluge platnosci. Jednoczesnie nadal widac dlug techniczny w kilku duzych plikach UI, czesciowym uzyciu `as any`, niespojnosciach dokumentacji i kilku endpointach, które wymagaja dalszego ujednolicenia.

## 2. Czym jest SimpliSalon dzisiaj

SimpliSalon jest SaaS-em do zarzadzania salonem, zorientowanym na:
- operacje front-office: kalendarz, rezerwacje, klienci, uslugi
- operacje back-office: payroll, raporty, ustawienia, billing
- automatyzacje relacji z klientem: CRM, kampanie, automations, survey, SMS/email
- procesy compliance-heavy: formularze przed wizytami, karty zabiegowe, dane zdrowotne, zgody i podpisy
- integracje zewnetrzne: Booksy, Gmail, Przelewy24, SMS, Resend, QStash, Upstash

To nie jest juz monolit "jednej funkcji". Obecny stan repo pokazuje produkt z kilkoma powiazanymi domenami:
- salon operations
- customer lifecycle / CRM
- subscription commerce
- healthcare-like intake forms dla uslug wymagajacych wywiadu i zgody

## 3. Zakres funkcjonalny produktu

### 3.1 Dashboard i wielotenantowosc

Glowne UI dziala pod slugiem salonu: `app/(dashboard)/[slug]/*`.

To implikuje model:
- jeden user nalezy do salonu przez `profiles.salon_id`
- routing jest salon-centric
- layout dashboardu pobiera profil, salon, theme settings i pilnuje zgodnosci sluga z aktualnym salonem uzytkownika

W praktyce system jest zbudowany jako single-tenant UX na tle multi-tenant data modelu.

### 3.2 Obecne moduly widoczne w produkcie

Z nawigacji i tras wynika, ze aktywnie eksponowane sa:
- Dashboard
- Kalendarz
- Rezerwacje
- Uslugi
- Pracownicy
- Klienci
- CRM: kampanie, szablony, automatyzacje, historia wiadomosci
- Payroll
- Raporty
- Billing / subskrypcja / faktury
- Settings: business, CRM, equipment, forms, import, integrations, notifications, SMS, surveys, appearance

To jest juz pelny "operating system" dla salonu, nie tylko booking app.

### 3.3 Publiczne flow klienta

Repo zawiera osobne trasy publiczne:
- `/api/public/services`
- `/api/public/employees`
- `/api/public/availability`
- `/api/public/bookings`
- `/forms/pre/[token]`
- `/forms/fill/[token]`
- `/survey/[token]`

Oznacza to, ze system nie konczy sie na panelu staffu. Klient zewnetrzny:
- rezerwuje termin
- wypelnia formularz przed wizyta
- wypelnia formularz zabiegowy lub medyczny
- po wizycie moze dostac ankiete satysfakcji

## 4. Architektura techniczna

## 4.1 Stack

Repo deklaruje:
- Next.js 16.1.6
- React 18.2
- Supabase SSR i Supabase JS 2.x
- Tailwind + shadcn/ui + Radix
- TanStack Query
- Zod
- Sentry
- Upstash Redis i QStash
- Resend
- Google APIs

## 4.2 Uklad warstw

Architektura jest w praktyce rozbita tak:
- `app/*`: routing, strony, API routes, layouty
- `components/*`: UI i logika prezentacyjna
- `lib/*`: logika domenowa i integracyjna
- `types/*`: runtime types i kontrakty danych
- `supabase/migrations/*`: ewolucja schematu i polityk
- `tests/*`: unit, integration, e2e

Najwazniejsze domeny w `lib/*`:
- `lib/booksy`
- `lib/forms`
- `lib/messaging`
- `lib/payments`
- `lib/middleware`
- `lib/rbac`
- `lib/supabase`
- `lib/equipment`
- `lib/payroll`

## 4.3 Model wykonywania

System jest hybryda:
- SSR / server components dla dashboard layoutow i czesci stron
- client components dla interaktywnych ekranow administracyjnych
- route handlers jako glowne backend API
- cron endpoints na Vercel do zadan asynchronicznych i okresowych
- zewnetrzne kolejki przez QStash dla kampanii CRM

To nie jest klasyczny backend wydzielony do osobnej aplikacji. Logika biznesowa mieszka glównie w route handlerach i bibliotekach wspoldzielonych.

## 5. Warstwa danych i model domenowy

## 5.1 Baza i tenancy

Podstawa systemu to Supabase/Postgres z silnym naciskiem na tenant isolation. Historia migracji pokazuje, ze fundament byl budowany wokol:
- soft deletes
- indeksow krytycznych
- wersjonowania
- RLS helper functions
- osobnych polityk RLS dla salons, clients, bookings, services, employees, settings, profiles, payroll
- custom claims i RBAC
- audit logs

To sugeruje dojrzalszy model security niz w prostym MVP.

## 5.2 Główne domeny danych

Na podstawie migracji i API obecnie istnieja co najmniej nastepujace grupy encji:
- salony i profile uzytkownikow
- pracownicy i ich harmonogramy
- klienci
- uslugi
- rezerwacje
- payroll
- integracje i ustawienia salonu
- subskrypcje, feature flags, invoices, wallet / top-up
- CRM: templates, campaigns, automations, logs, usage
- equipment i equipment bookings
- surveys i reminder flows
- form templates, client forms, pre-appointment responses
- pending emails i sync logs dla Booksy

## 5.3 Feature flags i plany

System ma aktywna warstwe feature gatingu. `lib/middleware/feature-gate.ts` pokazuje, ze dostep do funkcji jest kontrolowany przez:
- plan subskrypcji salonu
- rekordy `feature_flags`
- status subskrypcji
- ewentualne wygasniecia funkcji

Przyklady feature flags:
- `booksy_integration`
- `sms_notifications`
- `crm_sms`
- `crm_campaigns`
- `crm_automations`
- `advanced_analytics`
- `api_access`

To jest wazne architektonicznie: SimpliSalon nie jest tylko appka z billingiem, tylko system, w którym billing steruje realna dostepnoscia funkcji.

## 6. Auth, RBAC i kontrola dostepu

## 6.1 Auth

Podstawowym mechanizmem uwierzytelnienia jest Supabase Auth. Repo zawiera:
- login
- signup
- invite
- callback Google

Dashboard layout twardo wymaga sesji, a proxy obsluguje redirecty dla tras chronionych.

## 6.2 RBAC

Warstwa uprawnien ma dwa poziomy:
- claims i role na userze
- RLS po stronie bazy

Sidebar ukrywa moduly wedlug permissionów, m.in.:
- `employees:manage`
- `clients:manage`
- `finance:view`
- `reports:view`
- `settings:view`

Middleware/proxy dodatkowo chroni wybrane sciezki po regexach. To nie jest idealne jako jedyna warstwa autoryzacji, ale w polaczeniu z layoutami server-side i RLS daje sensowny model defence in depth.

## 6.3 Aktualny stan

W repo widac, ze czesc dawnych problemów z review zostala juz zaadresowana:
- `proxy.ts` uzywa `settings:view`, nie starego `settings:manage`
- `/api/integrations` korzysta z `getAuthContext()` i juz nie jest anonimowe
- powstal wspólny helper `lib/supabase/get-auth-context.ts`

To znaczy, ze review docs z marca 2026 sa czesciowo historyczne i nie zawsze odzwierciedlaja obecny stan kodu.

## 7. Rezerwacje, kalendarz i availability

## 7.1 Rezerwacje wewnetrzne

`app/api/bookings/route.ts` jest jednym z centralnych endpointow systemu. Obsluguje:
- listowanie rezerwacji z filtrami
- tworzenie nowych wizyt
- automatyczne wyszukiwanie lub tworzenie klienta
- sprawdzanie blacklisty klienta
- walidacje przez Zod
- sprawdzanie dostepnosci sprzetu
- zapis atomowy przez RPC `create_booking_atomic`
- asynchroniczna wysylke formularzy po utworzeniu rezerwacji

To jest jedna z najwazniejszych osi systemu i juz teraz ma cechy "production-grade":
- rate limit
- centralna obsluga bledow
- atomowosc w DB
- logowanie wolnych operacji

## 7.2 Public booking

Publiczny booking endpoint:
- dziala z API key
- ma rate limiting
- omija RLS przez admin client, ale kompensuje to walidacja i waskim kontraktem
- tworzy klienta i rezerwacje oraz uwzglednia zaleznosci od uslug, pracownika i sprzetu

To daje realna warstwe integracyjna dla strony WWW albo widgetu rezerwacyjnego.

## 7.3 Equipment awareness

Migracje `equipment_v1/v2/v3` oraz endpointy `api/equipment/*` i powiazania `services/[id]/equipment` pokazuja, ze system uwzglednia ograniczenia zasobowe nie tylko na poziomie pracownika, ale tez urzadzen.

To jest mocny sygnal, ze architektura jest budowana pod realne operacje salonu, nie tylko "sloty w kalendarzu".

## 8. CRM, messaging i lifecycle automation

## 8.1 CRM jako osobna domena

CRM ma osobne API i UI:
- kampanie
- szablony
- automatyzacje
- logi
- segmenty
- usage
- quick-send

To juz nie jest prosty "send SMS". Repo implementuje spójny subsystem marketingowo-operacyjny.

## 8.2 Kampanie i background processing

`lib/messaging/campaign-processor.ts` realizuje:
- segmentacje odbiorcow
- budowanie jobów per klient i kanal
- enqueue do QStash
- worker processing
- renderowanie szablonow
- zapis `message_logs`
- liczenie usage i statusów kampanii

Architektonicznie to jest najblizsze osobnemu mini-systemowi kolejkowemu uruchamianemu z route handlerów.

## 8.3 SMS / email

Repo zawiera:
- sendery SMS i email
- webhook SMSAPI
- webhook Resend
- podglad logow notyfikacji
- test endpoint dla konfiguracji SMS

Warto zaznaczyc, ze nie wszystkie endpointy sa jeszcze idealnie "production-clean". W kodzie nadal pojawia sie miejscami `console.*`, testowe flow i casty `as any`.

## 8.4 Surveys i reminders

System ma dwa mocne lifecycle flow:
- ankiety satysfakcji po wizycie
- formularze przed wizyta

CRON `pre-appointment-forms`:
- znajduje jutrzejsze wizyty w oknie czasowym
- sprawdza feature i notification settings
- generuje token formularza
- zapisuje rekord odpowiedzi
- wysyla SMS z linkiem
- oznacza booking jako `pre_form_sent`

CRON `surveys`:
- znajduje zakonczone wizyty z odpowiednim opoznieniem
- sprawdza settings i feature flags
- uwzglednia `survey_enabled` na poziomie uslugi
- tworzy survey row z tokenem
- wysyla SMS z linkiem
- oznacza booking jako `survey_sent`

To jest bardzo konkretna przewaga funkcjonalna produktu: SimpliSalon automatyzuje kontakt przed i po usludze.

## 9. Formularze, dane medyczne i compliance

## 9.1 System formularzy

Obecny system formularzy obejmuje:
- szablony salonowe w `form_templates`
- publiczne odczyty po tokenie
- submit po tokenie
- przypisywanie formularzy do uslug
- import artefaktow i built-in templates
- formularze pre-appointment
- formularze klienta powiazane z bookingiem

Model typow `types/forms.ts` przewiduje:
- pola dynamiczne
- `conditionalShowIf`
- `data_category`
- podpis
- zgody GDPR

## 9.2 Ochrona danych zdrowotnych

Ten obszar jest juz potraktowany bardzo serio i stanowi jeden z bardziej dojrzalych fragmentow systemu:
- odpowiedzi formularzy sa szyfrowane aplikacyjnie AES-256-GCM
- tokeny publiczne sa weryfikowane po stronie serwera
- dla `health` i `sensitive_health` wymagane jest jawne `health_consent`
- submit zapisuje `health_consent_at`
- podpis moze byc zapisany do storage
- odczyt formularza publicznego rozwiazuje dynamiczny tekst GDPR z danymi salonu

To pokazuje, ze SimpliSalon wszedl juz w obszar medyczno-zabiegowy, gdzie compliance nie jest dodatkiem, tylko integralna czescia produktu.

## 9.3 Built-in templates i import kart zabiegowych

Najwiekszy plik repo, `lib/forms/builtin-templates.ts`, jest de facto statyczna baza formularzy osadzona w kodzie:
- eksportuje ogromna tablice `BUILTIN_TEMPLATES`
- zawiera setki gotowych kart i formularzy
- ma skale ~264k linii

To rozwiazuje problem bootstrapu produktu i gotowych szablonow, ale tworzy koszt architektoniczny:
- duzy rozmiar kodu
- trudny diff i review
- kazda zmiana wymaga redeployu
- repo miesza dane referencyjne z kodem aplikacji

## 9.4 Stan backlogu importu kart zabiegowych

W `docs/backlog/treatment-cards-import` widac, ze pipeline importowy jest w zaawansowanym stanie.

Na dzisiaj:
- taski 00-06 sa opisane jako DONE
- task 07 `write-to-builtin-templates` jest TODO
- task 08 `conditional fields in renderer` jest TODO
- task 09 `tests and cutover` jest TODO

Dodatkowo powstal juz UI review/importu z compliance gates:
- lista artefaktow
- preview pol
- klasyfikacja health/sensitive_health
- review checklist
- blokady importu dla kart niezatwierdzonych

To znaczy, ze SimpliSalon ma juz warstwe operacyjnego review dla bardzo wrazliwych formularzy, ale finalny cutover tego pipeline'u nie jest jeszcze domkniety.

## 10. Integracje zewnetrzne

## 10.1 Booksy

Booksy jest duzym subsystemem, nie tylko pojedynczym webhookiem.

Repo zawiera:
- auth / connect / disconnect
- sync
- pending emails
- logs
- stats
- webhook
- cron
- parser emaili Gmail/Booksy
- procesor synchronizujacy rezerwacje

`lib/booksy/processor.ts`:
- parsuje maile Booksy
- mapuje klienta, usluge, pracownika, termin
- tworzy lub aktualizuje booking
- odklada problematyczne przypadki do `booksy_pending_emails`

Najwieksze ryzyko architektoniczne tego obszaru to kruchosc parsera zalezonego od formatu emaili Booksy.

## 10.2 Przelewy24 i billing

Billing jest juz realnym subsystemem:
- subskrypcje
- upgrade
- cancel
- invoices
- wallet / top-up SMS
- webhook platnosci

`lib/payments/subscription-manager.ts` realizuje:
- tworzenie i zmiany subskrypcji
- aktywacje feature flag po sukcesie platnosci
- obsluge transakcji przez Przelewy24
- wystawianie rekordow faktur

Webhook Przelewy24:
- pobiera konfiguracje per salon
- rozpoznaje subskrypcje albo invoice po `sessionId`
- weryfikuje merchant, signature i transaction verification
- aktualizuje status invoice lub odpala `handlePaymentSuccess`

To jest dosc dojrzaly fundament billingowy jak na produkt tej klasy.

## 10.3 Gmail / Google

Repo zawiera callback Gmail i zaleznosci `googleapis`. Na podstawie struktury widac, ze Gmail jest uzywany glównie jako element przeplywu integracyjnego z Booksy, a nie jako osobny modul user-facing.

## 11. Operacje i niezawodnosc

## 11.1 Cron jobs

`vercel.json` definiuje harmonogramy dla:
- Booksy sync
- process-subscriptions
- check-trial-expirations
- send-usage-reports
- crm-automations
- billing-dunning
- reminders
- blacklist-scoring
- surveys
- pre-appointment-forms

To oznacza, ze znaczna czesc produktu dziala eventowo i okresowo, nie tylko request-response.

## 11.2 Health endpoint i observability

`/api/health`:
- sprawdza baze
- opcjonalnie sprawdza Redis
- zwraca `healthy`, `degraded` albo `unhealthy`
- zwraca uptime i response time

Next config i repo sa przygotowane pod Sentry, a produkcyjna konfiguracja zalezy od env i Vercel environment.

## 11.3 Rate limiting

Aktualny stan kodu jest lepszy niz wynikaloby z review docs:
- `lib/middleware/rate-limit.ts` ma juz sciezke Upstash
- istnieje `lib/redis.ts`
- jest fallback in-memory dla dev/CI bez env

To nie znaczy, ze temat jest zamkniety. Nadal trzeba pilnowac, czy wszystkie krytyczne endpointy sa rzeczywiscie osloniete i czy limity sa sensownie dobrane per domena.

## 12. UI i front-end architecture

## 12.1 Layout

Root layout:
- waliduje env przy starcie
- odpala `QueryProvider`
- instaluje `sonner` toaster

Dashboard layout:
- weryfikuje auth
- pobiera profil i salon
- laduje theme settings
- renderuje sidebar, navbar i `DunningBanner`

To daje sensowny shell aplikacji, ale wiele ekranow jest nadal duzymi client-side plikami.

## 12.2 Główne obszary dlugu UI

Review i line counts wskazuja szczegolnie na:
- `app/(dashboard)/[slug]/settings/import/page.tsx`
- `app/(dashboard)/[slug]/settings/forms/page.tsx`
- `components/calendar/booking-dialog.tsx`
- `components/forms/form-preview-dialog.tsx`

Najwiekszy problem nie brzmi "UI nie istnieje", tylko:
- UI istnieje i jest funkcjonalne
- ale czesc ekranow jest za duza, zbyt gesta i trudniejsza w utrzymaniu

## 13. Testy i gotowosc inzynierska

## 13.1 Obecne pokrycie

Repo ma:
- testy unit
- testy integration
- testy e2e Playwright

Pokryte obszary to m.in.:
- middleware CORS
- error handler
- validators
- RBAC
- payroll security
- Booksy webhook i idempotencja
- employee link API
- RLS isolation
- SMS settings API
- SMS webhook
- parser/import forms
- subscription manager payment success
- krytyczne flow UI i middleware

To jest dobry sygnal, bo testowane sa nie tylko utils, ale tez obszary infrastrukturalne i security-sensitive.

## 13.2 Ograniczenia

Mimo tego dalej widac techniczne obszary do poprawy:
- duzo `as any` w kodzie API
- czesc dokumentacji jest juz niezsynchronizowana z kodem
- review docs wskazuja problemy, z których czesc jest juz poprawiona, a czesc moze byc nadal otwarta
- nie wszystkie duze moduly sa jeszcze rozbite na mniejsze komponenty

## 14. Najwazniejsze mocne strony obecnego stanu

- Produkt ma szeroki i realny zakres domenowy, duzo szerszy niz typowe MVP salonowe.
- Multi-tenant i security byly adresowane systemowo, a nie kosmetycznie.
- Booking logic uwzglednia klienta, pracownika, sprzet i automatyczne follow-upy.
- Billing i feature gating sa zintegrowane z produktem, a nie dopiete "obok".
- CRM ma juz kolejki, usage tracking i background processing.
- System formularzy jest zaawansowany i wspiera dane zdrowotne z szyfrowaniem i zgoda.
- Produkt ma health checks, cron jobs i testy obejmujace wazne sciezki.

## 15. Najwazniejsze slabe strony i ryzyka

- `BUILTIN_TEMPLATES` jako gigantyczny plik danych w kodzie to istotny koszt architektoniczny.
- Booksy integration jest funkcjonalna, ale zalezy od kruchego parsera emaili.
- Czesc UI i route handlers jest zbyt duza i za malo modularna.
- Nadal wystepuja casty `as any`, co sygnalizuje niedomknieta synchronizacje typow z baza.
- Dokumentacja repo nie jest w pelni zgodna z aktualnym stanem kodu; README i czesc docs sa w tyle.
- Formularze medyczne sa juz mocne compliance-wise, ale rollout importu wszystkich kart zabiegowych nie jest jeszcze domkniety.
- System ma sporo logiki w route handlers, co przy dalszym wzroscie domen moze utrudniac utrzymanie bez wyrazniejszego service-layer.

## 16. Ship Readiness - ocena realna

Dla podstawowego dzialania salonu system wyglada na zdolny do pracy:
- auth
- dashboard
- bookings
- clients
- employees
- services
- payroll
- reports
- billing
- surveys
- forms
- settings

Dla bardziej wrazliwych lub kosztownych obszarow status jest "produkcyjny, ale wymaga dyscypliny":
- Booksy
- payments
- CRM automations i kampanie
- medical / treatment forms

Te obszary juz dzialaja, ale sa na tyle krytyczne, ze potrzebuja stalej walidacji: typy, retry semantics, idempotencja, monitoring, audyt i review zmian.

## 17. Najwazniejsze rekomendacje na kolejny etap

### Architektura
- Rozbic najwieksze strony i komponenty UI, zaczynajac od `settings/import`, `settings/forms`, `booking-dialog`, `form-preview-dialog`.
- Ograniczyc logike domenowa bezposrednio w route handlerach przez wyrazniejsze warstwy service/use-case.
- Wyprowadzic built-in templates z jednego gigantycznego pliku do bardziej operowalnego formatu artefaktowego lub magazynu danych.

### Data i typy
- Zregenerowac typy Supabase i systematycznie redukowac `as any`.
- Utrzymywac docs i review notes w synchronizacji z rzeczywistym stanem repo.

### Produkt
- Domknac taski 07-09 dla treatment-card import pipeline.
- Dopiac renderer conditional fields i finalny cutover review -> builtin/import.
- Zweryfikowac, czy wszystkie publiczne i finansowe endpointy maja spójne guardy, limity i structured logging.

### Operacje
- Utrzymywac monitoring dla health, webhooków, cronów i kampanii.
- Dopiac jednoznaczny "ship/no-ship gate" dla zmian dotykajacych auth, payments, permissions, forms i migrations.

## 18. Podsumowanie

SimpliSalon jest obecnie zaawansowanym systemem SaaS dla salonów, zbudowanym wokol wielotenantowego dashboardu i zestawu wyspecjalizowanych subsystemów: booking, CRM, billing, forms, surveys, integrations i compliance. To repo prezentuje juz realna platforme produktowa, a nie proof-of-concept.

Najwieksza wartosc obecnego stanu to szerokosc domeny i to, ze najtrudniejsze obszary biznesowe zostaly juz podjete: automatyzacje, platnosci, integracje i dane zdrowotne. Najwieksze wyzwania na teraz to porzadkowanie architektury, domkniecie pipeline'u importu kart zabiegowych, redukcja dlugu typowego dla szybko rosnacego systemu oraz utrzymanie wysokiej jakosci w najbardziej wrazliwych sciezkach.
