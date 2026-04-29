"use client"

import { cn } from "@/lib/utils"

import { OBJECT_TYPE_CONFIG, type ObjectType } from "./object-config"
import { ObjectPill } from "./ObjectPill"
import { ObjectTrigger } from "./ObjectTrigger"

const objectRingClasses: Record<ObjectType, string> = {
  client: "focus-within:ring-[var(--obj-client)]",
  worker: "focus-within:ring-[var(--obj-worker)]",
  service: "focus-within:ring-[var(--obj-service)]",
  booking: "focus-within:ring-[var(--obj-booking)]",
  salon: "focus-within:ring-[var(--obj-salon)]",
}

export type ObjectCellProps = {
  type: ObjectType
  id: string
  label: string
  slug: string
  meta?: string
  avatarUrl?: string
  showActions?: boolean
  className?: string
}

export function ObjectCell({
  type,
  id,
  label,
  slug,
  meta,
  avatarUrl,
  showActions = true,
  className,
}: ObjectCellProps): JSX.Element {
  const typeLabel = OBJECT_TYPE_CONFIG[type].label
  const isMissing = !id || !slug || !label.trim()

  if (isMissing) {
    return (
      <div className={cn("flex items-center justify-between gap-2", className)}>
        <span aria-label={`Brak przypisanego ${typeLabel}`} className="text-muted-foreground">
          —
        </span>
      </div>
    )
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="min-w-0 max-w-[200px]">
        <ObjectPill
          avatarUrl={avatarUrl}
          className={cn(
            "max-w-[200px] focus-within:ring-2 focus-within:ring-offset-1",
            objectRingClasses[type]
          )}
          id={id}
          label={label}
          slug={slug}
          type={type}
        />
        {meta ? <p className="truncate text-xs text-muted-foreground">{meta}</p> : null}
      </div>
      {showActions ? (
        <ObjectTrigger
          avatarUrl={avatarUrl}
          className="shrink-0"
          id={id}
          label={label}
          meta={meta}
          slug={slug}
          type={type}
          variant="dots"
        />
      ) : null}
    </div>
  )
}
