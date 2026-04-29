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
  triggerRef?: React.RefObject<HTMLButtonElement>
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
  triggerRef,
}: RelatedActionsSheetProps): React.JSX.Element {
  const router = useRouter()
  const config = OBJECT_TYPE_CONFIG[type]
  const [loadingActionId, setLoadingActionId] = React.useState<string | null>(null)
  const actions = React.useMemo(
    () => getActions(type, id, { router, slug, toast }),
    [id, router, slug, type]
  )
  const groups = React.useMemo(() => splitActions(actions), [actions])

  const returnFocusToTrigger = React.useCallback((): void => {
    window.setTimeout(() => triggerRef?.current?.focus(), 0)
  }, [triggerRef])

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
        returnFocusToTrigger()
      }
    },
    [id, loadingActionId, onOpenChange, returnFocusToTrigger, slug]
  )

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean): void => {
      onOpenChange(nextOpen)

      if (!nextOpen) {
        returnFocusToTrigger()
      }
    },
    [onOpenChange, returnFocusToTrigger]
  )

  const handleMenuKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>): void => {
      if (event.key === "Escape") {
        event.preventDefault()
        handleOpenChange(false)
        return
      }

      if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Enter") {
        return
      }

      const menuItems = Array.from(
        event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')
      ).filter((item) => item.getAttribute("aria-disabled") !== "true")

      if (menuItems.length === 0) {
        return
      }

      const activeIndex = menuItems.findIndex((item) => item === document.activeElement)

      if (event.key === "Enter") {
        if (activeIndex >= 0) {
          event.preventDefault()
          menuItems[activeIndex]?.click()
        }
        return
      }

      event.preventDefault()

      const nextIndex =
        event.key === "ArrowDown"
          ? activeIndex < 0
            ? 0
            : (activeIndex + 1) % menuItems.length
          : activeIndex < 0
            ? menuItems.length - 1
            : (activeIndex - 1 + menuItems.length) % menuItems.length

      menuItems[nextIndex]?.focus()
    },
    [handleOpenChange]
  )

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="bottom"
        className="overflow-hidden rounded-t-2xl border border-[var(--v3-border)] bg-white px-0 pb-0 pt-0 shadow-[var(--v3-shadow-modal)]"
      >
        <div className="mx-auto mb-1.5 mt-2.5 h-1 w-9 rounded-full bg-[var(--v3-border-strong)]" />
        <SheetHeader className="mb-0 flex-row items-center gap-3 space-y-0 border-b border-[var(--v3-border)] px-4 pb-3.5 pt-2 text-left">
          <ObjectAvatar type={type} size="lg" avatarUrl={avatarUrl} label={label} className="h-11 w-11 text-sm" />
          <div className="min-w-0">
            <SheetTitle className="truncate font-display text-lg font-semibold leading-tight text-[var(--v3-text-primary)]">{label}</SheetTitle>
            <SheetDescription className="truncate font-ui text-xs text-[var(--v3-text-secondary)]">
              {config.label}
              {meta ? ` · ${meta}` : ""}
            </SheetDescription>
          </div>
        </SheetHeader>

        <div
          aria-label={`${label} - akcje`}
          className="space-y-0 px-2 pb-3 pt-1.5"
          onKeyDown={handleMenuKeyDown}
          role="menu"
        >
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
                  "flex min-h-[44px] w-full items-center gap-3 rounded-[var(--v3-r)] px-3 py-3.5 text-left font-ui text-[15px] font-semibold text-[var(--v3-primary)]",
                  "active:bg-[var(--v3-bg-alt)]",
                  isDisabled && "pointer-events-none opacity-50"
                )}
              >
                {isLoading ? (
                  <Loader2 className="h-[18px] w-[18px] shrink-0 animate-spin" />
                ) : (
                  <Icon className="h-[18px] w-[18px] shrink-0" />
                )}
                <span>{action.label}</span>
              </button>
            )
          })}

          {groups.regular.length > 0 ? <div className="my-1 h-px bg-[var(--v3-border)]" /> : null}

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
                  "flex min-h-[44px] w-full items-center gap-3 rounded-[var(--v3-r)] px-3 py-3.5 text-left font-ui text-[15px] font-medium text-[var(--v3-text-primary)]",
                  "active:bg-[var(--v3-bg-alt)]",
                  isDisabled && "pointer-events-none opacity-50"
                )}
              >
                {isLoading ? (
                  <Loader2 className="h-[18px] w-[18px] shrink-0 animate-spin" />
                ) : (
                  <Icon className="h-[18px] w-[18px] shrink-0 text-[var(--v3-text-secondary)]" />
                )}
                <span>{action.label}</span>
              </button>
            )
          })}

          {groups.destructive.length > 0 ? <div className="my-1 h-px bg-[var(--v3-border)]" /> : null}

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
                  "flex min-h-[44px] w-full items-center gap-3 rounded-[var(--v3-r)] px-3 py-3.5 text-left font-ui text-[15px] font-medium text-[var(--v3-error)]",
                  "active:bg-[var(--v3-error-bg)]",
                  isDisabled && "pointer-events-none opacity-50"
                )}
              >
                {isLoading ? (
                  <Loader2 className="h-[18px] w-[18px] shrink-0 animate-spin" />
                ) : (
                  <Icon className="h-[18px] w-[18px] shrink-0 text-[var(--v3-error)]" />
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
