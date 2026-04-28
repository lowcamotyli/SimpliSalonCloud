"use client"

import * as React from "react"
import { Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

import { ObjectAvatar } from "./ObjectAvatar"
import {
  OBJECT_TYPE_CONFIG,
  getActions,
  type ObjectType,
  type RelatedAction,
} from "./object-config"

type RelatedActionsSheetProps = {
  type: ObjectType
  id: string
  slug: string
  label: string
  meta?: string
  avatarUrl?: string
  open: boolean
  onOpenChange: (open: boolean) => void
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

export function RelatedActionsSheet({
  type,
  id,
  slug,
  label,
  meta,
  avatarUrl,
  open,
  onOpenChange,
}: RelatedActionsSheetProps): React.JSX.Element {
  const router = useRouter()
  const config = OBJECT_TYPE_CONFIG[type]
  const [loadingActionId, setLoadingActionId] = React.useState<string | null>(null)
  const actions = React.useMemo(
    () => getActions(type, id, { router, slug, toast }),
    [id, router, slug, type]
  )
  const groups = React.useMemo(() => splitActions(actions), [actions])

  const handleAction = React.useCallback(
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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-xl px-4 pb-5 pt-8">
        <SheetHeader className="mb-4 flex-row items-center gap-3 space-y-0 text-left">
          <ObjectAvatar type={type} size="lg" avatarUrl={avatarUrl} label={label} />
          <div className="min-w-0">
            <SheetTitle className="truncate text-base leading-none">{label}</SheetTitle>
            <SheetDescription className="truncate text-xs">
              {config.label}
              {meta ? ` · ${meta}` : ""}
            </SheetDescription>
          </div>
        </SheetHeader>

        <div className="space-y-2">
          {groups.primary.map((action: RelatedAction) => {
            const Icon = action.icon
            const isLoading = loadingActionId === action.id
            const isDisabled = Boolean(action.disabled || loadingActionId !== null)

            return (
              <button
                key={action.id}
                type="button"
                role="menuitem"
                aria-disabled={isDisabled}
                disabled={isDisabled}
                onClick={(): void => {
                  void handleAction(action)
                }}
                className={cn(
                  "flex min-h-[44px] w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-semibold text-primary",
                  "active:bg-muted",
                  isDisabled && "pointer-events-none opacity-50"
                )}
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
                <span>{action.label}</span>
              </button>
            )
          })}

          {groups.regular.length > 0 ? <div className="h-px bg-border" /> : null}

          {groups.regular.map((action: RelatedAction) => {
            const Icon = action.icon
            const isLoading = loadingActionId === action.id
            const isDisabled = Boolean(action.disabled || loadingActionId !== null)

            return (
              <button
                key={action.id}
                type="button"
                role="menuitem"
                aria-disabled={isDisabled}
                disabled={isDisabled}
                onClick={(): void => {
                  void handleAction(action)
                }}
                className={cn(
                  "flex min-h-[44px] w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm",
                  "active:bg-muted",
                  isDisabled && "pointer-events-none opacity-50"
                )}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Icon className="h-4 w-4 text-muted-foreground" />
                )}
                <span>{action.label}</span>
              </button>
            )
          })}

          {groups.destructive.length > 0 ? <div className="h-px bg-border" /> : null}

          {groups.destructive.map((action: RelatedAction) => {
            const Icon = action.icon
            const isLoading = loadingActionId === action.id
            const isDisabled = Boolean(action.disabled || loadingActionId !== null)

            return (
              <button
                key={action.id}
                type="button"
                role="menuitem"
                aria-disabled={isDisabled}
                disabled={isDisabled}
                onClick={(): void => {
                  void handleAction(action)
                }}
                className={cn(
                  "flex min-h-[44px] w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-destructive",
                  "active:bg-destructive/10",
                  isDisabled && "pointer-events-none opacity-50"
                )}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Icon className="h-4 w-4 text-destructive" />
                )}
                <span>{action.label}</span>
              </button>
            )
          })}
        </div>
      </SheetContent>
    </Sheet>
  )
}
