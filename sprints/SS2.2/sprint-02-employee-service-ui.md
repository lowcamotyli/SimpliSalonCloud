# Sprint SS2.2-02 — Employee-Service Assignment: UI

## Cel
UI do zarządzania przypisanymi usługami pracownika + filtrowanie pracowników w kalendarzu/bookingu po wybranej usłudze.

## Architektura — dokumenty referencyjne

Przed dispatchem przeczytaj:
```bash
gemini -p "Read docs/architecture/bounded-contexts.md and docs/architecture/service-architecture.md. Summarize: (1) which bounded context owns employee-service assignment, (2) how UI components interact with API layer, (3) any constraints for booking flow changes." --output-format text 2>/dev/null | grep -v "^Loaded"
```

| Dokument | Dlaczego |
|----------|----------|
| `docs/architecture/bounded-contexts.md` | "Staff & Operations" — owner kontekstu dla employee-service |
| `docs/architecture/service-architecture.md` | Granice między domenami, jak booking context korzysta z employee data |

**Kluczowe constraints:**
- Booking form nie może bezpośrednio querować `employee_services` — powinien używać dedykowanego API endpoint (`GET /api/employees?serviceId=`)
- Employee data (usługi) jest częścią "Staff & Operations" bounded context — UI w profilu pracownika, nie w ustawieniach usługi
- Zmiana w booking flow nie może naruszać backward compatibility: pracownicy bez przypisań muszą nadal działać

## Stan aktualny
- Sprint-01 dostarcza: tabela `employee_services` + API
- Profil pracownika: brak zakładki "Usługi"
- Booking dialog: lista pracowników nie filtruje po wybranej usłudze
- `app/(dashboard)/[slug]/employees/[id]/page.tsx` — istnieje, nieznany stan zakładek

## Zakres tego sprintu
- [ ] Komponent `EmployeeServicesTab` — przypisywanie/odpisywanie usług pracownikowi
- [ ] Integracja w profilu pracownika (nowa zakładka "Usługi")
- [ ] Booking form: po wyborze usługi — filtruj listę pracowników do tych którzy ją wykonują

## Pliki do stworzenia / modyfikacji

| Plik | Akcja | Worker |
|------|-------|--------|
| `components/employees/employee-services-tab.tsx` | CREATE | codex-main |
| `app/(dashboard)/[slug]/employees/[id]/page.tsx` | EDIT (nowa zakładka) | codex-dad |
| `components/calendar/booking-form.tsx` lub equiv. | EDIT (filtr pracowników) | codex-dad |

> **Przed dispatchem:** sprawdź nazwę aktualnego komponentu booking form:
> ```bash
> find app components -name "*booking*form*" -o -name "*new-booking*" | grep -v .next | grep -v node_modules
> ```

## Zależności
- **Wymaga:** sprint-01 (API endpoint `/api/employees/[id]/services`)

---

## Prompt — codex-main (EmployeeServicesTab)

```bash
codex exec --dangerously-bypass-approvals-and-sandbox "Do NOT use Gemini — write directly.

Read app/api/employees/[id]/services/route.ts for API shape.
Read components/services/addons-editor.tsx for UI pattern reference (similar list+add pattern).

Goal: Create EmployeeServicesTab component for managing which services an employee can perform.
File: components/employees/employee-services-tab.tsx

Requirements:
- Props: { employeeId: string; salonSlug: string }
- Fetch current assigned services: GET /api/employees/[employeeId]/services
- Fetch all salon services: GET /api/services (for the assignment picker)
- Show assigned services as removable badges/rows (name, duration, price)
- Add service: combobox/select showing unassigned services → POST /api/employees/[id]/services
- Remove: button per row → DELETE /api/employees/[id]/services?serviceId=...
- Loading/empty states
- Owner/manager only — check role with useCurrentRole hook (hooks/use-current-role.ts)
- Use shadcn/ui components: Card, Badge, Button, Command/Combobox
- Import shadcn from individual paths (e.g. @/components/ui/card), NOT barrel import
Done when: component renders, assigns and removes services."
```

---

## Prompt — codex-dad (profil pracownika — nowa zakładka)

> Przed dispatchem: sprawdź rozmiar `app/(dashboard)/[slug]/employees/[id]/page.tsx`

```bash
DAD_PROMPT="Read app/(dashboard)/[slug]/employees/[id]/page.tsx.

Goal: Add 'Usługi' tab to employee profile page.
File: /mnt/d/SimpliSalonCLoud/app/(dashboard)/[slug]/employees/[id]/page.tsx

Add a new tab 'Usługi' to the existing Tabs component.
Tab content: <EmployeeServicesTab employeeId={employeeId} salonSlug={params.slug} />
Import EmployeeServicesTab from components/employees/employee-services-tab.
Do not change existing tabs or logic.

Done when: 'Usługi' tab visible in employee profile." bash ~/.claude/scripts/dad-exec.sh
```

---

## Prompt — codex-dad (booking form — filtr pracowników)

> **Przed dispatchem:** znajdź właściwy komponent booking form (patrz uwaga powyżej).

```bash
DAD_PROMPT="Read [BOOKING_FORM_COMPONENT] for context.

Goal: Filter employee dropdown by selected service in booking form.
File: /mnt/d/SimpliSalonCLoud/[BOOKING_FORM_COMPONENT]

When a service is selected in the booking form:
- Fetch /api/employees/[id]/services for each employee OR add a new endpoint GET /api/employees?serviceId= that returns only employees who can perform the service (prefer the latter if cleaner)
- Filter the employee select/combobox to only show matching employees
- If an employee has no service assignments at all (backwards compat), include them in the list
- If previously selected employee no longer matches new service, clear employee selection
- Do not change other booking form logic

Done when: employee list filters dynamically after service selection." bash ~/.claude/scripts/dad-exec.sh
```

---

## Po wykonaniu

```bash
npx tsc --noEmit
```

## Done when
- Profil pracownika ma zakładkę "Usługi" z działającym assign/remove
- Booking form filtruje pracowników po wybranej usłudze
- `tsc --noEmit` clean
