# Sprint AF-13 — _default Theme — Pełna implementacja ComponentRegistry

> **⚡ Dispatch równolegle z:** [AF-08](AF-08-hcm-db-migration.md) · [AF-03](AF-03-workspace-modules-gating.md) · [AF-04](AF-04-calendar-module-manifest.md) · [AF-05](AF-05-employees-crm-manifests.md) · [AF-06](AF-06-absence-payroll-manifests.md)
> AF-13 startuje po AF-02 (potrzebuje `lib/themes/types.ts`), ale jest niezależny od całej Fazy 1 i AF-08.

## Cel
(P1) Kompletna implementacja `themes/_default/` — wszystkie komponenty z ComponentRegistry
opakowane w wrapper komponenty. Baza dla każdego nowego projektu i fallback
gdy nie ma dostarczonego theme'a.

## Architektura — dokumenty referencyjne

```bash
DAD_PROMPT="Read /mnt/d/SimpliSalonCLoud/docs/AppForge/THEME-SYSTEM.md. List ALL components in ComponentRegistry with their props interfaces. Do NOT skip any. FORMAT: table: component name | props interface name | key props. No summarizing." bash ~/.claude/scripts/dad-exec.sh
```

| Dokument | Dlaczego |
|----------|----------|
| `docs/AppForge/THEME-SYSTEM.md` | Pełna lista ComponentRegistry + props interfaces |

**Kluczowe constraints:**
- `themes/_default/` NIE zmienia istniejącego `components/ui/` — tylko wrappuje
- Każdy wrapper `className?: string` propagowany do root elementu
- DataTable wrapper: full TanStack Table (react-table) — nie stub
- Toast: używa istniejącego `sonner` jeśli zainstalowany (sprawdź package.json) lub własna implementacja
- Każdy plik to osobny komponent — jeden plik per komponent dla tree-shaking
- `themes/_default/index.ts` re-eksportuje wszystkie jako `registry: ComponentRegistry`

## Zakres

Komponenty do owinięcia (wszystkie shadcn/ui już zainstalowane):

**Batch A** (codex-main — formularze):
Button, Input, Select, Textarea, Checkbox, Switch, DatePicker, DateRangePicker, TimePicker, FormField, FormLabel, FormMessage

**Batch B** (codex-dad — data + overlays + nav):
DataTable (TanStack), Badge, Alert, Modal (Dialog), Sheet, ConfirmDialog, Tabs+TabsList+TabsTrigger+TabsContent, Popover, Tooltip, DropdownMenu

**Batch C** (codex-main — layout + feedback):
PageHeader, Card+CardHeader+CardContent, Section, Divider, Avatar, EmptyState, StatCard, FileUpload, Spinner, Skeleton, Breadcrumb

## Work packages

Wszystkie równolegle (niezależne komponenty).

- ID: pkg-forms | Type: implementation | Worker: codex-main
- ID: pkg-data-overlays | Type: implementation | Worker: codex-dad
- ID: pkg-layout-feedback | Type: implementation | Worker: codex-main (drugi dispatch)

Po zakończeniu wszystkich: Claude pisze `themes/_default/index.ts`.

## Prompt — codex-main (Batch A: formularze)

```bash
codex exec --dangerously-bypass-approvals-and-sandbox "Read .workflow/skills/scoped-implementation.md and follow it.
Read lib/themes/types.ts for exact Props interfaces (ButtonProps, InputProps, etc.).
Do NOT use Gemini — write directly.

Goal: Create _default theme form components — wrappers for shadcn/ui.

Directory: themes/_default/components/

Rules for ALL files:
- Import the shadcn component from @/components/ui/[name]
- Accept props from lib/themes/types.ts
- Propagate className prop
- 'use client' if component uses hooks or events
- Export as default AND named export

Files to create:
- Button.tsx: wrap @/components/ui/button — map variant prop (destructive|outline|ghost|link→shadcn variants), size prop, loading prop (shows Loader2 spinner + disabled), className
- Input.tsx: wrap @/components/ui/input — forward all InputProps + className
- Select.tsx: wrap @/components/ui/select — SelectRoot + SelectTrigger + SelectContent + SelectItem; accept options: Array<{value, label}>; value + onChange props
- Textarea.tsx: wrap @/components/ui/textarea — forward all TextareaProps
- Checkbox.tsx: wrap @/components/ui/checkbox — checked, onCheckedChange, label, className
- Switch.tsx: wrap @/components/ui/switch — checked, onCheckedChange, label, className
- DatePicker.tsx: wrap @/components/ui/popover + @/components/ui/calendar — value: Date?, onChange: (d:Date)=>void, placeholder
- DateRangePicker.tsx: same but value: {from: Date, to: Date}?, onChange: (range)=>void
- TimePicker.tsx: Input[type=time] wrapper with value: string (HH:MM), onChange
- FormField.tsx: div wrapper with consistent spacing, passes children
- FormLabel.tsx: wrap @/components/ui/label — required?: boolean (adds * suffix)
- FormMessage.tsx: p element with error styling, children: string|undefined (null if empty)

Constraints: className always last and merged with cn() utility if available.
Done when: all 12 files created, tsc passes."
```

## Prompt — codex-dad (Batch B: data + overlays)

