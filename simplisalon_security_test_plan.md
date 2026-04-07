# SimpliSalon Security Test Plan v2

## 1. Cel i zasady wykonania
Celem jest wykrycie podatnosci, ktore realnie umozliwiaja:
- wyciek danych miedzy salonami,
- przejecie konta,
- naduzycia biznesowe,
- eskalacje uprawnien,
- obejscie rozliczen,
- trwale uszkodzenie danych.

Zakres obejmuje:
- Next.js App Router: API routes, Server Actions, Middleware, Edge handlers, cron jobs,
- Supabase: Auth, Postgres, RLS, RPC, views, funkcje `SECURITY DEFINER`, triggery, Storage,
- konfiguracje produkcyjna: cookies, naglowki, sekrety, integracje.

Tryb pracy:
- [ ] Kazdy test konczy sie statusem: `PASS`, `FAIL`, `UNKNOWN`.
- [ ] Brak dowodu = `UNKNOWN`.
- [ ] Kazdy `FAIL` musi miec dowod, ryzyko, kroki reprodukcji i proponowana poprawke.
- [ ] Priorytet nadajemy wg skali `P0-P3`.

## 2. Skala priorytetow
- `P0`: natychmiastowy risk, np. cross-tenant leak, auth bypass, service role exposure, RCE, SQLi.
- `P1`: wysoki risk, np. IDOR w tenant scope, CSRF na krytycznych akcjach, brak walidacji webhook.
- `P2`: sredni risk, np. brak rate limiting, slabe logowanie audytowe, zbyt szerokie signed URLs.
- `P3`: niski risk, np. hardening, brakujace naglowki o niskim wplywie, porzadki w dependencies.

## 3. Preflight i inwentarz powierzchni ataku
- [ ] Zmapuj wszystkie entrypointy: `app/api/**`, Server Actions, middleware, edge routes, cron handlers.
  Weryfikacja: lista endpointow + metoda + wymagany auth + tenant scope.
- [ ] Zmapuj wszystkie tabele tenant-scoped.
  Weryfikacja: tabela z kolumna `salon_id` i krytycznoscia danych.
- [ ] Zmapuj RPC, views, functions i triggery uzywane przez aplikacje.
  Weryfikacja: lista obiektow DB i kto je wywoluje.
- [ ] Zmapuj wszystkie buckety i sciezki uploadu/pobierania.
  Weryfikacja: bucket policy + signed URL usage.
- [ ] Przygotuj konta testowe: `TenantA_Admin`, `TenantA_Staff`, `TenantB_Admin`, `TenantB_Staff`, `NoAuth`.
  Red flag: testy wykonywane tylko jednym kontem.

## 4. Auth, sesja, CSRF, cookies, naglowki
- [ ] Sprawdz gdzie trzymane sa tokeny i jak sa odswiezane.
  Weryfikacja: brak tokenow w `localStorage` i `sessionStorage`.
  Red flag: refresh lub access token dostepny dla JS.
- [ ] Zweryfikuj flagi cookies sesyjnych.
  Weryfikacja: `HttpOnly`, `Secure`, `SameSite` adekwatny do flow.
  Red flag: cookie bez `HttpOnly` lub bez `Secure` w prod.
- [ ] Zweryfikuj ochrone CSRF dla mutacji opartych o cookies.
  Weryfikacja: token CSRF lub rownowazny mechanizm + test forged POST z obcej domeny.
  Red flag: mutacja przechodzi bez anty-CSRF.
- [ ] Sprawdz uniewaznianie sesji po logout i zmianie hasla.
  Weryfikacja: stary token przestaje dzialac.
  Red flag: aktywna stara sesja.
- [ ] Sprawdz reset hasla i magic linki.
  Weryfikacja: jednorazowosc, TTL, rate limit.
  Red flag: link reusable albo bez wygasania.
- [ ] Sprawdz security headers.
  Weryfikacja: `Content-Security-Policy`, `X-Frame-Options` lub `frame-ancestors`, `Referrer-Policy`, `X-Content-Type-Options`, `Strict-Transport-Security`.
  Red flag: brak CSP lub HSTS w prod.
- [ ] Sprawdz CORS i preflight.
  Weryfikacja: tylko dozwolone originy, brak wildcard z credentials.
  Red flag: `Access-Control-Allow-Origin: *` przy cookie auth.

## 5. Autoryzacja i izolacja tenantow
- [ ] Potwierdz RLS dla wszystkich tabel w `public` i innych schematach aplikacyjnych.
  Red flag: jakakolwiek tabela z danymi biznesowymi bez RLS.
- [ ] Potwierdz komplet policy dla wymaganych operacji `SELECT`, `INSERT`, `UPDATE`, `DELETE`.
  Red flag: brak policy lub `USING (true)` na danych tenantowych.
- [ ] Kazda policy tenantowa musi wymuszac `salon_id` i context usera.
  Red flag: filtr tylko po `auth.uid()` bez powiazania z `salon_id`.
