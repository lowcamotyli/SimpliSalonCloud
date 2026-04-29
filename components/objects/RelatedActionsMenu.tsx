"use client"

import * as React from "react"
import { Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

import { ObjectAvatar } from "./ObjectAvatar"
import {
  OBJECT_TYPE_CONFIG,
  getActions,
  type ObjectType,
  type RelatedAction,
} from "./object-config"

type RelatedActionsMenuProps = {
  type: ObjectType
  id: string
  slug: string
  label: string
  meta?: string
  avatarUrl?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactElement
}

function splitActions(actions: RelatedAction[]): {
  primary: RelatedAction[]
  regular: RelatedAction[]
  destructive: RelatedAction[]
} {
  const primary = actions.length > 0 ? [actions[0]] : []
  const regular: RelatedAction[] = []
  const destructive: RelatedAction[] = []

  for (const [, action] of actions.entries()) {
    if (primary[0]?.id === action.id) {
      continue
    }

    if (action.variant === "destructive") {
      destructive.push(action)
      continue
    }

    regular.push(action)
  }

  return { primary, regular, destructive }
}

export function RelatedActionsMenu({
  type,
  id,
  slug,
  label,
  meta,
  avatarUrl,
  open,
  onOpenChange,
  children,
}: RelatedActionsMenuProps): React.JSX.Element {
  const router = useRouter()
  const config = OBJECT_TYPE_CONFIG[type]
  const [loadingActionId, setLoadingActionId] = React.useState<string | null>(null)
  const actions = React.useMemo(
    () => getActions(type, id, { router, slug, toast }),
    [id, router, slug, type]
  )
  const groups = React.useMemo(() => splitActions(actions), [actions])
  const trigger = React.cloneElement(children, {
    "aria-expanded": open,
    "aria-haspopup": "menu",
    "aria-label": `Akcje dla ${label}`,
  })

  const handleActionSelect = React.useCallback(
    async (action: RelatedAction): Promise<void> => {
      if (action.disabled || loadingActionId !== null) {
        return
      }

      setLoadingActionId(action.id)

      try {
        await Promise.resolve(action.onClick(id, slug))
      } finally {
        setLoadingActionId(null)
        onOpenChange(false)
      }
    },
    [id, loadingActionId, onOpenChange, slug]
  )

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className="w-[min(92vw,320px)] min-w-[248px] rounded-[var(--v3-r-md)] border border-[var(--v3-border)] bg-white p-1.5 shadow-[var(--v3-shadow-modal)]"
      >
        <div className="mb-1.5 flex items-center gap-2.5 border-b border-[var(--v3-border)] px-2.5 pb-3 pt-2.5">
          <ObjectAvatar type={type} size="lg" avatarUrl={avatarUrl} label={label} className="h-10 w-10" />
          <div className="min-w-0">
            <p className="truncate font-ui text-[13.5px] font-bold text-[var(--v3-text-primary)]">{label}</p>
            <p className="truncate font-ui text-[11.5px] text-[var(--v3-text-secondary)]">
              {config.label}
              {meta ? ` · ${meta}` : ""}
            </p>
          </div>
        </div>

        {groups.primary.map((action: RelatedAction) => {
          const Icon = action.icon
          const isLoading = loadingActionId === action.id
          const isDisabled = Boolean(action.disabled || loadingActionId !== null)

          return (
            <DropdownMenuItem
              key={action.id}
              role="menuitem"
              aria-disabled={isDisabled}
              disabled={isDisabled}
              className={cn(
                "min-h-[34px] gap-2.5 px-2.5 py-2 font-ui text-[13.5px] font-semibold text-[var(--v3-primary)] focus:bg-[var(--v3-secondary-soft)] focus:text-[var(--v3-secondary)]",
                isDisabled && "opacity-50"
              )}
              onSelect={(event: Event): void => {
                event.preventDefault()
                void handleActionSelect(action)
              }}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              ) : (
                <Icon className="h-4 w-4 shrink-0" />
              )}
              <span>{action.label}</span>
              <span className="ml-auto font-mono text-[11px] font-normal text-[var(--v3-text-secondary)]">
                Enter
              </span>
            </DropdownMenuItem>
          )
        })}

        {groups.regular.length > 0 ? <DropdownMenuSeparator className="mx-0 my-1.5" /> : null}

        {groups.regular.map((action: RelatedAction) => {
          const Icon = action.icon
          const isLoading = loadingActionId === action.id
          const isDisabled = Boolean(action.disabled || loadingActionId !== null)

          return (
            <DropdownMenuItem
              key={action.id}
              role="menuitem"
              aria-disabled={isDisabled}
              disabled={isDisabled}
              className={cn(
                "min-h-[34px] gap-2.5 px-2.5 py-2 font-ui text-[13.5px] text-[var(--v3-text-primary)] hover:bg-[var(--v3-bg-alt)] focus:bg-[var(--v3-secondary-soft)] focus:text-[var(--v3-secondary)]",
                isDisabled && "opacity-50"
              )}
              onSelect={(event: Event): void => {
                event.preventDefault()
                void handleActionSelect(action)
              }}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              ) : (
                <Icon className="h-4 w-4 shrink-0 text-[var(--v3-text-secondary)]" />
              )}
              <span>{action.label}</span>
            </DropdownMenuItem>
          )
        })}

        {groups.destructive.length > 0 ? <DropdownMenuSeparator className="mx-0 my-1.5" /> : null}

        {groups.destructive.map((action: RelatedAction) => {
          const Icon = action.icon
          const isLoading = loadingActionId === action.id
          const isDisabled = Boolean(action.disabled || loadingActionId !== null)

          return (
            <DropdownMenuItem
              key={action.id}
              role="menuitem"
              aria-disabled={isDisabled}
              disabled={isDisabled}
              className={cn(
                "min-h-[34px] gap-2.5 px-2.5 py-2 font-ui text-[13.5px] text-[var(--v3-error)] hover:bg-[var(--v3-error-bg)] focus:bg-[var(--v3-error-bg)] focus:text-[var(--v3-error)]",
                isDisabled && "opacity-50"
              )}
              onSelect={(event: Event): void => {
                event.preventDefault()
                void handleActionSelect(action)
              }}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              ) : (
                <Icon className="h-4 w-4 shrink-0 text-[var(--v3-error)]" />
              )}
              <span>{action.label}</span>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