```bash
DAD_PROMPT="Read .workflow/skills/scoped-implementation.md and follow it.
Read /mnt/d/SimpliSalonCLoud/lib/themes/types.ts for ComponentRegistry interfaces.
Check /mnt/d/SimpliSalonCLoud/package.json for available packages (@tanstack/react-table, sonner).

Goal: Create _default theme data display and overlay components.
Directory: /mnt/d/SimpliSalonCLoud/themes/_default/components/

Files:
- DataTable.tsx: Generic TanStack Table implementation
  Props: data[], columns (ColumnDef[]), onRowClick?, emptyState?, loading?, pagination?
  Use @tanstack/react-table (useReactTable, flexRender)
  If loading: show Skeleton rows (5 rows, full width)
  If empty: render emptyState prop or default 'Brak danych'
  Use @/components/ui/table for HTML structure

- Badge.tsx: wrap @/components/ui/badge — variant: default|success|warning|destructive|outline

- Alert.tsx: wrap @/components/ui/alert — variant: default|destructive; title?, description

- Modal.tsx: wrap @/components/ui/dialog — open, onOpenChange, title, description?, children, footer?
  ModalProps: { open: boolean; onOpenChange: (o:boolean)=>void; title: string; description?: string; children: ReactNode; footer?: ReactNode; size?: 'sm'|'md'|'lg' }

- Sheet.tsx: wrap @/components/ui/sheet — side: left|right|top|bottom; open, onOpenChange, title, children

- ConfirmDialog.tsx: Modal variant — message, onConfirm, onCancel, confirmLabel?, cancelLabel?, variant?: 'default'|'destructive'

- Tabs.tsx + TabsList.tsx + TabsTrigger.tsx + TabsContent.tsx: wrap @/components/ui/tabs

- Tooltip.tsx: wrap @/components/ui/tooltip — content, children

- DropdownMenu.tsx: wrap @/components/ui/dropdown-menu — trigger, items: Array<{label, icon?, onClick, variant?}>

- Popover.tsx: wrap @/components/ui/popover — trigger, content, align?, side?

Constraints: DataTable must be generic <TData>. className on root elements.
Done when: tsc passes." bash ~/.claude/scripts/dad-exec.sh
```

## Prompt — codex-main (Batch C: layout + feedback)

```bash
codex exec --dangerously-bypass-approvals-and-sandbox "Read .workflow/skills/scoped-implementation.md and follow it.
Read lib/themes/types.ts for layout and feedback Props interfaces.
Do NOT use Gemini — write directly.

Goal: Create _default theme layout and feedback components.
Directory: themes/_default/components/

Files:
- PageHeader.tsx: div with h1 title + optional description + optional actions (right side). Props: title, description?, actions?: ReactNode, breadcrumb?: { label, href }[]
- Card.tsx: wrap @/components/ui/card — variant: default|outlined|elevated (elevated adds shadow-md), padding: none|sm|default|lg
- CardHeader.tsx: wrap @/components/ui/card CardHeader — title, description?, actions?: ReactNode
- CardContent.tsx: wrap @/components/ui/card CardContent — children
- Section.tsx: section element with heading + divider + children. Props: title, description?, children
- Divider.tsx: hr element, optional label in center. Props: label?: string
- Avatar.tsx: wrap @/components/ui/avatar — src?, alt?, fallback (initials), size: sm|md|lg
- EmptyState.tsx: centered div with icon (Lucide), title, description, optional action button
  Props: icon: string (Lucide name), title, description, action?: { label, onClick }
- StatCard.tsx: Card with: label (small text), value (large), trend? ({ value: number, label }), icon?
- FileUpload.tsx: input[type=file] styled as drop zone. Props: accept?, multiple?, onFiles: (files: File[])=>void, label?
- Spinner.tsx: Lucide Loader2 with animate-spin. Props: size?: 'sm'|'md'|'lg', className?
- Skeleton.tsx: wrap @/components/ui/skeleton — w, h, className
- Breadcrumb.tsx: wrap @/components/ui/breadcrumb if available, else simple nav with chevrons

Constraints: EmptyState icon: dynamic Lucide render by name. StatCard trend: green if positive, red if negative.
Done when: tsc passes."
```

## Claude — index.ts (po zakończeniu wszystkich batchy)

```typescript
// themes/_default/index.ts — Claude pisze po zebraniu outputów
export { default as Button } from './components/Button'
// ... wszystkie importy
export const registry: ComponentRegistry = { Button, Input, ... }
export { tokens } from './tokens'
export default { registry, tokens }
```

## Verification

```bash
npx tsc --noEmit
# Sprawdź: loadTheme('_default') zwraca { registry, tokens } z wszystkimi polami
# Sprawdź: <DataTable data={[]} columns={[]} /> renderuje się bez błędów
# Sprawdź: registry.Button !== undefined (i każdy inny komponent)
```

## Acceptance criteria

- [ ] Wszystkie 35+ komponenty z ComponentRegistry mają implementację w `themes/_default/components/`
- [ ] DataTable: generyczny, TanStack Table, loading states, empty state
- [ ] `themes/_default/index.ts` eksportuje `{ registry: ComponentRegistry, tokens: DesignTokens }`
- [ ] `loadTheme('_default')` działa
- [ ] `npx tsc --noEmit` → clean
