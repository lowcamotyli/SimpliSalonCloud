# Sprint SS2.4-47 - Booksy table + Forms + Remaining components

## Cel

Pozostale komponenty ktore renderuja obiekty: tabela Booksy (klienci z zewnetrznych importow),
widok zgloszen formularzy (klient + usluga), oraz ewentualne inne miejsca znalezione podczas
sprintu. Mniejsze pliki — wszystko rownolegle.

Zaleznosc: Sprint 41 zamkniety. Sprinty 43-46 moga isca rownolegle.

## Architektura - dokumenty referencyjne

Brak — sprint UI only.

## Zdiagnozowane problemy

- [ ] `BooksyRecentBookingsTable.tsx` (148 linii) — tabela importow Booksy, klienci bez interaktywnosci
- [ ] `forms/submission-view-dialog.tsx` — dialog zgloszen formularzy, powiazany klient/usluga
- [ ] Sprawdzic czy sa inne komponenty w `/components/` nie objete poprzednimi sprintami

## Zakres

### A — Booksy table (codex-main)

Plik: `components/integrations/booksy/BooksyRecentBookingsTable.tsx` (148 linii)

- [ ] Zaimportuj `ObjectCell` z `@/components/objects`
- [ ] Kolumna klient: zamien na `<ObjectCell type="client" id={b.client_id} label={b.client_name} slug={slug} showActions={false} />`
- [ ] Jesli sa kolumny pracownik lub usluga — tez zamien na ObjectLink/ObjectPill
- [ ] Nie zmieniac logiki synchronizacji, statusow, dat

### B — Forms submissions dialog (codex-main, rownolegle z A)

Plik: `components/forms/submission-view-dialog.tsx`

- [ ] Sprawdz aktualny rendering — czy dialog pokazuje klienta lub usluge?
- [ ] Jesli tak: dodaj ObjectLink dla klienta, ObjectPill dla uslugi
- [ ] Nie zmieniac struktury formularza ani wyswietlania odpowiedzi

### C — Scan remaining (dad-reviewer, --ephemeral)

Sprawdz czy sa jeszcze komponenty ktore renderuja obiekty bez interaktywnosci:
- `components/dashboard/` — widgety
- `components/crm/` — kampanie, wiadomosci
- `components/forms/` — inne dialogi
- `app/(dashboard)/[slug]/reports/page.tsx`

Output: lista plikow z "renderuje X object type bez ObjectCell/ObjectLink" lub "OK".

## Dispatch commands

### Pkg A — booksy table (codex-main)

```bash
codex exec --dangerously-bypass-approvals-and-sandbox "Read .workflow/skills/scoped-implementation.md and follow it.
Read components/integrations/booksy/BooksyRecentBookingsTable.tsx for full context.
Read components/objects/index.ts to see ObjectCell.

Goal: Add ObjectCell for clients in Booksy recent bookings table.

File: components/integrations/booksy/BooksyRecentBookingsTable.tsx

Changes:
1. Import ObjectCell, ObjectLink, ObjectPill from '@/components/objects'.
2. Find client name column — replace with <ObjectCell type='client' id={b.client_id} label={b.client_name ?? 'Klient'} slug={slug} showActions={false} />
3. If employee column exists: <ObjectLink type='worker' id={b.employee_id} label={b.employee_name} slug={slug} showDot />
4. If service column exists: <ObjectPill type='service' id={b.service_id} label={b.service_name} slug={slug} />
5. slug — check how it comes in (prop or params) and use accordingly.

Constraints:
- Do NOT change sync logic, status badges, date columns, or pagination
Done when: npx tsc --noEmit passes." < /dev/null
```

### Pkg B — forms submission dialog (codex-main, rownolegle z A)

```bash
codex exec --dangerously-bypass-approvals-and-sandbox "Read .workflow/skills/scoped-implementation.md and follow it.
Read components/forms/submission-view-dialog.tsx for full context.
Read components/objects/index.ts to see ObjectLink, ObjectPill.

Goal: If the dialog shows client or service references, make them interactive ObjectLink/ObjectPill.

File: components/forms/submission-view-dialog.tsx

Changes:
1. Import ObjectLink, ObjectPill from '@/components/objects'.
2. Find any place where client name or service name is rendered.
3. Replace client name with <ObjectLink type='client' id={clientId} label={clientName} slug={slug} />
4. Replace service name with <ObjectPill type='service' id={serviceId} label={serviceName} slug={slug} />
5. If neither client nor service is rendered in this dialog — make NO changes and report that.

Constraints:
- Do NOT change form field rendering or answer display
- Do NOT change dialog open/close logic
Done when: npx tsc --noEmit passes." < /dev/null
```

### Pkg C — remaining scan (dad-reviewer)

```bash
wsl -d worker-dad -e bash -c '
  /usr/local/bin/codex --dangerously-bypass-approvals-and-sandbox \
    --ephemeral \
    -C /mnt/d/SimpliSalonCLoud \
    --output-last-message /tmp/scan-remaining.txt \
    exec "Check these files for object rendering WITHOUT using components/objects:
- /mnt/d/SimpliSalonCLoud/components/dashboard/ (all files)
- /mnt/d/SimpliSalonCLoud/components/crm/ (all files)
- /mnt/d/SimpliSalonCLoud/app/(dashboard)/[slug]/reports/page.tsx

For each file: does it render client/worker/service/booking names as plain text or Link without ObjectCell/ObjectLink/ObjectPill? Answer YES/NO per file with a one-line description of what is rendered.
Output: bulleted list. Do not fix."
  cat /tmp/scan-remaining.txt
'
```

## Work packages

- ID: pkg-47-booksy | Type: implementation | Worker: codex-main | Inputs: BooksyRecentBookingsTable.tsx | Outputs: ObjectCell w tabeli Booksy
- ID: pkg-47-forms | Type: implementation | Worker: codex-main | Inputs: submission-view-dialog.tsx | Outputs: ObjectLink/ObjectPill w dialogu
- ID: pkg-47-scan | Type: review | Worker: dad-reviewer | Outputs: /tmp/scan-remaining.txt — lista pozostalych plikow

## Verification

```bash
npx tsc --noEmit
cat /tmp/scan-remaining.txt
# Test manualny: Booksy → tabela ostatnich rezerwacji → klik w klienta → /clients/[id]
```

## Acceptance criteria

- [ ] BooksyRecentBookingsTable: klient jako ObjectCell z klikalna nazwa
- [ ] Forms submission dialog: jesli renderuje klienta/usluge — jako ObjectLink/ObjectPill
- [ ] Scan raport dostarczony — Claude ocenia czy sprint dodatkowy jest potrzebny
- [ ] `npx tsc --noEmit` → clean
