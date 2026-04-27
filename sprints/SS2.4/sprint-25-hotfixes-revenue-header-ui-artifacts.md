# Sprint SS2.4-25 — Hotfixy: Header przychodów + Artefakty + Dialog Zmiana

## Cel
(P0) Trzy niezależne problemy w UI:
1. Sekcja "Przychód wg pracowników" pokazuje w nagłówku "ostatnie 7 dni" mimo przełączenia filtra.
2. Artefakty `\` w polskich znakach w zakładce Zmiana pracownika (np. `Sta\la zmiana` zamiast `Stała zmiana`).
3. Dialog "Zmiana" pracownika jest zbyt długi — przerobić na dwupanelowy slide-over (prawy panel wysuwa się obok pierwszego dialogu).

## Kontekst wizualny

Screenshot pokazuje zakładkę **Zmiana** w dialogu "Edytuj pracownika":
- Dropdown "Typ zasady" wyświetla **`Sta\la zmiana`** — backslash jako artefakt polskiego znaku `ł`
- Dialog zawiera: tygodniowy widok zmian, formularz "Zasady automatyczne", listę zasad, szablony zmian — zbyt dużo w jednym przewijalnym oknie
- Rozwiązanie: wysunięty panel po prawej (slide-over) dla sekcji "Zasady automatyczne" i "Szablony zmian"

## Architektura — dokumenty referencyjne

| Dokument | Dlaczego |
|----------|----------|
| `docs/architecture/data-architecture.md` | Struktura zapytań raportowych (bug A) |

```bash
DAD_PROMPT='Read /mnt/d/SimpliSalonCLoud/docs/architecture/data-architecture.md. List constraints for reporting queries and date range params. FORMAT: Bulleted list. LIMIT: Max 10 lines.' bash ~/.claude/scripts/dad-exec.sh
```

## Pliki do zlokalizowania przed dispatchem

```bash
# Bug A — Revenue header
grep -r "ostatnie 7 dni\|last 7 days" d:/SimpliSalonCLoud/app --include="*.tsx" -l
grep -r "revenue.*employee\|przychód.*pracowni" d:/SimpliSalonCLoud/app --include="*.tsx" -l -i

# Bug B — Artefakty backslash w Zmianach
grep -r "Sta.la zmiana\|Sta\\\\la\|shift.*type\|shiftType\|typ.*zasady" d:/SimpliSalonCLoud/components --include="*.tsx" -l -i
grep -r "shift-rule\|ShiftRule\|automatic.*rule\|zasad" d:/SimpliSalonCLoud/components --include="*.tsx" -l -i

# Bug C — Dialog Zmiana
grep -r "Zmiany pracownika\|employee.*shift\|ShiftTab\|ZmianaTab" d:/SimpliSalonCLoud/components --include="*.tsx" -l -i
```

## Zakres

### A — Revenue header fix (Claude, < 10 linii)
- [ ] Znajdź hardcodowany string "ostatnie 7 dni" w raporcie przychodów pracowników
- [ ] Podepnij tekst nagłówka pod aktywny stan filtra (ten sam `range`/`period` state co query)
- [ ] Zmiana filtra → nagłówek i dane zmieniają się razem

### B — Artefakty `\` w polskich znakach (codex-main)
- [ ] Zlokalizuj dropdown "Typ zasady" w zakładce Zmiana — źródło wartości `Sta\la zmiana`
- [ ] Przyczyna: prawdopodobnie string z escape'owanym `\ł` lub błędne kodowanie w obiekcie opcji
  - Sprawdź enum/obiekt definiujący opcje dropdown (`shift_type`, `rule_type` lub analogiczny)
  - Możliwe miejsca: stała TS z opcjami, DB seed, tłumaczenia i18n
- [ ] Fix: poprawna wartość label (`Stała zmiana`) bez backslasha
- [ ] Przeskanuj pozostałe polskie znaki w tym komponencie (`ą`, `ę`, `ó`, `ź`, `ż`, `ć`, `ń`) — napraw wszystkie naraz

### C — Dialog Zmiana: dwupanelowy layout (codex-main)
Aktualny layout: jeden długi dialog z sekcjami jedna pod drugą.
Nowy layout: dialog główny (lewy) + slide-over panel po prawej.

**Panel lewy (istniejący dialog):**
- Tygodniowy widok zmian (kalendarz PON–NIE) — ZOSTAJE
- Lista aktywnych zasad automatycznych (read-only, badges) — ZOSTAJE
- Lista szablonów zmian (read-only, badges) — ZOSTAJE
- Przycisk "Zarządzaj zasadami" → otwiera panel prawy
- Przycisk "Zarządzaj szablonami" → otwiera panel prawy (inny tryb)

**Panel prawy (slide-over, wysuwa się obok dialogu):**
- Tryb "Zasady": formularz dodawania/edycji zasady automatycznej + pełna lista zasad z akcjami
- Tryb "Szablony": formularz dodawania szablonu + lista szablonów z akcjami
- Zamknięcie panelu prawego → wraca do panelu lewego (dialog główny zostaje otwarty)
- Na małych ekranach: panel prawy zastępuje lewy (lub pojawia się jako drawer)

**Implementacja:**
- [ ] Wydziel formularz zasad automatycznych do osobnego komponentu `ShiftRulesPanel`
- [ ] Wydziel zarządzanie szablonami do `ShiftTemplatesPanel`
- [ ] Główny dialog: zmniejsz wysokość — tylko widok tygodniowy + listy read-only + triggery
- [ ] Panel slide-over: komponent wielokrotnego użytku (można wykorzystać wzorzec z sprint 28 EmployeeServicesPanel)
- [ ] Animacja: panel wysuwa się od prawej, lewy dialog zostaje na miejscu

## Work packages

- ID: pkg-A | Type: implementation | Worker: Claude (< 10 linii) | Outputs: fix nagłówka raportu
- ID: pkg-B | Type: implementation | Worker: codex-main | Outputs: fix backslash w opcjach dropdown
- ID: pkg-C | Type: implementation | Worker: codex-main | Outputs: dwupanelowy layout zakładki Zmiana

## Verification

```bash
npx tsc --noEmit
# Test A: przełącz filtr raportu 7d → 30d → nagłówek się zmienia
# Test B: otwórz zakładkę Zmiana → dropdown "Typ zasady" → brak backslasha w opcjach
# Test C: klik "Zarządzaj zasadami" → wysuwa się panel prawy, lewy zostaje widoczny
# Test C: na mobile → panel prawy działa jako drawer
```

## Acceptance criteria

- [ ] Nagłówek raportu przychodów pracowników odzwierciedla aktywny filtr (nie hardcode 7 dni)
- [ ] Dropdown "Typ zasady" wyświetla `Stała zmiana` (bez backslasha)
- [ ] Brak artefaktów `\` we wszystkich polskich znakach w zakładce Zmiana
- [ ] Dialog Zmiana: tygodniowy widok + listy zasad/szablonów w jednym kompaktowym widoku
- [ ] Klik "Zarządzaj zasadami" / "Zarządzaj szablonami" → slide-over panel po prawej
- [ ] `npx tsc --noEmit` → clean
