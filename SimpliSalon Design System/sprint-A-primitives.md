# Sprint A — Primitive Components (Interactive Objects)

## Owner
- Orchestrator: Claude | Workers: codex-dad (A1), codex-main (A2) | Status: plan

## Intent
Stworzyć `components/objects/` — nowy moduł z prymitywnymi komponentami interaktywnych obiektów biznesowych. Wszystkie pliki są NOWE. Sprint A jest blokerem dla B, C, D. Oba workery ruszają równolegle.

## Architektura — dokumenty referencyjne

| Dokument | Dlaczego |
|----------|----------|
| `SimpliSalon Design System/revamp/interactive-objects.html` sekcje 09.0–09.8 | Źródło prawdy: typy, zachowania, stany, ARIA, tokeny |
| `SimpliSalon Design System/revamp/tokens-v3.css` | Kolory obiektów (`--obj-client`, `--obj-worker`, itp.) |
| `components/ui/sheet.tsx` | Base dla RelatedActionsSheet (mobile) |
| `components/ui/popover.tsx` | Base dla ObjectPreview |
| `components/ui/dropdown-menu.tsx` | Base dla RelatedActionsMenu (desktop) |

## Constraints
- NIE tworzyć nowej palety kolorów — tokeny z tokens-v3.css
- Używaj shadcn primitywów jako base: DropdownMenu, Sheet, Popover
- NIE importuj z barrel `@/components/ui` — zawsze indywidualne ścieżki
- Wszystkie pliki w `components/objects/`
- TypeScript strict: explicit return types na exported functions
- Shared type contract poniżej MUSI być respektowany przez oba workery

## Shared Type Contract (obowiązuje oba workery)

```typescript
// W object-config.ts — EXACTNIE te typy, żadnych odchyleń

export type ObjectType = 'client' | 'worker' | 'service' | 'booking' | 'salon'

export interface ObjectTypeConfig {
  type: ObjectType
  label: string              // np. "Klientka"
  colorVar: string           // np. "--obj-client" (CSS custom property)
  icon: LucideIcon           // fallback gdy brak avatara
  getRoute: (slug: string, id: string) => string
}

export interface RelatedAction {
  id: string
  label: string
  icon: LucideIcon
  variant?: 'default' | 'destructive'
  disabled?: boolean
  onClick: (id: string, slug: string) => void
}

export interface ObjectLinkProps {
  type: ObjectType
  id: string
  label: string
  slug: string
  showDot?: boolean
  className?: string
  onClick?: (e: React.MouseEvent) => void  // stopPropagation external hook
}

export interface ObjectPillProps {
  type: ObjectType
  id: string
  label: string
  slug: string
  avatarUrl?: string
  className?: string
}

export interface ObjectAvatarProps {
  type: ObjectType
  size?: 'sm' | 'md' | 'lg'
  avatarUrl?: string
  label?: string          // inicjały fallback
  className?: string
}

export interface ObjectTriggerProps {
  type: ObjectType
  id: string
  label: string
  slug: string
  meta?: string
  avatarUrl?: string
  variant?: 'dots' | 'chevron'
  className?: string
}

export interface ObjectPreviewProps {
  type: ObjectType
  id: string
  label: string
  slug: string
  meta?: string
  avatarUrl?: string
  children: React.ReactNode  // trigger element
}
```

## Pliki — worker assignment

| Plik | Worker | Uwagi |
|------|--------|-------|
| `components/objects/object-config.ts` | **dad A1** | Types + ObjectTypeConfig map + getActions() per type |
| `components/objects/ObjectAvatar.tsx` | **dad A1** | Avatar z type color, dot, icon fallback, stany |
| `components/objects/RelatedActionsMenu.tsx` | **dad A1** | Desktop dropdown, keyboard nav, ARIA |
| `components/objects/RelatedActionsSheet.tsx` | **dad A1** | Mobile bottom sheet, 44px hit targets |
| `components/objects/ObjectLink.tsx` | **main A2** | Klikalna nazwa, stopPropagation, dot opcjonalnie |
| `components/objects/ObjectPill.tsx` | **main A2** | Avatar + ObjectLink w pigułce |
| `components/objects/ObjectTrigger.tsx` | **main A2** | `...` / chevron trigger, aria-haspopup="menu" |
| `components/objects/ObjectPreview.tsx` | **main A2** | Rich popover, używa shadcn Popover |
| `components/objects/index.ts` | **main A2** | Barrel export wszystkich powyższych |

## Graf zależności

```
object-config.ts ──┐
                   ├──> ObjectAvatar.tsx (dad A1)
                   ├──> ObjectLink.tsx   (main A2)
                   ├──> ObjectPill.tsx   (main A2, używa ObjectAvatar + ObjectLink)
                   ├──> ObjectTrigger.tsx (main A2)
                   ├──> RelatedActionsMenu.tsx (dad A1)
                   ├──> RelatedActionsSheet.tsx (dad A1)
                   └──> ObjectPreview.tsx (main A2)
```

