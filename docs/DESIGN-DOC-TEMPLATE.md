# Design Doc - [Nazwa Funkcji]

## 1. Executive Summary
[2-4 zdania. Co budujemy, po co to robimy, dla kogo i jaki problem rozwiazujemy.]

## 2. Problem
### Stan obecny
- [Jak wyglada system dzisiaj]
- [Gdzie uzytkownik lub zespol napotyka problem]

### Problem biznesowy
- [Jaki KPI, proces lub koszt cierpi]

### Problem techniczny
- [Jakie ograniczenie architektoniczne, produktowe lub operacyjne trzeba usunac]

## 3. Cele
- [Cel 1 mierzalny]
- [Cel 2 mierzalny]
- [Cel 3 mierzalny]

## 4. Non-Goals
- [Czego ten projekt swiadomie nie rozwiazuje]
- [Jakich zmian nie robimy w tym etapie]

## 5. Uzytkownicy i scenariusze
### Głowni uzytkownicy
- [np. owner salonu]
- [np. manager]
- [np. pracownik]
- [np. klient koncowy]

### Kluczowe scenariusze
1. [Uzytkownik wykonuje glowny happy path]
2. [Uzytkownik napotyka edge case]
3. [Administrator lub personel wykonuje operacje pomocnicza]

## 6. Zakres rozwiazania
### In Scope
- [Widok / endpoint / proces / migracja]
- [Nowe reguly walidacji]
- [Zmiana w UI lub API]

### Out of Scope
- [Tematy odlozone na kolejny etap]
- [Integracje, ktore nie sa czescia tego wdrozenia]

## 7. Wymagania funkcjonalne
- System musi [konkretne zachowanie]
- Uzytkownik musi moc [konkretna akcja]
- Dane musza byc [walidowane, szyfrowane, wersjonowane, audytowalne itp.]
- UI musi [pokazywac status, blad, blokade, ostrzezenie]

## 8. Wymagania niefunkcjonalne
- Wydajnosc: [np. odpowiedz API < 500 ms p95]
- Bezpieczenstwo: [np. RLS, role, szyfrowanie, tokeny]
- Niezawodnosc: [np. retry, idempotencja, fallback]
- Obserwowalnosc: [logi, metryki, audyt]
- Zgodnosc: [np. GDPR / dane zdrowotne / retencja]

## 9. UX i przeplyw
### Happy Path
1. [Krok 1]
2. [Krok 2]
3. [Krok 3]

### States
- Loading: [co widzi uzytkownik]
- Empty: [co widzi uzytkownik]
- Error: [co widzi uzytkownik]
- Blocked: [warunki blokady i komunikat]
- Success: [potwierdzenie i kolejny krok]

## 10. Architektura
### Komponenty
- `app/...` - [odpowiedzialnosc]
- `components/...` - [odpowiedzialnosc]
- `lib/...` - [logika domenowa]
- `app/api/...` - [warstwa zapisu / odczytu]
- `supabase/migrations/...` - [zmiany schematu lub polityk]

### Przeplyw danych
1. [Zrodlo danych]
2. [Walidacja / transformacja]
3. [Zapis / odczyt]
4. [Render / efekt koncowy]

### Granice odpowiedzialnosci
- UI odpowiada za [prezentacja, lokalne walidacje]
- API odpowiada za [autoryzacja, finalna walidacja, zapis]
- DB odpowiada za [integralnosc, RLS, constraints]

## 11. Model danych
### Nowe lub zmieniane encje
- `[tabela / typ / interface]`
- `[najwazniejsze pola]`

### Zmiany schematu
- [czy potrzebna migracja]
- [czy potrzebny backfill]
- [czy istnieje ryzyko driftu]

### Przyklad payloadu
```ts
type ExamplePayload = {
  id: string
  status: "draft" | "approved"
}
```

## 12. API / kontrakty
### Endpointy
- `GET /api/...` - [co zwraca]
- `POST /api/...` - [co zapisuje]

### Walidacja
- [Zod / schema / wymagane pola]
- [kody bledow i przypadki odmowy]

### Uprawnienia
- [kto ma dostep]
- [jak egzekwujemy role]

## 13. Bezpieczenstwo i zgodnosc
- [Czy dotykamy danych osobowych]
- [Czy dotykamy danych zdrowotnych]
- [Jak ograniczamy zakres danych]
- [Jak egzekwujemy need-to-know]
- [Czy potrzebny jest audit trail]
- [Jakie ryzyka naduzyc blokujemy]

## 14. Alternatywy rozwazane
### Opcja A
- Plusy: [krotko]
- Minusy: [krotko]

### Opcja B
- Plusy: [krotko]
- Minusy: [krotko]

### Decyzja
- [Dlaczego wybieramy finalne rozwiazanie]

## 15. Ryzyka
- [Ryzyko 1] - Mitigacja: [jak ograniczamy]
- [Ryzyko 2] - Mitigacja: [jak ograniczamy]
- [Ryzyko 3] - Mitigacja: [jak ograniczamy]

## 16. Plan wdrozenia
### Faza 1
- [migracje / feature flag / backend]

### Faza 2
- [UI / integracja / testy]

### Faza 3
- [rollout / monitoring / cutover]

## 17. Testy i walidacja
- Unit: [co testujemy]
- Integration: [co testujemy]
- Manual QA: [scenariusze]
- Security / permissions: [co sprawdzamy]
- Data migration checks: [jesli dotyczy]

## 18. Monitoring po wdrozeniu
- [metryki sukcesu]
- [metryki bledu]
- [alerty]
- [logi, ktore warto sledzic]

## 19. Open Questions
- [Pytanie 1]
- [Pytanie 2]
- [Pytanie 3]

## 20. Acceptance Criteria
- [Jednoznaczne kryterium odbioru]
- [Jednoznaczne kryterium odbioru]
- [Jednoznaczne kryterium odbioru]

## 21. Proposed Files
### Read Context
- `[sciezka]` - [dlaczego czytamy]
- `[sciezka]` - [dlaczego czytamy]

### Expected Changes
- `[sciezka]` - [jakiej zmiany sie spodziewamy]
- `[sciezka]` - [jakiej zmiany sie spodziewamy]

## 22. Rollout Decision
- Ship when: [warunki]
- Do not ship when: [warunki]
- Follow-up backlog: [co zostaje na potem]
