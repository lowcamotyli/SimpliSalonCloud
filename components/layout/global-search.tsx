"use client"

import { Search, X } from "lucide-react"
import { useRouter } from "next/navigation"
import * as React from "react"

import { OBJECT_TYPE_CONFIG, ObjectPill, ObjectTrigger, type ObjectType } from "@/components/objects"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

type GlobalSearchProps = {
  slug: string
  className?: string
}

type SearchResultItem = {
  id: string
  label: string
  meta: string
  avatarUrl?: string
}

type SearchResultGroup = {
  type: ObjectType
  items: SearchResultItem[]
}

type SearchApiResponse = {
  results?: SearchResultGroup[]
}

type FlatResult = {
  key: string
  type: ObjectType
  item: SearchResultItem
}

const SEARCH_ORDER: ObjectType[] = ["client", "booking", "worker", "service", "salon"]
const SEARCH_DEBOUNCE_MS = 180
const SEARCH_CACHE_LIMIT = 25
const GROUP_LABELS: Record<ObjectType, string> = {
  client: "Klienci",
  worker: "Pracownicy",
  service: "Usługi",
  booking: "Wizyty",
  salon: "Lokalizacje",
}

function isObjectType(value: string): value is ObjectType {
  return value in OBJECT_TYPE_CONFIG
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  if (target.isContentEditable) {
    return true
  }

  return target.closest("input, textarea, select, [contenteditable='true']") !== null
}

function normalizeResponse(payload: unknown): SearchResultGroup[] {
  const body = payload as SearchApiResponse
  if (!body?.results || !Array.isArray(body.results)) {
    return []
  }

  const normalized: SearchResultGroup[] = []

  for (const group of body.results) {
    if (!group || typeof group !== "object") {
      continue
    }

    const typeValue = String((group as { type?: unknown }).type ?? "")
    if (!isObjectType(typeValue)) {
      continue
    }

    const rawItems = (group as { items?: unknown }).items
    if (!Array.isArray(rawItems)) {
      continue
    }

    const items: SearchResultItem[] = []

    for (const rawItem of rawItems) {
      if (!rawItem || typeof rawItem !== "object") {
        continue
      }

      const candidate = rawItem as {
        id?: unknown
        label?: unknown
        meta?: unknown
        avatarUrl?: unknown
      }

      const id = String(candidate.id ?? "")
      const label = String(candidate.label ?? "")
      const meta = String(candidate.meta ?? "")
      const avatarUrl = typeof candidate.avatarUrl === "string" ? candidate.avatarUrl : undefined

      if (!id || !label) {
        continue
      }

      items.push({
        id,
        label,
        meta,
        avatarUrl,
      })
    }

    normalized.push({
      type: typeValue,
      items,
    })
  }

  normalized.sort((a, b) => SEARCH_ORDER.indexOf(a.type) - SEARCH_ORDER.indexOf(b.type))
  return normalized
}

