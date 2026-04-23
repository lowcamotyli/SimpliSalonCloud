# Sprint SS2.4-28 — Pracownik ↔ Usługi: Multi-select + Wysuwany panel

## Cel
(P1) Dwa powiązane ulepszenia UX zarządzania usługami pracownika:
1. W oknie edycji pracownika: możliwość przypisania/odpięcia wielu usług naraz (zamiast jednej po jednej).
2. Lista usług pracownika — gdy jest za długa: wysuwany panel po prawej stronie z wyszukiwarką i checkboxami.

## Architektura — dokumenty referencyjne

```bash
DAD_PROMPT='Read /mnt/d/SimpliSalonCLoud/docs/architecture/data-architecture.md. List structure of employee_services junction table, any bulk operations available, and RLS constraints for updating this table. FORMAT: Bulleted list.' bash ~/.claude/scripts/dad-exec.sh
```

| Dokument | Dlaczego |
|----------|----------|
| `docs/architecture/data-architecture.md` | Tabela `employee_services`, bulk upsert pattern |
| `docs/architecture/multi-tenant-architecture.md` | salon_id filtering w employee queries |

**Kluczowe constraints:**
- Bulk przypisanie: `upsert` na `employee_services` lub DELETE + INSERT — sprawdź czy jest endpoint
- salon_id: wszystkie zapytania o usługi muszą filtrować po `salon_id` (IDOR risk)
- Maksymalna liczba usług na salon: brak limitu w DB — UI musi obsługiwać 50+ pozycji

## Stan aktualny

```bash
# Znajdź komponent edycji pracownika i sekcję usług
grep -r "employee.*service\|employeeService\|assign.*service" d:/SimpliSalonCLoud/components --include="*.tsx" -l -i
grep -r "employee.*edit\|EditEmployee\|employeeForm" d:/SimpliSalonCLoud/components --include="*.tsx" -l -i
```

## Zakres

### A — Bulk API endpoint (codex-dad)
- [ ] `app/api/employees/[id]/services/bulk/route.ts` (lub rozszerzenie istniejącego)
  - POST body: `{ service_ids: string[], action: 'set' }` — `set` = zastąp całą listę
  - Alternatywnie: `action: 'add' | 'remove' | 'set'`
  - Walidacja: salon_id check na KAŻDYM service_id (IDOR!)
  - Response: zaktualizowana lista przypisanych usług

### B — Wysuwany panel (Slide-over) z multi-select (codex-main)
- [ ] Nowy komponent: `EmployeeServicesPanel` — slide-over po prawej stronie
  - Trigger: przycisk "Zarządzaj usługami" w oknie edycji pracownika
  - Zawartość: lista WSZYSTKICH usług salonu z checkboxami
  - Pre-checked: usługi aktualnie przypisane do pracownika
  - Wyszukiwarka inline (filtruje bez zapytania do API)
  - Grupowanie wg kategorii usług (jeśli istnieje kategoria)
  - Przycisk "Zapisz" → wywołuje bulk API → zamknij panel
  - Przycisk "Anuluj" → odrzuć zmiany
- [ ] Komponent musi obsługiwać 50+ usług bez problemów z wydajnością (wirtualizacja NIE wymagana dla MVP)

### C — Integracja z formularzem pracownika (codex-dad)
- [ ] Podmień istniejącą sekcję "Usługi" w formularzu pracownika na nowy panel
- [ ] Wyświetl aktualnie przypisane usługi jako badges/tagi (nie checkbox list)
- [ ] Przycisk "Edytuj" → otwiera slide-over panel
- [ ] Po zapisaniu — odśwież listę przypisanych usług

## Work packages

- ID: pkg-api | Type: implementation | Worker: codex-dad | Outputs: bulk services endpoint
- ID: pkg-panel | Type: implementation | Worker: codex-main | Inputs: pkg-api | Outputs: EmployeeServicesPanel
- ID: pkg-integration | Type: implementation | Worker: codex-dad | Inputs: pkg-panel | Outputs: integracja z employee form

## Verification

```bash
npx tsc --noEmit
# Test: otwórz edycję pracownika → "Zarządzaj usługami" → slide-over się pojawia
# Test: zaznacz 10 usług → Zapisz → sprawdź DB czy są wszystkie
# Test: odznacz 3 → Zapisz → sprawdź DB
# Security: sprawdź czy bulk endpoint waliduje salon_id każdej usługi
```

## Acceptance criteria

- [ ] W edycji pracownika: slide-over panel z listą usług salonu i checkboxami
- [ ] Wyszukiwarka filtruje usługi w panelu
- [ ] Bulk zapis — zaznaczone usługi są przypisane, odznaczone odpięte
- [ ] API endpoint waliduje salon_id każdego service_id (brak IDOR)
- [ ] `npx tsc --noEmit` → clean
