# Sprint AF-10 — HCM UI — Employee Detail z zakładkami

> **⚡ Dispatch równolegle z:** [AF-12](AF-12-time-tracking-ui.md)
> AF-10 (HCM UI) i AF-12 (Time Tracking UI) są niezależne — osobne moduły, osobne strony.

## Cel
(P2) UI dla modułu HCM: lista pracowników, szczegóły pracownika z zakładkami
(Przegląd, Kontrakty, Dokumenty, Dane osobowe). Zakładki Absence i Payroll
wypełniane przez slot system (stubs z AF-06, tutaj podpinamy realne).

## Architektura — dokumenty referencyjne

```bash
DAD_PROMPT="Read /mnt/d/SimpliSalonCLoud/docs/AppForge/THEME-SYSTEM.md and /mnt/d/SimpliSalonCLoud/docs/AppForge/MODULE-SYSTEM.md. List: (1) useComponents() rule for modules, (2) ModuleSlot usage in employee detail, (3) ComponentRegistry components available for forms and tabs. FORMAT: Bulleted list." bash ~/.claude/scripts/dad-exec.sh
```

| Dokument | Dlaczego |
|----------|----------|
| `docs/AppForge/THEME-SYSTEM.md` | useComponents() — obowiązuje w modules/employees/components/ |
| `docs/AppForge/MODULE-SYSTEM.md` | ModuleSlot — absence i payroll wstrzykują zakładki |
| `docs/AppForge/SECURITY.md` | permission checks w UI (employees:view_sensitive gating) |

**Kluczowe constraints:**
- Wszystkie komponenty w `modules/employees/components/` używają WYŁĄCZNIE `useComponents()` — ZAKAZ bezpośrednich importów `@/components/ui/*`
- `ModuleSlot` dla zakładek Absence i Payroll — EmployeeDetail nie wie o tych modułach
- Dane wrażliwe (demographics) — ukryj sekcję jeśli brak permissions:employees:view_sensitive
- Upload dokumentów: presigned URL z API, upload z przeglądarki bezpośrednio do Storage
- Lista pracowników: prosty widok z status badge, hire_date, email

## Zakres

| Plik | Worker | Zawartość |
|------|--------|-----------|
| `modules/employees/components/EmployeeList.tsx` | codex-main | Lista z tabeli DataTable, link do detalu |
| `modules/employees/components/EmployeeDetail.tsx` | codex-dad | Tabs: Przegląd, Kontrakty, Dokumenty, + ModuleSlots |
| `modules/employees/components/EmployeeForm.tsx` | codex-main | Formularz tworzenia/edycji (podstawowe dane) |
| `modules/employees/components/ContractForm.tsx` | codex-dad | Formularz kontraktu |
| `modules/employees/components/DocumentUpload.tsx` | codex-main | Presigned upload flow |
| `app/(dashboard)/[slug]/hr/employees/page.tsx` | codex-main | Strona listy (importuje EmployeeList) |
| `app/(dashboard)/[slug]/hr/employees/[id]/page.tsx` | codex-main | Strona detalu (importuje EmployeeDetail) |

## Work packages

- ID: pkg-list-form | Type: implementation | Worker: codex-main
  Outputs: EmployeeList, EmployeeForm, DocumentUpload, page.tsx, [id]/page.tsx

- ID: pkg-detail-contracts | Type: implementation | Worker: codex-dad
  Outputs: EmployeeDetail, ContractForm

Oba równolegle (niezależne komponenty).

## Prompt — codex-main (list + pages)

```bash
codex exec --dangerously-bypass-approvals-and-sandbox "Read .workflow/skills/scoped-implementation.md and follow it.
Read docs/AppForge/THEME-SYSTEM.md — CRITICAL: all components use useComponents() only.
Read lib/themes/types.ts for ComponentRegistry members.
Do NOT use Gemini — write directly.

Goal: Create HCM employee list UI and page files.

CRITICAL RULE: In modules/employees/components/* — use ONLY useComponents() hook. NEVER import from @/components/ui/*.

File 1: modules/employees/components/EmployeeList.tsx ('use client')
- Import useComponents from @/lib/themes
- Props: none (fetches own data from /api/hr/employees)
- Use DataTable with columns: name (first+last), email, phone, status (Badge), hire_date, actions (edit link)
- Status badge: active=success, inactive=neutral, on_leave=warning
- Row click → router.push to /[slug]/hr/employees/[id]
- Loading: Skeleton rows
- Empty: EmptyState component

File 2: modules/employees/components/EmployeeForm.tsx ('use client')
- Props: employeeId? (edit mode), onSuccess: () => void
- Fields: firstName*, lastName*, email, phone, hireDate, status (select)
- Uses FormField, Input, Select, Button from useComponents()
- POST to /api/hr/employees (create) or PATCH to /api/hr/employees/[id] (edit)

File 3: modules/employees/components/DocumentUpload.tsx ('use client')
- Props: employeeId: string
- List of documents (fetch /api/hr/employees/[id]/documents)
- Upload flow: POST to get presigned URL → PUT to URL with file
- Show: name, category badge, expires_at (red if expired), download link, delete button
- Category select: id_card, cv, certificate, contract_scan, other

File 4: app/(dashboard)/[slug]/hr/employees/page.tsx (Server Component)
- Import EmployeeList from modules/employees/components
- PageHeader with 'Dodaj pracownika' button (opens EmployeeForm in Modal)

File 5: app/(dashboard)/[slug]/hr/employees/[id]/page.tsx (Server Component)
- Import EmployeeDetail from modules/employees/components
- Pass employeeId from params

Constraints: NO direct @/components/ui/* imports in modules/employees/components/*
Done when: tsc passes."
```