`object-config.ts` jako peer — oba workery piszą go niezależnie ale interfejs MUSI być zgodny z kontraktem powyżej. Main importuje ObjectAvatar z ścieżki relative (tsc błąd OK na etapie pisania, dad fix po).

## Dispatch — RÓWNOLEGLE (oba naraz)

### Worker A1 — codex-dad

```bash
DAD_PROMPT='Read .workflow/skills/scoped-implementation.md and follow it.
Read "/mnt/d/SimpliSalonCLoud/SimpliSalon Design System/revamp/interactive-objects.html" sections 09.0 through 09.8 for design spec.
Read "/mnt/d/SimpliSalonCLoud/SimpliSalon Design System/revamp/tokens-v3.css" for object color tokens (--obj-client, --obj-worker, --obj-service, --obj-booking, --obj-salon).
Read /mnt/d/SimpliSalonCLoud/components/ui/dropdown-menu.tsx and /mnt/d/SimpliSalonCLoud/components/ui/sheet.tsx for base component APIs.

Goal: Create 4 new files in /mnt/d/SimpliSalonCLoud/components/objects/ per the shared type contract below.

SHARED TYPE CONTRACT (implement exactly):
- ObjectType = "client" | "worker" | "service" | "booking" | "salon"
- ObjectTypeConfig: { type, label, colorVar (CSS var name like "--obj-client"), icon (LucideIcon), getRoute(slug, id) => string }
- RelatedAction: { id, label, icon: LucideIcon, variant?: "default"|"destructive", disabled?, onClick(id, slug) => void }
- getActions(type: ObjectType): RelatedAction[] — returns full action list per type from the brief

File 1: /mnt/d/SimpliSalonCLoud/components/objects/object-config.ts
- Implement OBJECT_TYPE_CONFIG record, getActions(type) factory
- Actions per type (Polish labels):
  client: otworz-profil, zadzwon, wyslij-sms, wyslij-email, utworz-rezerwacje, dodaj-notatke, historia-wizyt, toggle-vip
  worker: otworz-profil, pokaz-grafik, dodaj-nieobecnosc, wyslij-wiadomosc, dzisiejsze-wizyty, przypisz-usluge
  service: otworz-szczegoly, edytuj, pokaz-pracownikow, dodaj-do-rezerwacji, toggle-online-booking
  booking: otworz-szczegoly, przeloz, potwierdz, anuluj (destructive), wyslij-przypomnienie, przyjmij-platnosc, dodaj-notatke
  salon: otworz-lokalizacje, godziny-otwarcia, przypisz-pracownika, kalendarz, edytuj
- Routes: client=/{slug}/clients/{id}, worker=/{slug}/employees/{id}, service=/{slug}/services, booking=/{slug}/bookings/{id}, salon=/{slug}/settings/business

File 2: /mnt/d/SimpliSalonCLoud/components/objects/ObjectAvatar.tsx
- Props: { type, size?: "sm"|"md"|"lg", avatarUrl?, label?, className? }
- sizes: sm=24px, md=32px, lg=40px
- Show avatarUrl if present, else initials from label, else type icon
- Background from CSS var --obj-{type} with opacity
- States: default, hover (brightness), loading (skeleton), missing (opacity-50 dashed border)
- Sizes via Tailwind: sm=h-6 w-6 text-xs, md=h-8 w-8 text-sm, lg=h-10 w-10 text-base

File 3: /mnt/d/SimpliSalonCLoud/components/objects/RelatedActionsMenu.tsx
- Props: { type, id, slug, label, meta?, avatarUrl?, open, onOpenChange, children: ReactNode (trigger) }
- Use shadcn DropdownMenu as base (import from @/components/ui/dropdown-menu)
- Header: ObjectAvatar + label + meta (type label from OBJECT_TYPE_CONFIG)
- Actions from getActions(type) grouped: primary first, destructive last, separator between groups
- variant=destructive → red text + destructive className
- disabled → aria-disabled + reduced opacity, non-interactive
- loading state on individual action: spinner replaces icon
- Keyboard: ArrowUp/Down nav, Enter activate, Esc close and return focus to trigger
- aria-haspopup="menu" on trigger, aria-expanded, role="menuitem" on actions

File 4: /mnt/d/SimpliSalonCLoud/components/objects/RelatedActionsSheet.tsx
- Props: same as RelatedActionsMenu but no trigger child (controlled externally)
- Use shadcn Sheet as base (import from @/components/ui/sheet), side="bottom"
- Hit targets min 44px height per action item
- Same header as menu: ObjectAvatar + label + meta
- Same action groups from getActions(type)
- Swipe gesture via CSS (sheet handles it)
- No hover dependencies — tap only

Constraints:
- Import from individual shadcn paths, NOT barrel
- Use Tailwind classes, NOT inline styles
- Export as named exports
- TypeScript strict, explicit return types on exported functions
- Use "use client" directive on all component files' done when: all 4 files written, no import errors (relative imports OK between objects/)' bash ~/.claude/scripts/dad-exec.sh
```

### Worker A2 — codex-main

