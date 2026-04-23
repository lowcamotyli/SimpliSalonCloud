# Sprint SS2.4-25 — Hotfixy: Header przychodów + Artefakty UI

## Cel
(P0) Dwa niezależne bugi zgłoszone przez klientkę:
1. Sekcja "Przychód wg pracowników" pokazuje w nagłówku "ostatnie 7 dni" mimo przełączenia filtra na 30/90 dni.
2. Artefakty UI i błędy '/' w pisowni w widoku Zmian (changelog/activity feed).

## Architektura — dokumenty referencyjne

| Dokument | Dlaczego |
|----------|----------|
| `docs/architecture/data-architecture.md` | Struktura zapytań raportowych |

```bash
DAD_PROMPT='Read /mnt/d/SimpliSalonCLoud/docs/architecture/data-architecture.md. List constraints for reporting queries, date range params, and any caching that could cause stale headers. FORMAT: Bulleted list.' bash ~/.claude/scripts/dad-exec.sh
```

**Kluczowe constraints:**
- Raporty używają parametru `range` lub `from/to` — nagłówek musi czytać ten sam state co zapytanie
- Zmiany aktualnego stanu — sprawdź co renderuje artefakty '/'

## Stan aktualny

### Bug A — Revenue header
- `app/(dashboard)/[slug]/reports/` — komponent raportu przychodu wg pracowników
- Nagłówek sekcji prawdopodobnie hardcoduje "ostatnie 7 dni" zamiast czytać aktywny filtr
- Sam raport (dane) jest poprawny — problem tylko w opisie/tytule sekcji

### Bug B — Artefakty '/'
- Widok Zmian (`changelog` / `activity`) — niezidentyfikowany komponent
- Symptom: literki '/' pojawiają się w nieoczekiwanych miejscach w tekście

## Zakres

### A — Revenue header fix
- [ ] Znajdź komponent wyświetlający "ostatnie 7 dni" w raporcie przychodów pracowników
- [ ] Podepnij tekst nagłówka pod aktywny stan filtra (identycznie jak dane)
- [ ] Upewnij się że zmiana filtra odświeża zarówno dane jak i nagłówek

### B — Artefakty '/' w Zmianach
- [ ] Zlokalizuj źródło '/' w renderowanych stringach
- [ ] Likely candidate: concatenation bez spacji lub błędna interpolacja w template strings
- [ ] Fix + test na kilku przykładowych wpisach

## Pliki do zbadania (przed dispatchem)

```bash
# Znajdź komponent revenue by employees
grep -r "ostatnie 7 dni\|last 7 days\|7 dni" d:/SimpliSalonCLoud/app --include="*.tsx" -l
grep -r "revenue.*employee\|employee.*revenue\|przychód.*pracowni" d:/SimpliSalonCLoud/app --include="*.tsx" -l -i

# Znajdź widok Zmian
grep -r "changelog\|activity\|zmiany\|Zmiany" d:/SimpliSalonCLoud/app --include="*.tsx" -l -i
```

## Work packages

- ID: pkg-A | Type: implementation | Worker: Claude (< 10 linii fix) | Inputs: znaleziony plik | Outputs: fix nagłówka
- ID: pkg-B | Type: implementation | Worker: Claude lub codex-main | Inputs: znaleziony komponent | Outputs: fix '/'

## Verification

```bash
npx tsc --noEmit
# Ręcznie: przełącz filtr w raporcie i sprawdź czy nagłówek się zmienia
# Ręcznie: sprawdź widok Zmian pod kątem braku '/'
```

## Acceptance criteria

- [ ] Przełączenie filtra z 7d → 30d zmienia tekst nagłówka sekcji przychodów pracowników
- [ ] Brak artefaktów '/' w widoku Zmian na co najmniej 5 przykładowych wpisach
- [ ] `npx tsc --noEmit` → clean