- [ ] Sprawdz, czy `WITH CHECK` blokuje zapis do obcego `salon_id`.
  Red flag: mozna `INSERT` lub `UPDATE` z cudzym tenantem.
- [ ] Sprawdz wszystkie views.
  Weryfikacja: bezpieczna definicja, brak ominięcia RLS, poprawne `security_invoker` jesli potrzebny.
  Red flag: view zwraca cross-tenant dane.
- [ ] Sprawdz wszystkie RPC i funkcje SQL.
  Weryfikacja: tenant validation w funkcji, bez zaufania do parametrow klienta.
  Red flag: RPC przyjmuje `salon_id` i nie porownuje go z auth context.
- [ ] Sprawdz funkcje `SECURITY DEFINER`.
  Weryfikacja: minimalne uprawnienia, jawne walidacje tenant/user, brak dynamic SQL z inputu.
  Red flag: `SECURITY DEFINER` bez kontroli dostepu.
- [ ] Sprawdz triggery modyfikujace `salon_id`, owner fields, faktury i ownership.
  Red flag: trigger pozwala nadpisac ownership albo ominac reguly biznesowe.
- [ ] Sprawdz uzycie admin clienta (`service_role`).
  Weryfikacja: tylko backend i tylko gdy konieczne.
  Red flag: sciezka user-facing wykonuje zapytania bez tenant filtra przez `service_role`.

## 6. Next.js: API routes, Server Actions, Middleware, Edge, Cron
- [ ] Kazda route mutujaca uzywa spojnego auth context.
  Red flag: `supabase.auth.getSession()` jako jedyne zrodlo prawdy albo zaufanie do `userId` z body/query.
- [ ] Kazdy odczyt i zapis tenant-scoped filtruje po `salon_id`.
  Red flag: zapytanie po samym `id`.
- [ ] Server Actions nie ufaja ukrytym polom formularza.
  Weryfikacja: serwer wylicza `salon_id` z auth context.
  Red flag: `salon_id` przychodzi z klienta.
- [ ] Middleware poprawnie egzekwuje auth i tenant routing.
  Red flag: mozliwosc wejscia na tenant B po podmianie sciezki lub subdomeny.
- [ ] Edge handlers nie oslabiaja autoryzacji wzgledem node route.
  Red flag: endpoint edge zachowuje sie inaczej niz route handler pod katem auth.
- [ ] Cron i background jobs dzialaja w zakresie tenantu albo jawnie globalnym z kontrola.
  Red flag: cron aktualizuje rekordy bez `salon_id`.
- [ ] Rate limiting istnieje dla loginu, resetu hasla, endpointow kosztowych i mutacji masowych.
  Red flag: brak limitow albo limit tylko per-IP bez per-user/per-tenant.
- [ ] Idempotency istnieje dla platnosci, rezerwacji i powiadomien.
  Red flag: wielokrotne obciazenie przez retry lub race.

## 7. Storage, signed URLs, uploady
- [ ] Polityki bucketow: prywatne domyslnie, public tylko swiadomie.
  Red flag: public read/write dla danych klientow.
- [ ] Upload waliduje MIME, rozszerzenia, rozmiar, nazwe pliku i ryzykowna tresc.
  Red flag: upload HTML, SVG lub JS mozliwy do XSS.
- [ ] Sciezki obiektow zawieraja tenant scope.
  Red flag: pliki bez namespace z `salon_id`.
- [ ] Signed URLs maja krotki TTL i minimalny zakres operacji.
  Red flag: dlugie TTL i przewidywalne sciezki.
- [ ] Pobieranie i usuwanie plikow wymaga walidacji ownership.
  Red flag: zgadniecie path pozwala na odczyt albo usuniecie cudzego pliku.

## 8. Naduzycia logiki biznesowej
- [ ] Rezerwacje: blokada overbooking i race condition.
  Red flag: rownolegle zadania tworza konfliktowe sloty.
- [ ] Cennik i rabaty: brak mozliwosci ujemnej ceny i obejscia limitow.
  Red flag: klient ustawia cene koncowa.
- [ ] Faktury i platnosci: brak mozliwosci oplacenia cudzego dokumentu.
  Red flag: `invoice_id` bez tenant validation.
- [ ] Role i uprawnienia: staff nie moze wykonywac admin-only operacji.
  Red flag: UI ukrywa przycisk, ale backend pozwala.
- [ ] Masowe importy i eksporty maja limity wolumenu i zakresu.
  Red flag: pelny eksport wszystkich tenantow.
- [ ] Powiadomienia i webhooki wewnetrzne sa odporne na spoofing.
  Red flag: akcja krytyczna bez podpisu albo sekretu.

## 9. Integracje zewnetrzne, webhooki, SSRF
- [ ] Webhook verification, np. Stripe.
  Weryfikacja: podpis, timestamp tolerance, replay protection.
  Red flag: endpoint przyjmuje payload bez weryfikacji.