export function GlobalSearch({ slug, className }: GlobalSearchProps): JSX.Element {
  const router = useRouter()

  const wrapperRef = React.useRef<HTMLDivElement | null>(null)
  const inputRef = React.useRef<HTMLInputElement | null>(null)
  const rowRefs = React.useRef<Record<string, HTMLDivElement | null>>({})
  const cacheRef = React.useRef<Map<string, SearchResultGroup[]>>(new Map())

  const [query, setQuery] = React.useState("")
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [groups, setGroups] = React.useState<SearchResultGroup[]>([])
  const [activeIndex, setActiveIndex] = React.useState(0)

  const normalizedQuery = query.trim()
  const canSearch = normalizedQuery.length >= 2

  const flatResults = React.useMemo<FlatResult[]>(() => {
    const items: FlatResult[] = []

    for (const group of groups) {
      for (const item of group.items) {
        items.push({
          key: `${group.type}:${item.id}`,
          type: group.type,
          item,
        })
      }
    }

    return items
  }, [groups])

  const hasResults = flatResults.length > 0

  React.useEffect(() => {
    const onDocumentMouseDown = (event: MouseEvent): void => {
      if (!wrapperRef.current) {
        return
      }

      if (!wrapperRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener("mousedown", onDocumentMouseDown)
    return () => document.removeEventListener("mousedown", onDocumentMouseDown)
  }, [])

  React.useEffect(() => {
    const onWindowKeyDown = (event: KeyboardEvent): void => {
      const key = typeof event.key === "string" ? event.key.toLowerCase() : ""

      if (isEditableTarget(event.target) && key === "k" && (event.ctrlKey || event.metaKey)) {
        return
      }

      if ((event.ctrlKey || event.metaKey) && key === "k") {
        event.preventDefault()
        inputRef.current?.focus()
        setOpen(true)
        return
      }

      if (event.key !== "Escape" || !open) {
        return
      }

      event.preventDefault()
      setOpen(false)
      inputRef.current?.focus()
    }

    window.addEventListener("keydown", onWindowKeyDown)
    return () => window.removeEventListener("keydown", onWindowKeyDown)
  }, [open])

  React.useEffect(() => {
    if (!canSearch) {
      setLoading(false)
      setGroups([])
      setActiveIndex(0)
      return
    }

    const cacheKey = `${slug}:${normalizedQuery.toLocaleLowerCase("pl-PL")}`
    const cachedGroups = cacheRef.current.get(cacheKey)
    if (cachedGroups) {
      setLoading(false)
      setGroups(cachedGroups)
      setActiveIndex(0)
      setOpen(true)
      return
    }

    const controller = new AbortController()
    const timeout = window.setTimeout(() => {
      const run = async (): Promise<void> => {
        setLoading(true)

        try {
          const params = new URLSearchParams({
            q: normalizedQuery,
            slug,
          })

          const response = await fetch(`/api/search?${params.toString()}`, {
            method: "GET",
            signal: controller.signal,
          })

          if (!response.ok) {
            setGroups([])
            setActiveIndex(0)
            setOpen(true)
            return
          }

          const payload = (await response.json()) as unknown
          const nextGroups = normalizeResponse(payload)
          const cache = cacheRef.current

          if (cache.size >= SEARCH_CACHE_LIMIT) {
            const firstKey = cache.keys().next().value
            if (firstKey) {
              cache.delete(firstKey)
            }
          }

          cache.set(cacheKey, nextGroups)

          setGroups(nextGroups)
          setActiveIndex(0)
          setOpen(true)
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") {
            return
          }

          setGroups([])
          setActiveIndex(0)
          setOpen(true)
        } finally {
          setLoading(false)
        }
      }

      void run()
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [canSearch, normalizedQuery, slug])

  React.useEffect(() => {
    if (flatResults.length === 0) {
      return
    }

    const index = Math.max(0, Math.min(activeIndex, flatResults.length - 1))
    const target = flatResults[index]
    if (!target) {
      return
    }

    rowRefs.current[target.key]?.scrollIntoView({ block: "nearest" })
  }, [activeIndex, flatResults])

  const navigateTo = React.useCallback(
    (type: ObjectType, id: string): void => {
      const route = OBJECT_TYPE_CONFIG[type].getRoute(slug, id)
      setOpen(false)
      router.push(route)
    },
    [router, slug]
  )

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (!open && event.key !== "Escape") {
      return
    }

    if (event.key === "ArrowDown") {
      event.preventDefault()
      if (flatResults.length === 0) {
        return
      }
      setActiveIndex((prev) => (prev + 1) % flatResults.length)
      return
    }

    if (event.key === "ArrowUp") {
      event.preventDefault()
      if (flatResults.length === 0) {
        return
      }
      setActiveIndex((prev) => (prev - 1 + flatResults.length) % flatResults.length)
      return
    }

    if (event.key === "Enter") {
      if (flatResults.length === 0) {
        return
      }

      event.preventDefault()
      const active = flatResults[activeIndex]
      if (!active) {
        return
      }

      navigateTo(active.type, active.item.id)
      return
    }

    if (event.key === "Escape") {
      event.preventDefault()
      setOpen(false)
      inputRef.current?.focus()
      return
    }

    if (event.key === "Tab") {
      const active = flatResults[activeIndex]
      if (!active) {
        return
      }

      const row = rowRefs.current[active.key]
      if (!row) {
        return
      }

      const focusables = row.querySelectorAll<HTMLElement>("a, button, [tabindex]:not([tabindex='-1'])")
      if (focusables.length === 0) {
        return
      }

      event.preventDefault()
      if (event.shiftKey) {
        const target = focusables[focusables.length - 1]
        target?.focus()
        return
      }

      row.focus()
    }
  }

  const shouldShowPanel = open && canSearch

  return (
    <div ref={wrapperRef} className={cn("relative w-full", className)}>
      <div className="search relative flex h-10 items-center rounded-full border border-white/30 bg-white/15 pl-[38px] pr-[14px] focus-within:ring-2 focus-within:ring-white/60 focus-within:ring-offset-0">
        <Search className="pointer-events-none absolute left-[14px] h-4 w-4 text-white/85" aria-hidden="true" />
        <Input
          ref={inputRef}
          aria-label="Wyszukiwarka globalna"
          className="h-8 min-w-0 border-0 bg-transparent px-0 py-0 text-sm text-white shadow-none placeholder:text-white/75 focus-visible:ring-0 focus-visible:ring-offset-0"
          onChange={(event) => {
            setQuery(event.target.value)
            if (!open) {
              setOpen(true)
            }
          }}
          onFocus={() => {
            if (canSearch) {
              setOpen(true)
            }
          }}
          onKeyDown={handleInputKeyDown}
          placeholder="Szukaj klientów, rezerwacji..."
          type="text"
          value={query}
        />
        {query ? (
          <button
            aria-label="Wyczyść wyszukiwanie"
            className="mr-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white/75 transition-colors hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            onClick={() => {
              setQuery("")
              setGroups([])
              setActiveIndex(0)
              setOpen(false)
              inputRef.current?.focus()
            }}
            type="button"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : null}
        <kbd className="hidden rounded-md border border-white/30 px-1.5 py-0.5 text-[10px] text-white/75 md:inline-flex">
          Ctrl K
        </kbd>
      </div>

      {shouldShowPanel ? (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-[min(calc(100vw-24px),440px)] rounded-[var(--v3-r-md)] border border-[var(--v3-border)] bg-white shadow-[var(--v3-shadow-modal)] sm:min-w-[400px]">
          <div className="max-h-[min(60vh,560px)] overflow-y-auto p-2">
            {loading ? (
              <div className="space-y-4 p-2">
                {SEARCH_ORDER.map((type) => (
                  <div key={`skeleton:${type}`} className="space-y-2">
                    <div className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {OBJECT_TYPE_CONFIG[type].label}
                    </div>
                    <div className="space-y-2">
                      <div className="rounded-lg border p-2">
                        <Skeleton className="h-5 w-40" />
                        <Skeleton className="mt-2 h-4 w-56" />
                      </div>
                      <div className="rounded-lg border p-2">
                        <Skeleton className="h-5 w-40" />
                        <Skeleton className="mt-2 h-4 w-56" />
                      </div>
                      <div className="rounded-lg border p-2">
                        <Skeleton className="h-5 w-40" />
                        <Skeleton className="mt-2 h-4 w-56" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : hasResults ? (
              <ul aria-label="Wyniki wyszukiwania" className="space-y-3" role="listbox">
                {groups.map((group) => (
                  <li key={group.type} aria-label={GROUP_LABELS[group.type]} role="presentation">
                    <div role="group" aria-label={GROUP_LABELS[group.type]}>
                      <div className="px-2 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {GROUP_LABELS[group.type]}
                      </div>
                      <div className="space-y-1">
                        {group.items.map((item) => {
                          const flatKey = `${group.type}:${item.id}`
                          const index = flatResults.findIndex((result) => result.key === flatKey)
                          const isActive = index === activeIndex

                          return (
                            <div
                              key={flatKey}
                              ref={(node) => {
                                rowRefs.current[flatKey] = node
                              }}
                              aria-selected={isActive}
                              className={cn(
                                "flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2 py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                                isActive && "bg-accent"
                              )}
                              onClick={() => navigateTo(group.type, item.id)}
                              onClickCapture={(event) => {
                                const target = event.target as HTMLElement
                                if (target.closest("a")) {
                                  setOpen(false)
                                }
                              }}
                              onFocusCapture={() => {
                                if (index >= 0) {
                                  setActiveIndex(index)
                                }
                              }}
                              onKeyDown={(event) => {
                                if (event.key === "Tab" && !event.shiftKey) {
                                  const quickAction = event.currentTarget.querySelector<HTMLButtonElement>("button")
                                  if (quickAction) {
                                    event.preventDefault()
                                    quickAction.focus()
                                  }
                                  return
                                }

                                if (event.key !== "Enter") {
                                  return
                                }

                                event.preventDefault()
                                navigateTo(group.type, item.id)
                              }}
                              onMouseEnter={() => {
                                if (index >= 0) {
                                  setActiveIndex(index)
                                }
                              }}
                              role="option"
                              tabIndex={isActive ? 0 : -1}
                            >
                              <div className="min-w-0 flex-1">
                                <ObjectPill
                                  avatarUrl={item.avatarUrl}
                                  id={item.id}
                                  label={item.label}
                                  slug={slug}
                                  type={group.type}
                                />
                                <div className="mt-1 truncate text-xs text-muted-foreground">{item.meta}</div>
                              </div>
                              <ObjectTrigger
                                avatarUrl={item.avatarUrl}
                                id={item.id}
                                label={item.label}
                                meta={item.meta}
                                slug={slug}
                                type={group.type}
                              />
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-4 text-sm text-muted-foreground">Brak wyników dla: {normalizedQuery}</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
