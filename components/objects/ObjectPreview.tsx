"use client"

import Link from "next/link"
import * as React from "react"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

import { OBJECT_TYPE_CONFIG, type ObjectType } from "./object-config"
import { ObjectAvatar } from "./ObjectAvatar"

const objectToneClasses: Record<ObjectType, string> = {
  client: "[--object-color:var(--obj-client,var(--v3-secondary))] [--object-bg:var(--v3-secondary-soft)]",
  worker: "[--object-color:var(--obj-worker,var(--v3-primary))] [--object-bg:var(--v3-primary-soft)]",
  service: "[--object-color:var(--obj-service,var(--v3-gold))] [--object-bg:var(--v3-gold-soft)]",
  booking: "[--object-color:var(--obj-booking,#6E59C7)] [--object-bg:#ECE7F8]",
  salon: "[--object-color:var(--obj-salon,var(--v3-accent))] [--object-bg:#E1EEFB]",
}

export type ObjectPreviewProps = {
  type: ObjectType
  id: string
  label: string
  slug: string
  meta?: string
  avatarUrl?: string
  disableOnMobile?: boolean
  children: React.ReactNode
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

export function ObjectPreview({
  type,
  id,
  label,
  slug,
  meta,
  avatarUrl,
  disableOnMobile = true,
  children,
}: ObjectPreviewProps): JSX.Element {
  const [open, setOpen] = React.useState(false)
  const isMobile = useMediaQuery("(max-width: 768px)")
  const timeoutRef = React.useRef<number | null>(null)
  const config = OBJECT_TYPE_CONFIG[type]
  const href = config.getRoute(slug, id)

  const clearOpenTimer = React.useCallback((): void => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  const scheduleOpen = React.useCallback((): void => {
    if (isMobile) {
      return
    }

    clearOpenTimer()
    timeoutRef.current = window.setTimeout(() => setOpen(true), 300)
  }, [clearOpenTimer, isMobile])

  const closePreview = React.useCallback((): void => {
    clearOpenTimer()
    setOpen(false)
  }, [clearOpenTimer])

  React.useEffect(() => clearOpenTimer, [clearOpenTimer])

  if (isMobile && disableOnMobile) {
    return <>{children}</>
  }

  return (
    <Popover open={open && !isMobile} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span
          aria-haspopup="dialog"
          className="inline-flex"
          onBlur={closePreview}
          onFocus={scheduleOpen}
          onMouseEnter={scheduleOpen}
          onMouseLeave={closePreview}
        >
          {children}
        </span>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn(
          objectToneClasses[type],
          "w-80 overflow-hidden rounded-[var(--v3-r-md)] border border-[var(--v3-border)] bg-white p-0 shadow-[var(--v3-shadow-modal)]"
        )}
        onMouseEnter={scheduleOpen}
        onMouseLeave={closePreview}
      >
        <div className="flex items-start gap-3 border-b border-[var(--v3-border)] p-4">
          <ObjectAvatar avatarUrl={avatarUrl} label={label} size="lg" type={type} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-base font-bold text-[var(--v3-text-primary)]">
              {label}
            </div>
            {meta ? (
              <div className="mt-1 truncate text-xs text-[var(--v3-text-secondary)]">
                {meta}
              </div>
            ) : null}
            <div className="mt-2 inline-flex rounded-[var(--v3-r-pill)] bg-[var(--object-bg)] px-2 py-0.5 text-[10px] font-bold uppercase text-[var(--object-color)]">
              {config.label}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-[var(--v3-bg-alt)] p-3">
          <Link
            className="inline-flex h-8 items-center justify-center rounded-[var(--v3-r-pill)] bg-[var(--v3-primary)] px-3 text-xs font-semibold text-white transition-colors hover:bg-[var(--v3-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--object-color)] focus-visible:ring-offset-1"
            href={href}
            onClick={(event) => event.stopPropagation()}
          >
            Otworz profil
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  )
}