```bash
codex exec --dangerously-bypass-approvals-and-sandbox 'Read .workflow/skills/scoped-implementation.md and follow it.
Read "SimpliSalon Design System/revamp/interactive-objects.html" sections 09.0 through 09.8 for design spec.
Read "SimpliSalon Design System/revamp/tokens-v3.css" for color tokens.
Read components/ui/popover.tsx for Popover component API.

Goal: Create 5 new files in components/objects/. Use shared type contract below.

SHARED TYPE CONTRACT (import from ./object-config, treat types as already existing):
- ObjectType = "client" | "worker" | "service" | "booking" | "salon"
- ObjectTypeConfig with colorVar (CSS var like "--obj-client"), getRoute, icon
- RelatedAction with onClick(id, slug)

File 1: components/objects/ObjectLink.tsx
- Props: { type, id, label, slug, showDot?, className?, onClick? }
- Renders as Next.js <Link> wrapping label text
- href = OBJECT_TYPE_CONFIG[type].getRoute(slug, id)
- stopPropagation on click to prevent parent row activation
- showDot: small colored dot using --obj-{type} color before label
- States: default (underline on hover), focus (ring using --obj-{type}), disabled (aria-disabled, no navigation), missing (italic, opacity-50, not a link)
- "use client"

File 2: components/objects/ObjectPill.tsx
- Props: { type, id, label, slug, avatarUrl?, className? }
- Compact layout: [ObjectAvatar sm] [ObjectLink] inline-flex items-center gap-1.5
- Import ObjectAvatar from ./ObjectAvatar, ObjectLink from ./ObjectLink
- Rounded pill shape, subtle background using --obj-{type} at low opacity
- Truncates long label with max-w and text-ellipsis overflow-hidden
- "use client"

File 3: components/objects/ObjectTrigger.tsx
- Props: { type, id, label, slug, meta?, avatarUrl?, variant?: "dots"|"chevron", className? }
- Renders a small button (variant="dots": "...", variant="chevron": ChevronDown icon)
- aria-haspopup="menu", aria-expanded (controlled via open state passed as prop or internal)
- stopPropagation on click always
- Focus visible ring using --obj-{type} color
- Renders RelatedActionsMenu on desktop (md+), RelatedActionsSheet on mobile (< md)
- Internal state: open boolean + useMediaQuery("(max-width: 768px)") for mobile detection
- "use client"

File 4: components/objects/ObjectPreview.tsx
- Props: { type, id, label, slug, meta?, avatarUrl?, children: ReactNode }
- Rich popover on hover/focus (desktop) — use shadcn Popover (import from @/components/ui/popover)
- Content: ObjectAvatar lg + label (bold) + meta + type chip + "Otworz profil" primary action button
- Delay open 300ms (prevent flicker on cursor pass-through)
- Mobile: no hover popover (touch devices skip preview, go directly to navigation)
- "use client"

File 5: components/objects/index.ts
- Named re-exports of all 8 files (object-config + 7 components)
- Export types: ObjectType, ObjectTypeConfig, RelatedAction, ObjectLinkProps, ObjectPillProps, ObjectAvatarProps, ObjectTriggerProps, ObjectPreviewProps

Constraints:
- import ObjectAvatar from ./ObjectAvatar (relative, NOT barrel)
- import ObjectLink from ./ObjectLink (relative)
- import OBJECT_TYPE_CONFIG, getActions from ./object-config
- Use Tailwind classes only
- TypeScript strict, explicit return types on all exported components/functions
- Do NOT use Gemini — write directly' < /dev/null
```

## Weryfikacja po Sprint A

```bash
# 1. Sprawdź że wszystkie pliki istnieją
ls d:/SimpliSalonCLoud/components/objects/

# 2. TypeScript check
cd d:/SimpliSalonCLoud && npx tsc --noEmit 2>&1 | head -50

# 3. Jeśli błędy → dad fixer
DAD_PROMPT='Read .workflow/skills/typescript-repair.md and follow it.
Run npx tsc --noEmit in /mnt/d/SimpliSalonCLoud. Fix all TypeScript errors in components/objects/. Do not change logic, only fix types and imports.' bash ~/.claude/scripts/dad-exec.sh
```

## Acceptance criteria

- [ ] `components/objects/` zawiera 9 plików (8 TS + index.ts)
- [ ] `object-config.ts` eksportuje OBJECT_TYPE_CONFIG, getActions() dla wszystkich 5 typów
- [ ] ObjectAvatar renderuje avatar/inicjały/icon z type color
- [ ] ObjectLink jest klikalnym linkiem z stopPropagation
- [ ] ObjectPill = ObjectAvatar + ObjectLink w pigułce
- [ ] ObjectTrigger otwiera RelatedActionsMenu na desktop i RelatedActionsSheet na mobile
- [ ] RelatedActionsMenu ma keyboard nav (ArrowUp/Down/Enter/Esc) i ARIA
- [ ] RelatedActionsSheet ma 44px hit targets
- [ ] ObjectPreview otwiera popover z avatarem i primary action
- [ ] `npx tsc --noEmit` przechodzi czysto

## Decision
Ship: TBD — czeka na tsc clean
