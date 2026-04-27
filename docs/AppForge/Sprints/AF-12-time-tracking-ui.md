# Sprint AF-12 — Time Tracking UI

> **⚡ Dispatch równolegle z:** [AF-10](AF-10-hcm-ui.md)
> AF-12 (Time Tracking UI) i AF-10 (HCM UI) są niezależne — osobne moduły, osobne strony.

## Cel
(P2) UI modułu Time Tracking: widok ewidencji czasu, clock in/out widget,
lista wpisów i arkusze. Zakładka w Employee Detail (wypełnia slot z AF-10).

## Architektura — dokumenty referencyjne

```bash
DAD_PROMPT="Read /mnt/d/SimpliSalonCLoud/docs/AppForge/THEME-SYSTEM.md and /mnt/d/SimpliSalonCLoud/docs/AppForge/MODULE-SYSTEM.md. List: (1) useComponents() rule, (2) how to register a slot filler with registerSlotFiller(), (3) ComponentRegistry components suitable for time tracking (StatCard, DataTable, Badge). FORMAT: Bulleted list." bash ~/.claude/scripts/dad-exec.sh
```

| Dokument | Dlaczego |
|----------|----------|
| `docs/AppForge/THEME-SYSTEM.md` | useComponents() — obowiązkowe w modules/time-tracking/components/ |
| `docs/AppForge/MODULE-SYSTEM.md` | registerSlotFiller() — podpięcie zakładki w Employee Detail |

**Kluczowe constraints:**
- `registerSlotFiller('employees:detail-tab-trigger', TimeTrackingTabTrigger)` wywoływane w module init
- Clock In/Out widget: zegar live (useEffect/setInterval), aktywna sesja z Server Actions
- Manager widzi wszystkich pracowników, employee widzi tylko siebie
- Timesheet status badge: open=neutral, submitted=warning, approved=success, locked=destructive

## Zakres

| Plik | Worker | Zawartość |
|------|--------|-----------|
| `modules/time-tracking/components/ClockWidget.tsx` | codex-main | Clock in/out button + live timer |
| `modules/time-tracking/components/TimeEntryList.tsx` | codex-main | DataTable z wpisami, approve button |
| `modules/time-tracking/components/TimesheetView.tsx` | codex-dad | Arkusz tygodniowy/miesięczny + submit |
| `modules/time-tracking/components/EmployeeTimeTab.tsx` | codex-main | Slot filler dla employees:detail-tab |
| `modules/time-tracking/index.ts` | codex-main | registerSlotFiller wywołanie |
| `app/(dashboard)/[slug]/time-tracking/page.tsx` | codex-main | Strona modułu (manager view) |

## Work packages

- ID: pkg-clock-entries | Type: implementation | Worker: codex-main
  Outputs: ClockWidget, TimeEntryList, EmployeeTimeTab, index.ts, page.tsx

- ID: pkg-timesheet | Type: implementation | Worker: codex-dad
  Outputs: TimesheetView

Oba równolegle.

## Prompt — codex-main (clock + entries + page)

