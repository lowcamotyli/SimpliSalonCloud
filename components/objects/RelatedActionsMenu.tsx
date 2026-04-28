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
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[min(92vw,320px)] min-w-[248px] p-2">
        <div className="mb-2 flex items-center gap-3 border-b pb-3">
          <ObjectAvatar type={type} size="lg" avatarUrl={avatarUrl} label={label} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{label}</p>
            <p className="truncate text-xs text-muted-foreground">
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
              className={cn("gap-2 font-semibold text-primary", isDisabled && "opacity-50")}
              onSelect={(event: Event): void => {
                event.preventDefault()
                void handleActionSelect(action)
              }}
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
              <span>{action.label}</span>
            </DropdownMenuItem>
          )
        })}

        {groups.regular.length > 0 ? <DropdownMenuSeparator /> : null}

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
              className={cn("gap-2", isDisabled && "opacity-50")}
              onSelect={(event: Event): void => {
                event.preventDefault()
                void handleActionSelect(action)
              }}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Icon className="h-4 w-4 text-muted-foreground" />
              )}
              <span>{action.label}</span>
            </DropdownMenuItem>
          )
        })}

        {groups.destructive.length > 0 ? <DropdownMenuSeparator /> : null}

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
                "gap-2 text-destructive focus:text-destructive",
                "focus:bg-destructive/10",
                isDisabled && "opacity-50"
              )}
              onSelect={(event: Event): void => {
                event.preventDefault()
                void handleActionSelect(action)
              }}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Icon className="h-4 w-4 text-destructive" />
              )}
              <span>{action.label}</span>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
