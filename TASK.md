# TASK — L2-B: Treatment Records UI — 2026-03-13

## Objective
Zbudować UI do tworzenia i przeglądania kart zabiegowych w dashboardzie.
Zaszyfrować `notes_encrypted` w API (AES-256-GCM). Połączyć booking dialog z nowym formularzem.

## Sprint file
`docs/sprints/L2-B_treatment-records-ui.md` — pełna specyfikacja, prompty, typy

## Status

### Sesja 1
- [ ] NEXT Encrypt notes_encrypted w POST — `app/api/treatment-records/route.ts` (Claude, ~15 linii)
- [ ] NEXT Decrypt notes_encrypted w GET [id] — `app/api/treatment-records/[id]/route.ts` (Claude, ~15 linii)
- [ ] TODO Strona lista kart — `app/(dashboard)/[slug]/clients/[id]/treatment-records/page.tsx` (Gemini, ~180 linii)

### Sesja 2
- [ ] TODO Formularz nowej karty — `.../treatment-records/new/page.tsx` (Gemini, ~200 linii)
- [ ] TODO Widok pojedynczej karty — `.../treatment-records/[recordId]/page.tsx` (Gemini, ~150 linii)

### Sesja 3
- [ ] TODO Link z bookingu do listy kart — `components/calendar/booking-dialog.tsx` (Codex, ~20 linii)
- [ ] TODO tsc check + fixy (Claude)

## Resume command
```
Przeczytaj docs/sprints/L2-B_treatment-records-ui.md.
Sprawdź: ls app/(dashboard)/[slug]/clients/[id]/treatment-records/
Sprawdź: grep -n 'encryptField' app/api/treatment-records/route.ts
Kontynuuj od pierwszego niezamkniętego task.
```