- [ ] Webhooki sa przetwarzane idempotentnie.
  Red flag: ten sam event tworzy wiele transakcji.
- [ ] SSRF: brak fetch do user-controlled URL bez allowlisty.
  Red flag: backend pobiera dowolny URL z inputu.
- [ ] Sekrety integracji sa tylko po stronie serwera.
  Red flag: klucze API w `NEXT_PUBLIC_*` albo bundle JS.

## 10. Sekrety, konfiguracja, zaleznosci
- [ ] Audyt env vars i repo.
  Red flag: sekrety w git, logach builda albo bledach.
- [ ] Rotacja i zakres kluczy sa zgodne z least privilege.
  Red flag: jeden klucz o pelnym dostepie uzywany wszedzie.
- [ ] Dependency audit obejmuje Next.js, Supabase SDK, `jose` i paczki krytyczne.
  Red flag: znane CVE bez planu mitigacji.
- [ ] Ustawienia produkcyjne platformy sa bezpieczne.
  Red flag: mixed content, downgrade HTTP, zle redirecty.

## 11. Dynamiczne testy cross-tenant
- [ ] Dla kazdego endpointu odczytu `TenantA` probuje czytac rekord `TenantB` przez podmiane `id`.
  Oczekiwane: `403` albo `404`.
- [ ] Dla kazdego endpointu mutacji `TenantA` probuje aktualizowac albo usuwac rekord `TenantB`.
  Oczekiwane: `403` albo `404`.
- [ ] Dla RPC podstaw `salon_id`, `user_id`, `invoice_id`.
  Oczekiwane: odrzucenie.
- [ ] Dla Storage `TenantA` uzywa path albo signed URL `TenantB`.
  Oczekiwane: odrzucenie.
- [ ] Dla Server Actions manipuluj hidden fields i replay requestow.
  Oczekiwane: odrzucenie.
- [ ] Dla cron i background jobs wymus uruchomienie na danych mieszanych tenantow.
  Oczekiwane: zero cross-tenant skutkow.
- [ ] Dla webhookow wykonaj replay i payload dla innego tenantu.
  Oczekiwane: idempotentne odrzucenie.

## 12. Red flags wymagajace natychmiastowego stop-ship
- [ ] Dane tenantu B dostepne dla tenantu A w jakiejkolwiek sciezce.
- [ ] `service_role` key dostepny klientowi albo endpointowi publicznemu bez twardej autoryzacji.
- [ ] Brak RLS na tabelach produkcyjnych z danymi klientow.
- [ ] Krytyczne mutacje bez CSRF protection przy auth cookie.
- [ ] `SECURITY DEFINER` albo RPC omijajace kontrole tenantu.
- [ ] Webhooki finansowe bez podpisu i idempotency.
- [ ] Signed URL umozliwiajacy trwaly albo publiczny dostep do prywatnych danych.

## 13. Szablon wyniku testu
## [ID] Tytul problemu
- Status: `FAIL | PASS | UNKNOWN`
- Priorytet: `P0 | P1 | P2 | P3`
- Obszar: `Auth | RLS | API | Server Action | Storage | Webhook | BizLogic | Infra`
- Komponent: `plik | endpoint | tabela | funkcja`
- Tenant impact: `Single-tenant | Cross-tenant | Global`
- Warunek wstepny: `rola, konto, srodowisko`
- Kroki reprodukcji: `krok 1...n`
- Dowod: `response, log, SQL result, screenshot, request id`
- Oczekiwane zachowanie: `co powinno sie stac`
- Rzeczywiste zachowanie: `co sie stalo`
- Root cause: `konkretna luka w kodzie, policy albo config`
- Fix minimalny: `najmniejsza poprawka blokujaca exploit`
- Fix docelowy: `trwale rozwiazanie systemowe`
- Test regresji: `co dodac do CI, e2e albo sql tests`
- Owner: `zespol albo osoba`
- ETA: `data`
- Linki: `PR | issue | commit`

## 14. Format raportu koncowego
- [ ] Sekcja `Executive Risk`: liczba `P0/P1/P2/P3` + decyzja `GO/NO-GO`.
- [ ] Sekcja `Top 5 exploitable paths`: tylko realnie wykonalne wektory.
- [ ] Sekcja `Coverage`: co przetestowano, co zostalo `UNKNOWN`, i dlaczego.
- [ ] Sekcja `Fix Plan 72h`: konkretne taski i ownerzy dla `P0/P1`.
- [ ] Sekcja `Regression Gates`: testy, ktore musza wejsc do CI przed releasem.

## 15. Minimalna kolejnosc realizacji
1. RLS + cross-tenant dynamic tests: DB, API, Server Actions, Storage.
2. `service_role` exposure + auth, session, cookies, CSRF.
3. RPC, views, `SECURITY DEFINER`, triggery.
4. Webhooki finansowe + idempotency + SSRF.
5. Business logic abuse: rezerwacje, platnosci, role.
6. Security headers, rate limiting, audit logging, dependencies.
