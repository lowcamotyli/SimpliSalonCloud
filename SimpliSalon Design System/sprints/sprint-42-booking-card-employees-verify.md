# Sprint SS2.4-42 - Weryfikacja booking-card i employees (read-only audit)

## Cel

Przed wlasciwa integracja employees i hardening booking-card — ustalamy co juz dziala, co jest
do poprawy. Oba pliki sa zmodyfikowane na galezi SS2.4. Nie robimy nic na slepca.

Ten sprint to CZYSTY READ — codex-dad czyta i raportuje. Zadnych zmian w kodzie.

## Architektura - dokumenty referencyjne

Brak — sprint dotyczy audytu istniejacego kodu.

Zrodlo prawdy dla oczekiwanego zachowania:
`SimpliSalon Design System/revamp/interactive-objects.html` sekcja `09.3` (booking row) i `09.0` (3 click zones).

## Zdiagnozowane problemy (hipotezy do weryfikacji)

- [ ] Czy `booking-card.tsx` ma `stopPropagation` na ObjectLink i ObjectTrigger?
- [ ] Czy card body click nie propaguje do objektow wewnatrz?
- [ ] Czy `employees/page.tsx` i `employees/[id]/page.tsx` uzywaja components/objects/?
- [ ] Czy RelatedActionsMenu ma `aria-haspopup` i `aria-expanded`?

## Zakres

### A — Audit booking-card (dad-reviewer, --ephemeral)

Sprawdz:
1. Czy kazdy `<ObjectLink>` i `<ObjectTrigger>` wewnatrz karty ma `onClick` z `stopPropagation`
   lub wrapper div z `e.stopPropagation()`?
2. Czy klik w puste tlo / body karty otwiera szczegoly rezerwacji — jak? (onClick handler na card?)
3. Czy dlugie nazwy maja CSS `truncate` / `max-w-*`?
4. Czy destructive state (cancelled booking) ma odrebny styl?
5. Czy `ObjectTrigger` ma `aria-haspopup="menu"` i `aria-expanded`?

Output: lista PASS/FAIL per punkt powyzej + linijki gdzie sa problemy.

### B — Audit employees/page.tsx (dad-reviewer, --ephemeral)

Sprawdz:
1. Czy plik importuje cos z `@/components/objects/`?
2. Czy wiersze pracownikow uzywaja ObjectCell lub ObjectLink?
3. Czy jest RelatedActionsMenu / RelatedActionsSheet przy pracownikach?
4. Jesli nie — co renderuje: plain `<td>`, `<Link>`, inne?

Output: YES/NO + krotki opis aktualnego stanu renderowania.

### C — Audit employees/[id]/page.tsx (dad-reviewer, --ephemeral)

Sprawdz:
1. Czy importuje components/objects/?
2. Czy powiazane rezerwacje / uslugi sa klikalne przez ObjectLink / ObjectPill?

Output: YES/NO + opis.

## Dispatch commands

### Pkg A — booking-card audit (dad-reviewer)

```bash
wsl -d worker-dad -e bash -c '
  /usr/local/bin/codex --dangerously-bypass-approvals-and-sandbox \
    --ephemeral \
    -C /mnt/d/SimpliSalonCLoud \
    --output-last-message /tmp/audit-booking-card.txt \
    exec "Read /mnt/d/SimpliSalonCLoud/components/calendar/booking-card.tsx.
Check each of the following — output PASS or FAIL with line number evidence:
1. ObjectLink inside card has stopPropagation (onClick e.stopPropagation or wrapper)
2. ObjectTrigger inside card has stopPropagation
3. Card body/background click handler navigates to booking detail
4. Long labels have CSS truncate or max-w
5. Cancelled/destructive booking has distinct visual state
6. ObjectTrigger has aria-haspopup and aria-expanded props
Output: bulleted PASS/FAIL list. Do not fix anything."
  cat /tmp/audit-booking-card.txt
'
```

### Pkg B+C — employees audit (dad-reviewer)

```bash
wsl -d worker-dad -e bash -c '
  /usr/local/bin/codex --dangerously-bypass-approvals-and-sandbox \
    --ephemeral \
    -C /mnt/d/SimpliSalonCLoud \
    --output-last-message /tmp/audit-employees.txt \
    exec "Read /mnt/d/SimpliSalonCLoud/app/(dashboard)/[slug]/employees/page.tsx and /mnt/d/SimpliSalonCLoud/app/(dashboard)/[slug]/employees/[id]/page.tsx.
For each file answer:
1. Does it import anything from @/components/objects/?
2. Do employee rows use ObjectCell, ObjectLink, or ObjectPill?
3. Is RelatedActionsMenu or RelatedActionsSheet rendered per employee?
4. If no objects used: what does it render instead? (plain td, Link, div?)
Output: YES/NO answers with line evidence. Do not fix anything."
  cat /tmp/audit-employees.txt
'
```

## Work packages

- ID: pkg-42-audit-booking | Type: review | Worker: dad-reviewer | Outputs: /tmp/audit-booking-card.txt
- ID: pkg-42-audit-employees | Type: review | Worker: dad-reviewer | Outputs: /tmp/audit-employees.txt

## Po audycie

Wyniki determinuja zakres sprintow 43 i nastepnych:
- Jesli booking-card ma FAILe → Sprint 43 to hardening booking-card
- Jesli employees juz uzywaja objects → Sprint 43 to tylko uzupelnienia
- Jesli employees nie uzywaja objects → Sprint 43 to pelna integracja

## Verification

```bash
# Ten sprint nie zmienia kodu — weryfikacja polega na przeczytaniu raportow z /tmp/
cat /tmp/audit-booking-card.txt
cat /tmp/audit-employees.txt
```

## Acceptance criteria

- [ ] Raport z booking-card: PASS/FAIL dla kazdego z 6 punktow
- [ ] Raport z employees: jasna odpowiedz YES/NO czy objects sa uzywane
- [ ] Claude przejrzal obydwa raporty przed dispatchem Sprintu 43
