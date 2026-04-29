"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

import { OBJECT_TYPE_CONFIG, type ObjectType } from "./object-config"

export type ObjectAvatarProps = {
  type: ObjectType
  size?: "sm" | "md" | "lg"
  avatarUrl?: string
  label?: string
  className?: string
}

const SIZE_CLASS: Record<NonNullable<ObjectAvatarProps["size"]>, string> = {
  sm: "h-6 w-6 text-xs",
  md: "h-8 w-8 text-sm",
  lg: "h-10 w-10 text-base",
}

const TYPE_COLOR_CLASS: Record<ObjectType, string> = {
  client:
    "text-[color:var(--obj-client)] bg-[color-mix(in_srgb,var(--obj-client)_18%,transparent)] border-[color-mix(in_srgb,var(--obj-client)_32%,transparent)]",
  worker:
    "text-[color:var(--obj-worker)] bg-[color-mix(in_srgb,var(--obj-worker)_18%,transparent)] border-[color-mix(in_srgb,var(--obj-worker)_32%,transparent)]",
  service:
    "text-[color:var(--obj-service)] bg-[color-mix(in_srgb,var(--obj-service)_18%,transparent)] border-[color-mix(in_srgb,var(--obj-service)_32%,transparent)]",
  booking:
    "text-[color:var(--obj-booking)] bg-[color-mix(in_srgb,var(--obj-booking)_18%,transparent)] border-[color-mix(in_srgb,var(--obj-booking)_32%,transparent)]",
  salon:
    "text-[color:var(--obj-salon)] bg-[color-mix(in_srgb,var(--obj-salon)_18%,transparent)] border-[color-mix(in_srgb,var(--obj-salon)_32%,transparent)]",
}

function getInitials(label: string): string {
  const words = label
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  if (words.length === 0) {
    return ""
  }

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase()
  }

  return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase()
}

export function ObjectAvatar({
  type,
  size = "md",
  avatarUrl,
  label,
  className,
}: ObjectAvatarProps): React.JSX.Element {
  const config = OBJECT_TYPE_CONFIG[type]
  const Icon = config.icon
  const initials = label ? getInitials(label) : ""

  return (
    <span
      className={cn(
        "group relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border font-medium transition data-[state=missing]:border-dashed data-[state=missing]:opacity-50 data-[state=missing]:brightness-100",
        "hover:brightness-110",
        "data-[state=loading]:animate-pulse",
        SIZE_CLASS[size],
        TYPE_COLOR_CLASS[type],
        className
      )}
      aria-hidden="true"
    >
      <span className="absolute inset-0 hidden rounded-full bg-muted/60 group-data-[state=loading]:block" />
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          className="h-full w-full object-cover group-data-[state=loading]:opacity-0"
        />
      ) : initials ? (
        <span className="leading-none group-data-[state=loading]:opacity-0">{initials}</span>
      ) : (
        <Icon className="h-[0.9em] w-[0.9em] group-data-[state=loading]:opacity-0" />
      )}
    </span>
  )
}
