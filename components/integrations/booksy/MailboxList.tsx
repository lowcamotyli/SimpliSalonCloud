"use client"

import { AddMailboxButton } from "./AddMailboxButton"
import { MailboxHealthCard } from "./MailboxHealthCard"

type MailboxAuthStatus = "connected" | "reauth_required" | "disconnected"

type Mailbox = {
  id: string
  gmail_email: string
  mailbox_label: string | null
  auth_status: MailboxAuthStatus
  is_active: boolean
  is_primary: boolean
}

type WatchStatus = "active" | "expired" | "failed" | "stopped"

type MailboxHealth = {
  accountId: string
  watchStatus: "active" | "expired" | "error" | "pending" | "stopped" | null
  watchExpiresAt: string | null
  lastNotificationAt: string | null
}

type HealthResponse = {
  mailboxes: MailboxHealth[]
} | null

interface MailboxListProps {
  mailboxes: Mailbox[]
  health: HealthResponse
  salonSlug: string
}

function mapWatchStatus(status: MailboxHealth["watchStatus"]): WatchStatus | null {
  if (status === "active" || status === "expired" || status === "stopped") {
    return status
  }

  if (status === "error" || status === "pending") {
    return "failed"
  }

  return null
}

export function MailboxList({ mailboxes, health, salonSlug }: MailboxListProps): JSX.Element {
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">Skrzynki Booksy</h2>
      <div className="space-y-4">
        {mailboxes.map((mailbox) => {
          const watchData = health?.mailboxes.find((item) => item.accountId === mailbox.id)

          return (
            <MailboxHealthCard
              key={mailbox.id}
              mailbox={mailbox}
              salonSlug={salonSlug}
              watch={
                watchData
                  ? {
                      watch_status: mapWatchStatus(watchData.watchStatus),
                      watch_expiration_at: watchData.watchExpiresAt,
                      last_notification_at: watchData.lastNotificationAt,
                      last_error: null,
                    }
                  : null
              }
            />
          )
        })}
      </div>
      <AddMailboxButton salonSlug={salonSlug} />
    </section>
  )
}
