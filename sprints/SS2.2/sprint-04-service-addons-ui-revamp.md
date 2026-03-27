# Sprint SS2.2-04 — Service Add-ons UI Revamp

## Cel
Poprawienie UX panelu dodatkowych opcji usługi (add-ons). Aktualnie UI jest niejasne — użytkownicy nie wiedzą co wpisują i gdzie.

## Architektura — dokumenty referencyjne

Przed dispatchem przeczytaj:
```bash
gemini -p "Read docs/architecture/service-architecture.md. Summarize: how service add-ons fit in the service domain, any constraints on service modification UI. Max 60 lines." --output-format text 2>/dev/null | grep -v "^Loaded"
```

| Dokument | Dlaczego |
|----------|----------|
| `docs/architecture/service-architecture.md` | Kontekst add-onów w domenie usług |

**Kluczowe constraints:**
- Sprint czysto UI — brak zmian w API/DB, minimalne ryzyko architektoniczne
- Add-ony są częścią "Services" bounded context — `price_delta` i `duration_delta` modyfikują bazową usługę w momencie bookingu
- Nie zmieniaj kształtu danych przesyłanych do API — tylko labels i układ w UI

## Stan aktualny
- Backend: `GET/POST/DELETE /api/services/[id]/addons` — działa poprawnie
- UI: `<AddonsEditor />` komponent w `app/(dashboard)/[slug]/services/page.tsx`
- Add-ony dostępne tylko w trybie edycji istniejącej usługi (nie podczas tworzenia)
- Problem: brak wyraźnego opisu pól, niejasna różnica między "ceną bazową" a "dopłatą"

## Zakres tego sprintu
- [ ] Redesign `AddonsEditor` — czytelniejszy układ, lepsze labels
- [ ] Wyraźne opisy pól: `price_delta` jako "Dopłata (zł)" z wyjaśnieniem, `duration_delta` jako "Dodatkowy czas (min)"
- [ ] Sekcja nagłówkowa: "Opcje dodatkowe — klient może wybrać jedną podczas bookingu"
- [ ] Preview wiersza: "np. Maska nawilżająca +15 min, +30 zł"
- [ ] Walidacja: `price_delta` może być 0 lub ujemne (rabat), `duration_delta` ≥ 0

> **Uwaga:** Jeśli `AddonsEditor` > 50 linii → użyj Gemini reader przed edycją.

## Pliki do modyfikacji

| Plik | Akcja | Worker |
|------|-------|--------|
| `components/services/addons-editor.tsx` | EDIT (refactor UI) | codex-main |

## Zależności
- **Wymaga:** nic (sprint niezależny)

---

## Krok 0 — Odczyt komponentu przed dispatchem

```bash
gemini -p "Read components/services/addons-editor.tsx. Show all JSX structure, field names, and current labels. Max 40 lines." --output-format text 2>/dev/null | grep -v "^Loaded"
```

Następnie dostosuj prompt poniżej do aktualnego kodu.

---

## Prompt — codex-main (AddonsEditor refactor)

```bash
codex exec --dangerously-bypass-approvals-and-sandbox "Do NOT use Gemini — write directly.

Read components/services/addons-editor.tsx for current implementation.
Read app/api/services/[id]/addons/route.ts for API shape (fields: name, price_delta, duration_delta).

Goal: Improve UX clarity of the AddonsEditor component.
File: components/services/addons-editor.tsx

Changes:
1. Add section header: 'Opcje dodatkowe' with description 'Klient może wybrać jedną opcję podczas rezerwacji. Opcja może modyfikować czas i cenę usługi.'

2. In the add-addon form:
   - Label 'name' field: 'Nazwa opcji' with placeholder 'np. Maska nawilżająca, Keratyna, Folia'
   - Label 'price_delta' field: 'Zmiana ceny (zł)' with helper text 'Wpisz 0 jeśli bez dopłaty. Ujemna wartość = rabat.'
   - Label 'duration_delta' field: 'Dodatkowy czas (min)' with helper text 'Wpisz 0 jeśli bez zmiany czasu.'
   - Validation: duration_delta must be >= 0

3. In the addons list, each row should show a preview line:
   '+15 min, +30 zł' or '+0 min, bez dopłaty' based on values
   Format: if price_delta > 0 → '+X zł', if price_delta < 0 → '-X zł rabat', if 0 → 'bez dopłaty'
   Format: if duration_delta > 0 → '+X min', if 0 → omit from preview

4. Keep all existing API calls unchanged (only UI/labels change)

Do not change file structure, only update labels, descriptions, and the preview line.
Done when: component renders with improved labels and preview."
```

---

## Po wykonaniu

```bash
npx tsc --noEmit
```

## Done when
- `AddonsEditor` ma czytelne labels z opisami
- Każdy add-on w liście pokazuje preview (czas + cena)
- Walidacja `duration_delta >= 0` działa
- `tsc --noEmit` clean
