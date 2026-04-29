"use client"

import { cn } from "@/lib/utils"

import { type ObjectType } from "./object-config"
import { ObjectAvatar } from "./ObjectAvatar"
import { ObjectLink } from "./ObjectLink"

const objectToneClasses: Record<ObjectType, string> = {
  client: "[--object-color:var(--obj-client,var(--v3-secondary))] [--object-bg:color-mix(in_srgb,var(--object-color)_12%,transparent)]",
  worker: "[--object-color:var(--obj-worker,var(--v3-primary))] [--object-bg:color-mix(in_srgb,var(--object-color)_12%,transparent)]",
  service: "[--object-color:var(--obj-service,var(--v3-gold))] [--object-bg:color-mix(in_srgb,var(--object-color)_12%,transparent)]",
  booking: "[--object-color:var(--obj-booking,#6E59C7)] [--object-bg:color-mix(in_srgb,var(--object-color)_12%,transparent)]",
  salon: "[--object-color:var(--obj-salon,var(--v3-accent))] [--object-bg:color-mix(in_srgb,var(--object-color)_12%,transparent)]",
}
export type ObjectPillProps = {
  type: ObjectType
  id: string
  label: string
  slug: string
  avatarUrl?: string
  className?: string
}

export function ObjectPill({
  type,
  id,
  label,
  slug,
  avatarUrl,
  className,
}: ObjectPillProps): JSX.Element {
  return (
    <span
      className={cn(
        objectToneClasses[type],
        "inline-flex h-7 max-w-full items-center gap-1.5 rounded-[var(--v3-r-pill)] border border-[var(--v3-border)] bg-[var(--object-bg)] px-2 py-0.5 text-sm text-[var(--v3-text-primary)] transition-colors hover:border-[var(--object-color)]",
        className
      )}
      onClick={(event) => event.stopPropagation()}
    >
      <ObjectAvatar avatarUrl={avatarUrl} label={label} size="sm" type={type} />
      <ObjectLink
        className="min-w-0 max-w-40 px-0 py-0 hover:bg-transparent focus-visible:bg-transparent focus-visible:ring-1"
        id={id}
        label={label}
        showDot={false}
        slug={slug}
        type={type}
      />
    </span>
  )
}
