# Treatment Cards Import — Runbook operacyjny

## Wymagania wstępne

- Node.js ≥ 18, pnpm
- Dostęp do Supabase (zmienna `SUPABASE_SERVICE_ROLE_KEY`)
- Pliki kart zabiegowych w formacie Markdown (`*.md`) — UTF-8 lub Latin-1

---

## Krok 1 — Build artefaktów

Skrypt `scripts/build-treatment-card-imports.ts` skanuje katalog kart i generuje artefakty JSON.

```bash
npx tsx scripts/build-treatment-card-imports.ts
# Artefakty trafiają do: generated/treatment-card-artifacts/*.json
```

Sprawdź ostrzeżenia w outputcie:
- `Brak markera sekcji RODO` — karta nie ma klauzuli — **nie importuj** bez uzupełnienia
- `Brak linii tytulu` — sprawdź nazwę pliku (format: `KATEGORIA_NazwaUslugi.md`)
- `Sekcja pytan ma mniej niz 50 znakow` — karta prawdopodobnie pusta lub skrócona

---

## Krok 2 — Review artefaktów (compliance gate)

Wejdź na stronę: `/{slug}/settings/import` (Settings → Import kart zabiegowych).

Dla każdej karty sprawdź:

| Pole | Co weryfikować |
|------|----------------|
| `dataCategory` | `sensitive_health` → wymaga szczególnej uwagi; upewnij się że salon ma zgodę na przetwarzanie danych wrażliwych |
| `reviewRequired` | `true` → karta ma sensitive fields lub niski confidence — **zatwierdź ręcznie** |
| `healthFieldCount` | Czy liczba pól zdrowotnych odpowiada treści karty |
| `gdpr_consent_text` | Czy tekst RODO jest czytelny i kompletny |
| `fields` | Przejrzyj wyekstrahowane pola — sprawdź typy (radio/text/textarea/date) |

Karty z `reviewRequired: true` **nie mogą** przejść do importu bez ręcznego zatwierdzenia.

---

## Krok 3 — Approved import

Po zatwierdzeniu karty w UI kliknij **„Importuj"**. System:

1. Waliduje artefakt przez `validateArtifact()` (Zod schema)
2. Ustawia `is_active: false` — karta jest nieaktywna do czasu przypięcia do usługi
3. Tworzy rekord w tabeli `form_templates` z `data_category`, `gdpr_consent_text`, polami JSON

Jeśli import API zwróci błąd:
- `422 Unprocessable Entity` → artefakt nie przeszedł walidacji — sprawdź JSON w `generated/`
- `409 Conflict` → karta o tej nazwie już istnieje w salonie — zmień nazwę lub edytuj istniejącą

---

## Krok 4 — Przypięcie do usług

Po imporcie każdy `form_template` jest nieaktywny (`is_active = false`). Aktywacja:

1. Wejdź na `/{slug}/settings/services`
2. Edytuj usługę → pole „Formularz przed wizytą"
3. Wybierz importowaną kartę z listy
4. Zapisz — karta staje się aktywna dla tej usługi

Karta może być przypięta do wielu usług jednocześnie.

---

## Krok 5 — Retencja i kontrola dostępu

### Retencja danych

| Typ danych | Gdzie | Retencja |
|------------|-------|----------|
| Artefakty JSON | `generated/` (lokalnie) | Usuń po zakończeniu importu; NIE commituj do repo |
| `form_templates` | Supabase | Czas życia salonu |
| Wypełnione formularze | `form_submissions` | Zgodnie z polityką GDPR salonu (min. 3 lata dla danych zdrowotnych) |

### Kontrola dostępu (RLS)

- `form_templates` — widoczne tylko dla pracowników salonu (`salon_id` match)
- Karty z `data_category = 'sensitive_health'` — dostęp przez `pre_appointment_responses` ograniczony do właściciela/managera
- Klient widzi tylko swój formularz przez publiczny token (jednorazowy, unieważniany po submit)

### Audyt

Przed wdrożeniem na nowym salonie uruchom:

```bash
npx vitest run tests/unit/forms-import --reporter=verbose
# Wszystkie 46 testów muszą być zielone
```

---

## Powtarzalny proces dla nowego salonu

```
1. Skopiuj pliki kart (.md) do katalogu roboczego
2. npx tsx scripts/build-treatment-card-imports.ts
3. Przejrzyj artefakty (krok 2)
4. Zatwierdź karty w UI /{slug}/settings/import
5. Przypisz do usług w /{slug}/settings/services
6. Usuń lokalny katalog generated/ (NIE commituj)
```

---

## Typowe problemy

| Problem | Przyczyna | Fix |
|---------|-----------|-----|
| Karta ma 0 pól | Pytania nie kończą się `?` i brak opcji | Dodaj `?` na końcu pytań w `.md` |
| `dataCategory` = `sensitive_health` dla zwykłej karty | Słowo kluczowe (np. "nowotwór") w pytaniu | Usuń lub zmodyfikuj treść pytania |
| Brak `gdpr_consent_text` | Brak tekstu po `## Klauzula informacyjna RODO` | Uzupełnij sekcję RODO w pliku `.md` |
| `confidence` < 0.7 | Pola nie pasują do `FIELD_MAP` | Sprawdź etykiety pytań — muszą zawierać znane wzorce |
