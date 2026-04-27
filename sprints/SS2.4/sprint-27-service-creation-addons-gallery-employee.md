# Sprint SS2.4-27 — Tworzenie usługi: Dodatki, Galeria, Przypisanie pracownika

## Cel
(P1) Rozbudowa flow tworzenia/edycji usługi o trzy powiązane funkcje:
1. Zakładka/sekcja Dodatki dostępna już przy tworzeniu usługi (nie tylko po zapisaniu).
2. Zakładka/sekcja Galeria (zdjęcia) dostępna przy tworzeniu/edycji.
3. Po zapisaniu nowej usługi: modal/krok "Przypisz pracowników" (opcjonalny, można pominąć).

Cel: skrócenie flow — użytkownik nie musi wrócić do usługi w osobnym kroku żeby dodać dodatki/zdjęcia/pracowników.

## Architektura — dokumenty referencyjne

```bash
DAD_PROMPT='Read /mnt/d/SimpliSalonCLoud/docs/architecture/data-architecture.md. List constraints for: service_addons table structure, service photos/gallery storage, employee_services junction table. FORMAT: Bulleted list.' bash ~/.claude/scripts/dad-exec.sh
```

| Dokument | Dlaczego |
|----------|----------|
| `docs/architecture/data-architecture.md` | Relacje: service_addons, service_photos, employee_services |
| `docs/architecture/bounded-contexts.md` | Granice między Services a Employee bounded contexts |

**Kluczowe constraints:**
- Dodatki i zdjęcia wymagają `service_id` — nie można ich zapisać przed zapisaniem usługi
- Flow: (1) zapisz usługę → (2) masz service_id → (3) pokaż dodatki/zdjęcia/pracowników
- Przypisanie pracownika: tabela `employee_services` — sprawdź istniejącą strukturę
- Galeria: SS2.3 sprint 20/21 mogły już zaimplementować photos — sprawdź przed dispatchem

## Stan aktualny

```bash
# Sprawdź czy galeria z SS2.3 już istnieje
ls d:/SimpliSalonCLoud/app/api/services/*/photos* 2>/dev/null
grep -r "service.*photo\|ServicePhoto\|gallery" d:/SimpliSalonCLoud/components --include="*.tsx" -l
grep -r "service.*addon\|ServiceAddon\|add.on" d:/SimpliSalonCLoud/components --include="*.tsx" -l
```

## Zakres

### A — Tabbed dialog dla usługi (codex-main)
- [ ] Istniejący dialog/formularz usługi — zamień na multi-tab layout (jeśli nie ma)
  - Tab 1: Podstawowe info (nazwa, opis, czas, cena)
  - Tab 2: Dodatki (lista + dodawanie szablonów dodatków)
  - Tab 3: Galeria (upload zdjęć)
- [ ] Tabs 2 i 3 disabled/locked gdy `mode === 'create'` (service_id nie istnieje jeszcze)
  - Po zapisaniu — odblokuj i przełącz automatycznie na Tab 2
  - Alternatywnie: pokaż inline komunikat "Zapisz usługę żeby dodać dodatki/zdjęcia"

### B — Szablony dodatków z widoku usługi (codex-dad)
- [ ] Tab Dodatki — sekcja "Szablony" — możliwość importu szablonu (jeśli istnieje global addon templates)
  - Jeśli nie ma globalnych szablonów: dodaj UI do tworzenia dodatków specyficznych dla tej usługi
- [ ] Lista aktualnych dodatków usługi z możliwością edycji/usunięcia
- [ ] Sortowanie drag-and-drop (opcjonalnie, P3)

### C — Post-create: modal przypisania pracowników (codex-main)
- [ ] Po `POST /api/services` (sukces 201) — pokaż modal "Przypisz pracowników do tej usługi"
  - Lista pracowników salonu z checkboxami
  - Przycisk "Przypisz" (wywołuje `PATCH /api/employees/[id]/services` lub analogiczny endpoint)
  - Przycisk "Pomiń" — zamknij bez przypisywania
- [ ] Modal opcjonalny — nie blokuje zapisu usługi

## Work packages

- ID: pkg-dialog | Type: implementation | Worker: codex-main | Inputs: istniejący service form | Outputs: tabbed dialog
- ID: pkg-addons-tab | Type: implementation | Worker: codex-dad | Inputs: pkg-dialog | Outputs: addons tab content
- ID: pkg-post-create | Type: implementation | Worker: codex-dad | Inputs: pkg-dialog | Outputs: employee assignment modal

## Verification

```bash
npx tsc --noEmit
# Flow test: Nowa usługa → Zapisz → czy pojawia się modal przypisania pracownika?
# Flow test: Edycja usługi → Tab Dodatki → czy można dodać dodatek?
# Flow test: Edycja usługi → Tab Galeria → czy można przesłać zdjęcie?
```

## Acceptance criteria

- [ ] Dialog usługi ma zakładki: Podstawowe / Dodatki / Galeria
- [ ] Zakładki Dodatki i Galeria są dostępne tylko po zapisaniu usługi (service_id istnieje)
- [ ] Po zapisaniu nowej usługi pojawia się modal "Przypisz pracowników" z opcją Pomiń
- [ ] Z widoku usługi można dodać/usunąć dodatki
- [ ] `npx tsc --noEmit` → clean
