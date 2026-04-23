# Sprint SS2.4-31 — Klienci: Widok listy

## Cel
(P2) Dodanie widoku listy do modułu klientów. Aktualnie klienci wyświetlani są tylko w formie kafelków/grid.
Widok listy: tabela z kolumnami, sortowalna, z możliwością szybkich akcji (klik → profil klienta).

## Architektura — dokumenty referencyjne

```bash
DAD_PROMPT='Read /mnt/d/SimpliSalonCLoud/docs/architecture/data-architecture.md. List structure of clients/customers table, available columns, indexes. FORMAT: Bulleted list.' bash ~/.claude/scripts/dad-exec.sh
```

| Dokument | Dlaczego |
|----------|----------|
| `docs/architecture/data-architecture.md` | Schemat tabeli klientów, dostępne kolumny |

**Kluczowe constraints:**
- RLS: klienci są per-salon (salon_id filter obowiązkowy)
- Sortowanie po stronie DB (nie w JS) — duże salony mogą mieć 1000+ klientów
- Toggle widoku (kafelki ↔ lista) powinien być zapamiętany w localStorage lub URL param

## Stan aktualny

```bash
# Znajdź stronę klientów
ls d:/SimpliSalonCLoud/app/**/clients* -d 2>/dev/null
grep -r "ClientCard\|ClientGrid\|ClientList" d:/SimpliSalonCLoud/components --include="*.tsx" -l
```

## Zakres

### API (jeśli potrzebne nowe pola)
- [ ] Sprawdź czy istniejący `GET /api/clients` zwraca pola potrzebne do widoku listy
  - Wymagane: imię, nazwisko/nick, telefon, email, data ostatniej wizyty, liczba wizyt
  - Jeśli brak — dodaj do query (nie osobny endpoint)

### UI — Toggle i widok listy (codex-main)
- [ ] Dodaj toggle widoku (grid/list icons) do nagłówka strony klientów
  - Zapamiętaj wybór w `localStorage` (klucz: `clients-view-mode`)
- [ ] Nowy komponent `ClientsListView` — tabela:

  | Kolumna | Sortowalna |
  |---------|-----------|
  | Imię i nazwisko | tak |
  | Telefon | nie |
  | Email | nie |
  | Ostatnia wizyta | tak |
  | Liczba wizyt | tak |
  | Tagi | nie |
  | Akcje (→ profil, edytuj) | nie |

- [ ] Klik wiersza → nawigacja do profilu klienta
- [ ] Sortowanie: klik nagłówka kolumny → `?sort=last_visit&order=desc` w URL
- [ ] Filtrowanie i wyszukiwanie: te same co w widoku kafelków (te same API params)
- [ ] Paginacja: te same co w widoku kafelków (lub infinite scroll jeśli tak jest teraz)

## Work packages

- ID: pkg-ui | Type: implementation | Worker: codex-main | Inputs: istniejąca strona klientów | Outputs: ClientsListView + toggle

## Verification

```bash
npx tsc --noEmit
# Test: przełącz na widok listy → widoczna tabela
# Test: klik nagłówka "Ostatnia wizyta" → sortowanie
# Test: odśwież stronę → widok listy zachowany (localStorage)
# Test: klik wiersza → otwiera profil klienta
```

## Acceptance criteria

- [ ] Toggle widoku: grid / lista w nagłówku strony klientów
- [ ] Widok listy: tabela z min. 5 kolumnami
- [ ] Sortowanie po kolumnach (min. imię, data ostatniej wizyty)
- [ ] Wybór widoku zapamiętany po odświeżeniu
- [ ] `npx tsc --noEmit` → clean
