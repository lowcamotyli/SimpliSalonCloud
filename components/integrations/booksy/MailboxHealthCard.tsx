"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
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

type PendingAction =
  | "set_primary"
  | "deactivate"
  | "refresh_watch"
  | "replay"
  | "reconcile"
  | null

function getAuthBadgeVariant(status: MailboxAuthStatus): "success" | "warning" | "destructive" {
  if (status === "connected") {
    return "success"
  }

  if (status === "reauth_required") {
    return "warning"
  }

  return "destructive"
}

function getWatchBadgeVariant(status: WatchStatus | null): "success" | "destructive" {
  return status === "active" ? "success" : "destructive"
}

function formatWatchLabel(status: WatchStatus | null): string {
  if (status === null) {
    return "brak"
  }

  return status
}

function encodeReconnectState(accountId: string): string {
  const json = JSON.stringify({ action: "reconnect_mailbox", accountId })
  const encoded = btoa(unescape(encodeURIComponent(json)))
  return encoded.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

export function MailboxHealthCard({ mailbox, watch, salonSlug }: MailboxHealthCardProps): JSX.Element {
  const router = useRouter()
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)

  const returnPath = useMemo<string>(
    (): string => `/${salonSlug}/settings/integrations/booksy`,
    [salonSlug]
  )

  const runPostAction = async (
    action: Exclude<PendingAction, null>,
    url: string,
    body: Record<string, string>
  ): Promise<void> => {
    setPendingAction(action)

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`)
      }

      router.replace(returnPath)
      router.refresh()
    } finally {
      setPendingAction(null)
    }
  }

  const onReconnect = (): void => {
    const state = encodeReconnectState(mailbox.id)
    const url = `/api/integrations/gmail-send?state=${encodeURIComponent(state)}`
    window.location.assign(url)
  }

  return (
    <Card>
      <CardHeader className="space-y-3">
        <CardTitle className="text-base font-semibold">{mailbox.gmail_email}</CardTitle>
        <div className="text-sm text-muted-foreground">{mailbox.mailbox_label ?? "Bez etykiety"}</div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={getAuthBadgeVariant(mailbox.auth_status)}>
            auth: {mailbox.auth_status}
          </Badge>
          <Badge variant={getWatchBadgeVariant(watch?.watch_status ?? null)}>
            watch: {formatWatchLabel(watch?.watch_status ?? null)}
          </Badge>
          {mailbox.is_primary ? <Badge variant="secondary">główna</Badge> : null}
          {!mailbox.is_active ? <Badge variant="outline">nieaktywna</Badge> : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-1 text-xs text-muted-foreground">
          <div>Watch wygasa: {watch?.watch_expiration_at ?? "brak"}</div>
          <div>Ostatnia notyfikacja: {watch?.last_notification_at ?? "brak"}</div>
          <div>Ostatni błąd: {watch?.last_error ?? "brak"}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!mailbox.is_primary ? (
            <Button
              disabled={pendingAction !== null}
              onClick={(): Promise<void> =>
                runPostAction("set_primary", "/api/integrations/booksy/health", {
                  action: "set_primary",
                  accountId: mailbox.id,
                })
              }
              size="sm"
              type="button"
              variant="secondary"
            >
              {pendingAction === "set_primary" ? "Trwa..." : "Ustaw jako główną"}
            </Button>
          ) : null}
          <Button
            disabled={pendingAction !== null}
            onClick={(): Promise<void> =>
              runPostAction("deactivate", "/api/integrations/booksy/health", {
                action: "deactivate",
                accountId: mailbox.id,
              })
            }
            size="sm"
            type="button"
            variant="destructive"
          >
            {pendingAction === "deactivate" ? "Trwa..." : "Dezaktywuj"}
          </Button>
          {mailbox.auth_status === "reauth_required" ? (
            <Button
              disabled={pendingAction !== null}
              onClick={onReconnect}
              size="sm"
              type="button"
              variant="outline"
            >
              Ponów autoryzację
            </Button>
          ) : null}
          <Button
            disabled={pendingAction !== null}
            onClick={(): Promise<void> =>
              runPostAction("refresh_watch", "/api/integrations/booksy/watch", {
                accountId: mailbox.id,
              })
            }
            size="sm"
            type="button"
            variant="outline"
          >
            {pendingAction === "refresh_watch" ? "Trwa..." : "Odśwież watch"}
          </Button>
          <Button
            disabled={pendingAction !== null}
            onClick={(): Promise<void> =>
              runPostAction("replay", "/api/integrations/booksy/replay", {
                accountId: mailbox.id,
              })
            }
            size="sm"
            type="button"
            variant="outline"
          >
            {pendingAction === "replay" ? "Trwa..." : "Replay 24h"}
          </Button>
          <Button
            disabled={pendingAction !== null}
            onClick={(): Promise<void> =>
              runPostAction("reconcile", "/api/integrations/booksy/reconcile", {
                accountId: mailbox.id,
              })
            }
            size="sm"
            type="button"
            variant="outline"
          >
            {pendingAction === "reconcile" ? "Trwa..." : "Pełny reconcile 14 dni"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