```bash
codex exec --dangerously-bypass-approvals-and-sandbox "Read .workflow/skills/scoped-implementation.md and follow it.
Read docs/AppForge/THEME-SYSTEM.md — CRITICAL: useComponents() only in modules/time-tracking/components/.
Read lib/themes/types.ts for ComponentRegistry.
Read lib/modules/slots.ts for registerSlotFiller.
Do NOT use Gemini — write directly.

CRITICAL: In modules/time-tracking/components/* — ONLY useComponents(). Never @/components/ui/*.

File 1: modules/time-tracking/components/ClockWidget.tsx ('use client')
- Props: employeeId?: string (if manager, can select employee)
- Fetch active session: GET /api/time-tracking/entries?employeeId=&active=true
- Show: if active session → green badge 'Pracujesz: HH:MM:SS' (live timer with setInterval) + 'Clock Out' button
         if no session → 'Clock In' button
- Clock In: POST /api/time-tracking/clock-in
- Clock Out: POST /api/time-tracking/clock-out with optional notes input
- Use: Button, Badge, Spinner from useComponents()

File 2: modules/time-tracking/components/TimeEntryList.tsx ('use client')
- Props: employeeId?: string, showApproveActions?: boolean
- Fetch: GET /api/time-tracking/entries with date range filter (last 30 days default)
- DataTable columns: date, clocked_in, clocked_out, duration (computed), break, notes, status (Badge), actions
- Manager: 'Zatwierdź' button → POST /api/time-tracking/entries/[id]/approve
- Status: pending=warning, approved=success, rejected=destructive
- Date range filter: DateRangePicker from useComponents()

File 3: modules/time-tracking/components/EmployeeTimeTab.tsx ('use client')
- Props: employeeId: string
- Shows: ClockWidget for this employee + TimeEntryList for last 30 days
- This component is the slot filler for 'employees:detail-tab-content'
- TabTrigger text: 'Czas pracy', icon: Clock

File 4: modules/time-tracking/index.ts
- Import registerSlotFiller from lib/modules/slots
- Import EmployeeTimeTabTrigger, EmployeeTimeTab from ./components/EmployeeTimeTab
- Call: registerSlotFiller('employees:detail-tab-trigger', EmployeeTimeTabTrigger)
- Call: registerSlotFiller('employees:detail-tab-content', EmployeeTimeTab)

File 5: app/(dashboard)/[slug]/time-tracking/page.tsx (Server Component)
- PageHeader: 'Ewidencja czasu'
- For managers: show ClockWidget (all employees selector) + TimeEntryList
- Import from modules/time-tracking/components

Constraints: No @/components/ui/* in modules/. registerSlotFiller called at module init.
Done when: tsc passes."
```

## Prompt — codex-dad (TimesheetView)

```bash
DAD_PROMPT="Read .workflow/skills/scoped-implementation.md and follow it.
Read /mnt/d/SimpliSalonCLoud/docs/AppForge/THEME-SYSTEM.md — useComponents() rule.
Read /mnt/d/SimpliSalonCLoud/lib/themes/types.ts for Tabs, StatCard, Badge, Button components.

Goal: Create TimesheetView component.
File: /mnt/d/SimpliSalonCLoud/modules/time-tracking/components/TimesheetView.tsx ('use client')

Component purpose: Show monthly timesheet for an employee with summary stats and submit action.

Props: employeeId: string, year: number, month: number (1-12)

Functionality:
1. Fetch timesheet: GET /api/time-tracking/timesheets?employeeId=&periodStart=&periodEnd=
   If not found → show 'Brak arkusza' with 'Utwórz' button → POST to create
2. Show StatCards (3): total hours this month, approved hours, pending hours
3. Show weekly breakdown table: week number | days worked | hours | status
4. Status badge: open=neutral, submitted=warning, approved=success, locked=destructive
5. Action buttons:
   - If status='open': 'Prześlij do zatwierdzenia' → POST /api/time-tracking/timesheets/[id]/submit
   - If status='submitted': 'Oczekuje na zatwierdzenie' (disabled)
   - If status='approved'/'locked': read-only
6. Month navigation: prev/next month buttons

Use ONLY useComponents() for all UI elements.
Constraints: No @/components/ui/* imports." bash ~/.claude/scripts/dad-exec.sh
```

## Verification

```bash
npx tsc --noEmit
# Test: /time-tracking → widok z ClockWidget + TimeEntryList
# Test: Clock In → aktywna sesja widoczna z timerem
# Test: Clock Out → wpis zakończony, duration computed
# Test: /hr/employees/[id] → zakładka 'Czas pracy' pojawia się (slot filled)
# Test: pracownik nie widzi wpisów innych pracowników
```

## Acceptance criteria

- [ ] ClockWidget: live timer podczas aktywnej sesji
- [ ] TimeEntryList: manager może zatwierdzić wpisy
- [ ] EmployeeTimeTab rejestruje się jako slot filler dla `employees:detail-tab`
- [ ] TimesheetView: StatCards + submit flow + status badges
- [ ] `/time-tracking` strona dostępna dla manager/owner
- [ ] ZERO bezpośrednich importów z `@/components/ui/*` w `modules/time-tracking/components/`
- [ ] `npx tsc --noEmit` → clean
