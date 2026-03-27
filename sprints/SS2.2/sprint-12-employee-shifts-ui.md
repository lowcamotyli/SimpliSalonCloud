# Sprint SS2.2-12 — Employee Shifts: UI

## Cel
Ekran zarządzania zmianami pracownika — tab "Grafik" na `/employees/[id]` przestaje być placeholderem.
Widok tygodniowy zmian + przypisywanie ze szablonów + zarządzanie szablonami zmian.

## Architektura — dokumenty referencyjne

Przed dispatchem przeczytaj:
```bash
cat d:/SimpliSalonCLoud/app/\(dashboard\)/\[slug\]/employees/\[id\]/page.tsx \
  | gemini -p "TASK: Show exact tab structure, imports used, and how tabs are rendered. FORMAT: Bulleted list. LIMIT: Max 20 lines." \
  --output-format text 2>/dev/null | grep -v "^Loaded"
```

| Dokument | Dlaczego |
|----------|----------|
| `app/(dashboard)/[slug]/employees/[id]/page.tsx` | Struktura tabów — gdzie wchodzi nowy komponent |
| `components/employees/employee-services-tab.tsx` | Wzorzec istniejącego taba usług — ten sam styl |

## Stan aktualny po sprint-11
- API gotowe: `/api/shift-templates`, `/api/employees/[id]/shifts`
- Tab "Grafik" na stronie pracownika: placeholder — do zastąpienia
- Brak komponentu zarządzania zmianami

## Zakres tego sprintu

### Komponenty
- [ ] `EmployeeShiftsTab` — główny komponent taba Grafik
  - Nawigacja tygodniowa (poprzedni/następny tydzień)
  - Widok 7 dni: każdy dzień → przycisk "+" lub badge aktywnej zmiany
  - Kliknięcie dnia → dialog przypisania zmiany (ze szablonu lub ręcznie)
  - Kliknięcie zmiany → opcja usunięcia
- [ ] `ShiftAssignDialog` — dialog przypisania zmiany do dnia
  - Wybór szablonu (dropdown z listą szablonów + kolory)
  - LUB ręczne godziny (start_time + end_time)
  - Pole notes (opcjonalne)
  - Submit → POST /api/employees/[id]/shifts
- [ ] `ShiftTemplatesManager` — zarządzanie szablonami (panel w ustawieniach lub sekcja pod tabelą zmian)
  - Lista szablonów z kolorami i godzinami
  - Inline add / edit / soft-delete

### Hooki
- [ ] `useEmployeeShifts(employeeId, from, to)` — fetch zmian pracownika, mutate (add/delete)
- [ ] `useShiftTemplates()` — fetch szablonów, mutate (add/edit/delete)

## Pliki do stworzenia / modyfikacji

| Plik | Akcja | Worker |
|------|-------|--------|
| `components/employees/employee-shifts-tab.tsx` | CREATE (główny komponent) | codex-main |
| `components/employees/shift-assign-dialog.tsx` | CREATE | codex-dad |
| `components/employees/shift-templates-manager.tsx` | CREATE | codex-dad |
| `hooks/use-employee-shifts.ts` | CREATE | codex-dad |
| `hooks/use-shift-templates.ts` | CREATE | codex-dad |
| `app/(dashboard)/[slug]/employees/[id]/page.tsx` | EDIT (podłącz tab) | Claude |

## Zależności
- **Wymaga:** sprint-11 (API gotowe, typy wygenerowane)
- **Blokuje:** nic (feature kompletny po tym sprincie)

---

## Prompt — codex-main (EmployeeShiftsTab)

```bash
codex exec --dangerously-bypass-approvals-and-sandbox "Do NOT use Gemini — write directly.

Read components/employees/employee-services-tab.tsx and app/(dashboard)/[slug]/employees/[id]/page.tsx for context on component patterns and existing tab structure.

Goal: Create the main employee shifts tab component.
File: components/employees/employee-shifts-tab.tsx

Requirements:
'use client'

Props: { employeeId: string }

State:
- currentWeekStart: Date (Monday of current week via date-fns startOfWeek)
- Navigate: prev/next week buttons

Week grid (7 columns, Mon–Sun):
- Each day cell shows: day name (Pon/Wt/Śr/Czw/Pt/Sob/Nie) + date number
- If shift exists for that day: colored badge with template name + start_time–end_time + X button to delete
- If no shift: '+' button (ghost/outline) to open assign dialog
- Today highlighted with subtle background

Data fetching: use fetch() directly (no custom hook yet)
  GET /api/employees/${employeeId}/shifts?from=YYYY-MM-DD&to=YYYY-MM-DD
  Refetch on week navigation

ShiftAssignDialog (inline — single file):
- Simple dialog with:
  - Date display (readonly)
  - Select: 'Ze szablonu' tab → dropdown of templates (fetched from /api/shift-templates)
  - Manual tab: start_time input (type=time) + end_time input (type=time)
  - Notes: textarea (optional)
  - Submit: POST /api/employees/${employeeId}/shifts

Delete shift: DELETE /api/employees/${employeeId}/shifts/${shiftId} with confirm

Use shadcn/ui components:
- import { Button } from '@/components/ui/button'
- import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
- import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
- import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
- import { Textarea } from '@/components/ui/textarea'
- import { Badge } from '@/components/ui/badge'
- import { Label } from '@/components/ui/label'
- import { Input } from '@/components/ui/input'

Color mapping: render shift badge with background color from template.color (inline style)

Explicit return types on exported functions.
Done when: file created with weekly grid + assign dialog + delete."
```

