# Sprint SS2.4-33 — Sprzęt: Widok lista/kafelki + Przypisanie do usługi przy tworzeniu

## Cel
(P2) Dwa ulepszenia modułu sprzętu:
1. **Toggle widoku** — lista i kafelki (analogicznie do klientów w sprint 31).
2. **Przypisanie do usługi przy tworzeniu sprzętu** — po dodaniu nowego sprzętu: krok "Przypisz do usługi" (opcjonalny).

## Architektura — dokumenty referencyjne

```bash
DAD_PROMPT='Read /mnt/d/SimpliSalonCLoud/docs/architecture/data-architecture.md. List: (1) equipment table structure, (2) equipment_services or service_equipment junction table, (3) existing equipment reservation/booking link. FORMAT: Bulleted list.' bash ~/.claude/scripts/dad-exec.sh
```

| Dokument | Dlaczego |
|----------|----------|
| `docs/architecture/data-architecture.md` | Tabela equipment, relacja z usługami |

**Kluczowe constraints:**
- RLS: sprzęt jest per-salon
- Relacja sprzęt ↔ usługa: sprawdź czy istnieje junction table przed tworzeniem nowej
- Widok toggle: analogicznie do sprint 31 — `localStorage` key: `equipment-view-mode`

## Stan aktualny

```bash
# Znajdź stronę sprzętu
grep -r "equipment\|Equipment" d:/SimpliSalonCLoud/app --include="*.tsx" -l | grep -v node_modules
grep -r "EquipmentCard\|EquipmentList\|EquipmentGrid" d:/SimpliSalonCLoud/components --include="*.tsx" -l
```

## Zakres

### A — Toggle widoku lista/kafelki (codex-main)
- [ ] Dodaj toggle (grid/list icons) do nagłówka strony sprzętu
- [ ] Nowy komponent `EquipmentListView` — tabela:

  | Kolumna | Sortowalna |
  |---------|-----------|
  | Nazwa | tak |
  | Kategoria/Typ | tak |
  | Przypisane usługi | nie |
  | Status (aktywny/nieaktywny) | tak |
  | Akcje | nie |

- [ ] Zapamiętaj wybór widoku w localStorage
- [ ] Klik wiersza lub "Edytuj" → dialog/strona edycji sprzętu
- [ ] Istniejący widok kafelków pozostaje bez zmian

### B — Przypisanie do usługi po dodaniu sprzętu (codex-dad)

*Analogicznie do post-create modal z sprint 27 (przypisanie pracownika po usłudze)*

- [ ] Po `POST /api/equipment` (sukces) — pokaż modal "Przypisz do usługi"
  - Lista usług salonu z checkboxami
  - Pre-checked: brak (nowy sprzęt)
  - Przycisk "Przypisz" → wywołuje endpoint przypisania
  - Przycisk "Pomiń" → zamknij
- [ ] API: `app/api/equipment/[id]/services/route.ts` (lub sprawdź czy istnieje)
  - POST/PATCH: `{ service_ids: string[] }`
  - Walidacja salon_id dla każdego service_id

### C — Wyświetlanie przypisanych usług (jeśli brak)
- [ ] W kafelku/wierszu sprzętu: pokaż badge z liczbą przypisanych usług
- [ ] W dialogu edycji sprzętu: sekcja "Przypisane usługi" z możliwością zarządzania

## Work packages

- ID: pkg-list-view | Type: implementation | Worker: codex-main | Inputs: istniejąca strona | Outputs: toggle + list view
- ID: pkg-post-create | Type: implementation | Worker: codex-dad | Inputs: istniejący form sprzętu | Outputs: modal + API

## Verification

```bash
npx tsc --noEmit
# Test: toggle widoku działa, zapamiętany po odświeżeniu
# Test: dodaj sprzęt → pojawia się modal przypisania do usługi
# Test: przypisz do 2 usług → badge "2" widoczny w liście
# Test: Pomiń → brak przypisania, ale sprzęt zapisany
```

## Acceptance criteria

- [ ] Strona sprzętu ma toggle widoku: kafelki / lista
- [ ] Widok listy: tabela z kolumnami nazwa, typ, status, usługi
- [ ] Po dodaniu nowego sprzętu: modal "Przypisz do usługi" z opcją Pomiń
- [ ] Przypisanie sprzętu do usługi zapisywane do DB
- [ ] `npx tsc --noEmit` → clean
