"use client"

import Link from "next/link"
import type { MouseEvent } from "react"

import { cn } from "@/lib/utils"

import { OBJECT_TYPE_CONFIG, type ObjectType } from "./object-config"

const objectToneClasses: Record<ObjectType, string> = {
  client: "[--object-color:var(--obj-client,var(--v3-secondary))] [--object-bg:var(--v3-secondary-soft)]",
  worker: "[--object-color:var(--obj-worker,var(--v3-primary))] [--object-bg:var(--v3-primary-soft)]",
  service: "[--object-color:var(--obj-service,var(--v3-gold))] [--object-bg:var(--v3-gold-soft)]",
  booking: "[--object-color:var(--obj-booking,#6E59C7)] [--object-bg:#ECE7F8]",
  salon: "[--object-color:var(--obj-salon,var(--v3-accent))] [--object-bg:#E1EEFB]",
}

export type ObjectLinkProps = {
  type: ObjectType
  id: string
  label: string
  slug: string
  showDot?: boolean
  className?: string
  disabled?: boolean
  missing?: boolean
  onClick?: (event: MouseEvent<HTMLAnchorElement>, id: string, slug: string) => void
}

export function ObjectLink({
  type,
  id,
  label,
  slug,
  showDot = true,
  className,
  disabled = false,
  missing = false,
  onClick,
}: ObjectLinkProps): JSX.Element {
  const isMissing = missing || !id || !slug || !label
  const href = OBJECT_TYPE_CONFIG[type].getRoute(slug, id)

  const classNames = cn(
    objectToneClasses[type],
    "inline-flex max-w-full items-center gap-1.5 rounded-[var(--v3-r-sm)] px-1 py-0.5 text-sm font-medium text-[var(--v3-text-primary)] outline-none transition-colors hover:text-[var(--object-color)] hover:underline hover:decoration-[var(--object-color)] hover:underline-offset-2 focus-visible:bg-[var(--object-bg)] focus-visible:ring-2 focus-visible:ring-[var(--object-color)] focus-visible:ring-offset-1",
    disabled && "pointer-events-none text-[var(--v3-text-disabled)]",
    isMissing && "pointer-events-none italic opacity-50",
    className
  )

  const dot = showDot ? (
    <span
      aria-hidden="true"
      className={cn(
        "h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--object-color)]",
        disabled && "bg-[var(--v3-text-disabled)]",
        isMissing && "border border-dashed border-[var(--v3-border-strong)] bg-transparent"
      )}
    />
  ) : null

  if (isMissing) {
    return (
      <span aria-disabled="true" className={classNames} role="text">
        {dot}
        <span className="truncate">{label || "brak obiektu"}</span>
      </span>
    )
  }

  return (
    <Link
      aria-disabled={disabled || undefined}
      aria-label={`${OBJECT_TYPE_CONFIG[type].label}: ${label}`}
      className={classNames}
      href={disabled ? "#" : href}
      onClick={(event) => {
        event.stopPropagation()

        if (disabled) {
          event.preventDefault()
          return
        }

        onClick?.(event, id, slug)
      }}
      tabIndex={disabled ? -1 : undefined}
    >
      {dot}
      <span className="truncate">{label}</span>
    </Link>
  )
}