## Prompt — codex-dad (EmployeeDetail + ContractForm)

```bash
DAD_PROMPT="Read .workflow/skills/scoped-implementation.md and follow it.
Read /mnt/d/SimpliSalonCLoud/docs/AppForge/THEME-SYSTEM.md — CRITICAL: useComponents() only in modules/.
Read /mnt/d/SimpliSalonCLoud/docs/AppForge/MODULE-SYSTEM.md for ModuleSlot usage.
Read /mnt/d/SimpliSalonCLoud/lib/modules/slots.ts for ModuleSlot component.
Read /mnt/d/SimpliSalonCLoud/lib/themes/types.ts for ComponentRegistry.

Goal: Create EmployeeDetail (tabs) and ContractForm.

CRITICAL RULE: In modules/employees/components/* — useComponents() ONLY. No @/components/ui/* imports.

File 1: /mnt/d/SimpliSalonCLoud/modules/employees/components/EmployeeDetail.tsx ('use client')
- Props: employeeId: string
- Fetches employee, contracts list, documents list from API
- Uses Tabs, TabsList, TabsTrigger, TabsContent from useComponents()
- Tab 1: 'Przegląd' — basic info (name, email, phone, status, hire_date), edit button → EmployeeForm
- Tab 2: 'Kontrakty' — list of contracts, current badge, 'Nowy kontrakt' button → ContractForm modal
- Tab 3: 'Dokumenty' — DocumentUpload component
- Tab 4: 'Dane osobowe' — demographics form (only if useHasPermission('employees:view_sensitive'))
  Show 403 message if no permission. Fields: dateOfBirth, nationality, address, emergencyContact.
- After own tabs: render ModuleSlot for 'employees:detail-tab-trigger' (for absence, payroll injection)
- Corresponding ModuleSlot for 'employees:detail-tab-content'

File 2: /mnt/d/SimpliSalonCLoud/modules/employees/components/ContractForm.tsx ('use client')
- Props: employeeId: string, contract?: Contract (edit mode), onSuccess: () => void
- Fields: contractType (select: employment/b2b/civil_law/other), startDate*, endDate,
  position*, department, salaryGross, workingHours, isCurrent (switch), signedAt, notes
- POST to /api/hr/employees/[id]/contracts or PATCH to /[id]/contracts/[contractId]

Constraints: No direct @/components/ui/* imports. ModuleSlot renders null for unregistered slots.
Done when: tsc passes." bash ~/.claude/scripts/dad-exec.sh
```

## Verification

```bash
npx tsc --noEmit
# Test: /hr/employees → lista pracowników z DataTable
# Test: /hr/employees/[id] → tabs: Przegląd, Kontrakty, Dokumenty, Dane osobowe
# Test: zakładka Dane osobowe ukryta jeśli brak employees:view_sensitive
# Test: ModuleSlot 'employees:detail-tab' → null (jeszcze nie zarejestrowany)
# Test: upload dokumentu → presigned URL → plik w Storage
```

## Acceptance criteria

- [ ] `/hr/employees` — lista z DataTable, status badges, link do detalu
- [ ] `/hr/employees/[id]` — 4 zakładki (przegląd, kontrakty, dokumenty, dane osobowe)
- [ ] Dane osobowe chronione permission gate w UI
- [ ] DocumentUpload: presigned URL flow działa
- [ ] ModuleSlot renderuje się (null gdy brak fillera — ready for Absence/Payroll)
- [ ] ZERO bezpośrednich importów z `@/components/ui/*` w `modules/employees/components/`
- [ ] `npx tsc --noEmit` → clean
