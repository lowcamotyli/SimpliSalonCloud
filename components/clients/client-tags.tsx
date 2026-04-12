"use client"

import * as React from "react"
import { Loader2, X } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type ClientTagsProps = {
  clientId: string
  initialTags: string[]
  onUpdate?: (tags: string[]) => void
}

type DistinctTagsResponse =
  | { tags?: string[]; suggestions?: string[]; clients?: Array<{ tags?: string[] | null }> }
  | Array<{ tags?: string[] | null }>

function normalizeTag(value: string) {
  return value.trim().toLowerCase()
}

function normalizeTags(values: string[]) {
  return Array.from(
    new Set(values.map(normalizeTag).filter(Boolean))
  )
}

function extractSuggestions(payload: DistinctTagsResponse): string[] {
  if (Array.isArray(payload)) {
    return normalizeTags(payload.flatMap((item) => item.tags ?? []))
  }

  if (Array.isArray(payload.tags)) {
    return normalizeTags(payload.tags)
  }

  if (Array.isArray(payload.suggestions)) {
    return normalizeTags(payload.suggestions)
  }

  if (Array.isArray(payload.clients)) {
    return normalizeTags(payload.clients.flatMap((client) => client.tags ?? []))
  }

  return []
}

export function ClientTags({ clientId, initialTags, onUpdate }: ClientTagsProps) {
  const [tags, setTags] = React.useState(() => normalizeTags(initialTags))
  const [inputValue, setInputValue] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const [suggestions, setSuggestions] = React.useState<string[]>([])
  const datalistId = React.useId()

  React.useEffect(() => {
    setTags(normalizeTags(initialTags))
  }, [initialTags])

  React.useEffect(() => {
    let cancelled = false

    async function loadSuggestions() {
      try {
        const response = await fetch("/api/clients?distinct_tags=true&limit=20", {
          method: "GET",
          credentials: "same-origin",
        })

        if (!response.ok) {
          return
        }

        const data = (await response.json()) as DistinctTagsResponse
        if (!cancelled) {
          setSuggestions(extractSuggestions(data))
        }
      } catch {
        if (!cancelled) {
          setSuggestions([])
        }
      }
    }

    void loadSuggestions()

    return () => {
      cancelled = true
    }
  }, [])

  const saveTags = React.useCallback(
    async (nextTags: string[], previousTags: string[]) => {
      setTags(nextTags)
      setLoading(true)

      try {
        const response = await fetch(`/api/clients/${clientId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ tags: nextTags }),
        })

        if (!response.ok) {
          throw new Error("Failed to save client tags")
        }

        setSuggestions((current) => normalizeTags([...current, ...nextTags]))
        onUpdate?.(nextTags)
      } catch (error) {
        setTags(previousTags)
        console.error("Failed to update client tags", error)
      } finally {
        setLoading(false)
      }
    },
    [clientId, onUpdate]
  )

  const addTag = React.useCallback(async () => {
    const nextTag = normalizeTag(inputValue)
    if (!nextTag || tags.includes(nextTag) || loading) {
      return
    }

    const previousTags = tags
    const nextTags = [...tags, nextTag]
    setInputValue("")
    await saveTags(nextTags, previousTags)
  }, [inputValue, loading, saveTags, tags])

  const removeTag = React.useCallback(
    async (tagToRemove: string) => {
      if (loading) {
        return
      }

      const previousTags = tags
      const nextTags = tags.filter((tag) => tag !== tagToRemove)
      await saveTags(nextTags, previousTags)
    },
    [loading, saveTags, tags]
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <Badge key={tag} variant="secondary" className="gap-1 pr-1">
            <span>{tag}</span>
            <button
              type="button"
              className="rounded-full p-0.5 transition-colors hover:bg-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none"
              onClick={() => void removeTag(tag)}
              disabled={loading}
              aria-label={`Remove tag ${tag}`}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>

      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          void addTag()
        }}
      >
        <Input
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          placeholder="Add a tag"
          list={datalistId}
          disabled={loading}
        />
        <datalist id={datalistId}>
          {suggestions.map((suggestion) => (
            <option key={suggestion} value={suggestion} />
          ))}
        </datalist>
        <Button type="submit" size="icon" disabled={loading || !normalizeTag(inputValue)}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "+"}
        </Button>
      </form>
    </div>
  )
}
