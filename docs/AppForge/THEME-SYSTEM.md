# AppForge — Theme & Component System

## Zasada bezwzględna

```typescript
// ✅ ZAWSZE — theme-agnostic
import { useComponents } from '@/lib/themes'
export function MyModuleComponent() {
  const { Card, Button, Badge, DataTable } = useComponents()
  return <Card><Button>...</Button></Card>
}

// ❌ NIGDY w module domenowym — hardcoded UI library
import { Card } from '@/components/ui/card'        // zabronione
import { Button } from '@/components/ui/button'    // zabronione
```

Moduły domenowe (`modules/*/components/`) używają WYŁĄCZNIE `useComponents()`.
Pliki w `app/` i `components/layout/` mogą importować UI bezpośrednio.

## ComponentRegistry — kontrakt

```typescript
// lib/themes/registry.ts
export interface ComponentRegistry {
  // Layout
  PageHeader: React.ComponentType<PageHeaderProps>
  Card: React.ComponentType<CardProps>          // variant: default|outlined|elevated
  Section: React.ComponentType<SectionProps>

  // Forms
  Input: React.ComponentType<InputProps>
  Select: React.ComponentType<SelectProps>
  Textarea: React.ComponentType<TextareaProps>
  Checkbox: React.ComponentType<CheckboxProps>
  Switch: React.ComponentType<SwitchProps>
  DatePicker: React.ComponentType<DatePickerProps>
  DateRangePicker: React.ComponentType<DateRangePickerProps>
  TimePicker: React.ComponentType<TimePickerProps>
  FormField: React.ComponentType<FormFieldProps>
  FormLabel: React.ComponentType<FormLabelProps>
  FormMessage: React.ComponentType<FormMessageProps>

  // Actions
  Button: React.ComponentType<ButtonProps>      // variant: default|destructive|outline|ghost
  IconButton: React.ComponentType<IconButtonProps>
  DropdownMenu: React.ComponentType<DropdownMenuProps>

  // Feedback
  Badge: React.ComponentType<BadgeProps>        // variant: default|success|warning|destructive
  Alert: React.ComponentType<AlertProps>
  Toast: ToastAPI                               // imperatywne: Toast.success('...')
  Tooltip: React.ComponentType<TooltipProps>

  // Data Display
  DataTable: <TData>(props: DataTableProps<TData>) => React.ReactElement
  Avatar: React.ComponentType<AvatarProps>
  EmptyState: React.ComponentType<EmptyStateProps>
  StatCard: React.ComponentType<StatCardProps>
  FileUpload: React.ComponentType<FileUploadProps>

  // Navigation
  Tabs: React.ComponentType<TabsProps>
  TabsList: React.ComponentType<{ children: React.ReactNode }>
  TabsTrigger: React.ComponentType<TabsTriggerProps>
  TabsContent: React.ComponentType<TabsContentProps>

  // Overlays
  Modal: React.ComponentType<ModalProps>
  Sheet: React.ComponentType<SheetProps>
  ConfirmDialog: React.ComponentType<ConfirmDialogProps>

  // Loading
  Skeleton: React.ComponentType<SkeletonProps>
  Spinner: React.ComponentType<SpinnerProps>
}
```

## DesignTokens — kontrakt

```typescript
export interface DesignTokens {
  colors: {
    primary: ColorScale      // { 50, 100, ..., 950 }
    secondary: ColorScale
    accent: ColorScale
    neutral: ColorScale
    destructive: ColorScale
    success: ColorScale
    warning: ColorScale
    background: string
    surface: string          // card backgrounds
    border: string
    foreground: string
  }
  typography: {
    fontFamily: { sans: string; mono: string }
    fontSize: Record<'xs'|'sm'|'base'|'lg'|'xl'|'2xl'|'3xl'|'4xl', string>
  }
  borderRadius: Record<'none'|'sm'|'md'|'lg'|'xl'|'full', string>
  shadows: Record<'none'|'sm'|'md'|'lg'|'xl', string>
  motion: {
    duration: Record<'fast'|'normal'|'slow', string>
  }
}
```

## Theme Provider — setup

```tsx
// app/providers.tsx
import { APP_CONFIG } from '@/app-config'
import { ThemeProvider } from '@/lib/themes/provider'
import { loadTheme } from '@/lib/themes/registry'

export async function Providers({ children }) {
  const theme = await loadTheme(APP_CONFIG.themeId)
  return (
    <ThemeProvider tokens={theme.tokens} registry={theme.registry}>
      {children}
    </ThemeProvider>
  )
}
```

## Struktura themes/

```
themes/
  _default/            ← shadcn/ui wrapped — zawsze dostępny (fallback)
    index.ts           ← exports { registry, tokens }
    tokens.ts
    components/        ← Button.tsx, Card.tsx, ... (wrappery shadcn)

  simplisalon/         ← dostarczone przez Bartosza
    index.ts
    tokens.ts          ← rose/coral palette, miękkie cienie
    components/        ← własna implementacja każdego komponentu

  [nowa-app]/          ← dostarcza się ZIP z TSX komponentami
    index.ts           ← MUSI eksportować { registry: ComponentRegistry, tokens: DesignTokens }
    tokens.ts
    components/
```

## Dodawanie nowego theme

1. Stwórz `themes/[app-name]/` z plikami `index.ts`, `tokens.ts`, `components/`
2. `index.ts` musi eksportować obiekt zgodny z `ComponentRegistry` i `DesignTokens`
3. W `lib/themes/registry.ts` dodaj entry: `'[app-name]': () => import('@/themes/[app-name]')`
4. W `app-config.ts` ustaw: `themeId: '[app-name]'`

## Props — konwencja dla własnych komponentów

Każdy komponent w `themes/[app]/components/` musi akceptować `className?: string`
i propagować go do root elementu (umożliwia moduł-level overrides).
