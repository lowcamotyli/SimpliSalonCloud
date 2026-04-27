"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type MailboxAuthStatus = "connected" | "reauth_required" | "disconnected"
type WatchStatus = "active" | "expired" | "failed" | "stopped"

type Mailbox = {
  id: string
  gmail_email: string
  mailbox_label: string | null
  auth_status: MailboxAuthStatus
  is_active: boolean
  is_primary: boolean
}

type WatchHealth = {
  watch_status: WatchStatus | null
  watch_expiration_at: string | null
  last_notification_at: string | null
  last_error: string | null
} | null

interface MailboxHealthCardProps {
  mailbox: Mailbox
  watch: WatchHealth
  salonSlug: string
}

type PendingAction = "set_primary" | "deactivate" | "refresh_watch" | "replay" | "reconcile" | null
const ACTION_LABELS: Record<Exclude<PendingAction, null>, string> = {
  refresh_watch: "Odświeżanie subskrypcji",
  replay: "Pobieranie maili",
  reconcile: "Synchronizacja",
  set_primary: "Ustawianie jako główna",
  deactivate: "Rozłączanie",
}

function getAuthBadgeVariant(status: MailboxAuthStatus): "success" | "warning" | "destructive" {
  if (status === "connected") return "success"
  if (status === "reauth_required") return "warning"
  return "destructive"
}

function getAuthLabel(status: MailboxAuthStatus): string {
  if (status === "connected") return "Połączona"
  if (status === "reauth_required") return "Wymaga autoryzacji"
  return "Rozłączona"
}

function getWatchBadgeVariant(status: WatchStatus | null): "success" | "destructive" {
  return status === "active" ? "success" : "destructive"
}

function getWatchLabel(status: WatchStatus): string {
  if (status === "active") return "Subskrypcja aktywna"
  if (status === "expired") return "Subskrypcja wygasła"
  return "Subskrypcja zatrzymana"
}

function formatWatchExpiry(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  const days = Math.floor((date.getTime() - Date.now()) / 86_400_000)
  if (days < 0) return "Subskrypcja wygasła"
  if (days === 0) return "Subskrypcja wygasa dzisiaj"
  if (days === 1) return "Subskrypcja wygasa jutro"
  return `Subskrypcja wygasa za ${days} dni`
}

function formatRelativeTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  const minutes = Math.floor((Date.now() - date.getTime()) / 60_000)
  if (minutes < 1) return "przed chwilą"
  if (minutes < 60) return `${minutes} min temu`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} godz. temu`
  return `${Math.floor(hours / 24)} dni temu`
}

export function MailboxHealthCard({ mailbox, watch, salonSlug }: MailboxHealthCardProps): JSX.Element {
  const router = useRouter()
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)

  const returnPath = useMemo<string>(
    (): string => `/${salonSlug}/booksy`,
    [salonSlug]
  )

  const runPostAction = async (
    action: Exclude<PendingAction, null>,
    url: string,
    body: Record<string, string>
  ): Promise<void> => {
    setPendingAction(action)
    const toastId = toast.loading(`${ACTION_LABELS[action]}...`)

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        let message = `Błąd ${response.status}`

        try {
          const payload = (await response.json()) as { error?: string; message?: string }
          message = payload.error || payload.message || message
        } catch {
          // Ignore invalid JSON payloads and keep the status-based fallback.
        }

        if (response.status === 503 && action === "refresh_watch") {
          message = "Subskrypcja Gmail jest chwilowo wyłączona. Spróbuj ponownie później."
        }

        toast.error(message, { id: toastId })
        return
      }

      toast.success("Gotowe", { id: toastId })
      router.replace(returnPath)
      router.refresh()
    } catch {
      toast.error("Nie udało się wykonać akcji. Sprawdź połączenie i spróbuj ponownie.", { id: toastId })
    } finally {
      setPendingAction(null)
    }
  }

  const onReconnect = (): void => {
    const url = `/api/integrations/booksy/auth?action=reconnect_mailbox&accountId=${encodeURIComponent(mailbox.id)}`
    window.location.assign(url)
  }

  const watchExpiry = watch?.watch_status === "active" && watch.watch_expiration_at ? formatWatchExpiry(watch.watch_expiration_at) : null
  const lastNotif = watch?.last_notification_at ? formatRelativeTime(watch.last_notification_at) : null

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <CardTitle className="text-base font-semibold">{mailbox.gmail_email}</CardTitle>
            {mailbox.mailbox_label ? (
              <p className="mt-0.5 text-sm text-muted-foreground">{mailbox.mailbox_label}</p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap gap-1.5">
            {mailbox.is_primary ? <Badge variant="secondary">Główna</Badge> : null}
            {!mailbox.is_active ? <Badge variant="outline">Nieaktywna</Badge> : null}
            <Badge variant={getAuthBadgeVariant(mailbox.auth_status)}>
              {getAuthLabel(mailbox.auth_status)}
            </Badge>
            {watch?.watch_status ? (
              <Badge variant={getWatchBadgeVariant(watch.watch_status)}>
                {getWatchLabel(watch.watch_status)}
              </Badge>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
          {watchExpiry ? <span>{watchExpiry}</span> : null}
          {lastNotif ? <span>Ostatnia notyfikacja: {lastNotif}</span> : null}
          {watch?.last_error ? (
            <span className="text-red-600">Błąd: {watch.last_error}</span>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <div className="flex flex-wrap items-center gap-2">
          {mailbox.auth_status === "reauth_required" ? (
            <Button disabled={pendingAction !== null} onClick={onReconnect} size="sm" type="button" variant="default">
              Ponów autoryzację
            </Button>
          ) : null}
          <Button
            disabled={pendingAction !== null}
            onClick={(): Promise<void> => runPostAction("refresh_watch", "/api/integrations/booksy/watch", { accountId: mailbox.id })}
            size="sm" type="button" variant="outline"
          >
            {pendingAction === "refresh_watch" ? "Trwa..." : "Odśwież subskrypcję"}
          </Button>
          <Button
            disabled={pendingAction !== null}
            onClick={(): Promise<void> => runPostAction("replay", "/api/integrations/booksy/replay", { accountId: mailbox.id })}
            size="sm" type="button" variant="outline"
          >
            {pendingAction === "replay" ? "Trwa..." : "Pobierz maile (24h)"}
          </Button>
          <Button
            disabled={pendingAction !== null}
            onClick={(): Promise<void> => runPostAction("reconcile", "/api/integrations/booksy/reconcile", { accountId: mailbox.id })}
            size="sm" type="button" variant="outline"
          >
            {pendingAction === "reconcile" ? "Trwa..." : "Pełna synchronizacja (14 dni)"}
          </Button>
          <div className="ml-auto flex gap-2">
            {!mailbox.is_primary ? (
              <Button
                disabled={pendingAction !== null}
                onClick={(): Promise<void> => runPostAction("set_primary", "/api/integrations/booksy/health", { action: "set_primary", accountId: mailbox.id })}
                size="sm" type="button" variant="ghost"
              >
                {pendingAction === "set_primary" ? "Trwa..." : "Ustaw jako główną"}
              </Button>
            ) : null}
            <Button
              disabled={pendingAction !== null}
              onClick={(): Promise<void> => runPostAction("deactivate", "/api/integrations/booksy/health", { action: "deactivate", accountId: mailbox.id })}
              size="sm" type="button" variant="ghost"
              className="text-destructive hover:text-destructive"
            >
              {pendingAction === "deactivate" ? "Trwa..." : "Rozłącz"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
