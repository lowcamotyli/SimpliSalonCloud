"use client"

import { ChevronDown, MoreHorizontal } from "lucide-react"
import * as React from "react"

import { cn } from "@/lib/utils"

import { getActions, type ObjectType } from "./object-config"
import { RelatedActionsMenu } from "./RelatedActionsMenu"
import { RelatedActionsSheet } from "./RelatedActionsSheet"

const objectToneClasses: Record<ObjectType, string> = {
  client: "[--object-color:var(--obj-client,var(--v3-secondary))] [--object-bg:var(--v3-secondary-soft)]",
  worker: "[--object-color:var(--obj-worker,var(--v3-primary))] [--object-bg:var(--v3-primary-soft)]",
  service: "[--object-color:var(--obj-service,var(--v3-gold))] [--object-bg:var(--v3-gold-soft)]",
  booking: "[--object-color:var(--obj-booking,#6E59C7)] [--object-bg:#ECE7F8]",
  salon: "[--object-color:var(--obj-salon,var(--v3-accent))] [--object-bg:#E1EEFB]",
}

export type ObjectTriggerProps = {
  type: ObjectType
  id: string
  label: string
  slug: string
  meta?: string
  avatarUrl?: string
  variant?: "dots" | "chevron"
  className?: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = React.useState(false)

  React.useEffect(() => {
    const mediaQuery = window.matchMedia(query)
    setMatches(mediaQuery.matches)

    const handleChange = (event: MediaQueryListEvent): void => {
      setMatches(event.matches)
    }

    mediaQuery.addEventListener("change", handleChange)
    return () => mediaQuery.removeEventListener("change", handleChange)
  }, [query])

  return matches
}

export function ObjectTrigger({
  type,
  id,
  label,
  slug,
  meta,
  avatarUrl,
  variant = "dots",
  className,
  open: openProp,
  onOpenChange,
}: ObjectTriggerProps): JSX.Element {
  const [internalOpen, setInternalOpen] = React.useState(false)
  const isMobile = useMediaQuery("(max-width: 768px)")
  const isControlled = openProp !== undefined
  const open = isControlled ? openProp : internalOpen
  const hasActions = getActions(type, id).length > 0

  const setOpen = React.useCallback(
    (nextOpen: boolean): void => {
      if (!isControlled) {
        setInternalOpen(nextOpen)
      }
      onOpenChange?.(nextOpen)
    },
    [isControlled, onOpenChange]
  )

  const renderTrigger = (toggleOnClick: boolean): JSX.Element => (
    <button
      aria-expanded={open}
      aria-haspopup="menu"
      aria-label={`Akcje: ${label}`}
      className={cn(
        objectToneClasses[type],
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-transparent text-[var(--v3-text-secondary)] outline-none transition-colors hover:bg-[var(--object-bg)] hover:text-[var(--object-color)] focus-visible:ring-2 focus-visible:ring-[var(--object-color)] focus-visible:ring-offset-1",
        open && "bg-[var(--object-bg)] text-[var(--object-color)]",
        !hasActions && "cursor-not-allowed opacity-50",
        className
      )}
      disabled={!hasActions}
      onClick={(event) => {
        event.stopPropagation()
        if (toggleOnClick) {
          setOpen(!open)
        }
      }}
      type="button"
    >
      {variant === "chevron" ? (
        <ChevronDown className="h-4 w-4" aria-hidden="true" />
      ) : (
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      )}
    </button>
  )

  if (isMobile) {
    return (
      <>
        {renderTrigger(true)}
        <RelatedActionsSheet
          avatarUrl={avatarUrl}
          id={id}
          label={label}
          meta={meta}
          onOpenChange={setOpen}
          open={open}
          slug={slug}
          type={type}
        />
      </>
    )
  }

  return (
    <RelatedActionsMenu
      avatarUrl={avatarUrl}
      id={id}
      label={label}
      meta={meta}
      onOpenChange={setOpen}
      open={open}
      slug={slug}
      type={type}
    >
      {renderTrigger(false)}
    </RelatedActionsMenu>
  )
}