---

## Prompt — codex-dad (hooks + ShiftTemplatesManager)

```bash
DAD_PROMPT="Read components/employees/employee-shifts-tab.tsx for context on data shapes used.

Goal: Create hooks and ShiftTemplatesManager component for the shift management system.
Files:
- /mnt/d/SimpliSalonCLoud/hooks/use-employee-shifts.ts
- /mnt/d/SimpliSalonCLoud/hooks/use-shift-templates.ts
- /mnt/d/SimpliSalonCLoud/components/employees/shift-templates-manager.tsx

=== File 1: hooks/use-employee-shifts.ts ===
'use client'
useEmployeeShifts(employeeId: string, from: string, to: string)
- Fetch GET /api/employees/${employeeId}/shifts?from=${from}&to=${to}
- Return: { shifts: EmployeeShift[], isLoading, error, addShift, deleteShift }
- addShift(data: AddShiftInput): POST, optimistic update, revalidate
- deleteShift(shiftId: string): DELETE, optimistic update, revalidate

interface EmployeeShift { id: string; employee_id: string; shift_template_id: string | null; date: string; start_time: string; end_time: string; notes: string | null; template?: { name: string; color: string } | null }
interface AddShiftInput { date: string; shift_template_id?: string; start_time?: string; end_time?: string; notes?: string }

=== File 2: hooks/use-shift-templates.ts ===
'use client'
useShiftTemplates()
- Fetch GET /api/shift-templates
- Return: { templates: ShiftTemplate[], isLoading, error, createTemplate, updateTemplate, deleteTemplate }
- createTemplate(data): POST /api/shift-templates
- updateTemplate(id, data): PATCH /api/shift-templates/${id}
- deleteTemplate(id): DELETE /api/shift-templates/${id}

interface ShiftTemplate { id: string; name: string; start_time: string; end_time: string; color: string; is_active: boolean }

=== File 3: components/employees/shift-templates-manager.tsx ===
'use client'
Props: none (fetches own data via useShiftTemplates)

UI:
- Title 'Szablony zmian' + 'Dodaj szablon' button
- List of active templates: colored dot + name + 'HH:MM – HH:MM' + edit icon + delete icon
- Inline add form (shows on 'Dodaj szablon' click): name input, start_time (type=time), end_time (type=time), color picker (6 preset colors as swatches), Save + Cancel
- Edit: same inline form per row
- Delete: soft-delete via deleteTemplate hook

Use shadcn/ui:
- import { Button } from '@/components/ui/button'
- import { Input } from '@/components/ui/input'
- import { Label } from '@/components/ui/label'
- import { Badge } from '@/components/ui/badge'

Preset colors: ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899']

Done when: all three files created with proper TypeScript types." bash ~/.claude/scripts/dad-exec.sh
```

---

## Edit — Claude (podłącz tab w employee detail page)

Po wygenerowaniu komponentów, Claude edytuje `app/(dashboard)/[slug]/employees/[id]/page.tsx`:

1. Dodaj import `EmployeeShiftsTab` z `@/components/employees/employee-shifts-tab`
2. Dodaj import `ShiftTemplatesManager` z `@/components/employees/shift-templates-manager`
3. Zastąp placeholder w tabie "Grafik" komponentem `<EmployeeShiftsTab employeeId={params.id} />`
4. Poniżej taba "Grafik" (lub jako osobna sekcja na dole) dodaj `<ShiftTemplatesManager />`

---

## Po wykonaniu

```bash
# TypeScript check
npx tsc --noEmit

# dad review (opcjonalny — brak efektów ubocznych)
# Pomiń review — komponenty UI, brak I/O poza fetch
```

## Done when
- Tab "Grafik" na `/employees/[id]` pokazuje tygodniowy widok zmian
- Można przypisać zmianę do dnia (ze szablonu lub ręcznie)
- Można usunąć zmianę z dnia
- Szablony można tworzyć / edytować / usuwać (soft delete)
- `tsc --noEmit` clean
