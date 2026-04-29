"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertCircle, ArrowDownAZ, ArrowUpAZ, CalendarClock, Loader2, Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

type StatusColor = "green" | "yellow" | "red" | "gray"
type StatusGroup = "error" | "pending" | "done"
type EventType = "created" | "cancelled" | "rescheduled" | "unknown"
type SortField = "emailDate" | "visitDate" | "processedDate"
type SortDirection = "asc" | "desc"

export type MailboxEmailActivityItem = {
  id: string
  subject: string
  fullSubject: string
  fromAddress: string | null
  internalDate: string | null
  createdAt: string
  parseStatus: string
  ingestSource: string
  sourceLabel: string
  relativeTime: string
  status: {
    label: string
    color: StatusColor
    group: StatusGroup
  }
  eventType: EventType
  eventLabel: string
  eventStatus: string | null
  confidenceScore: number | null
  clientInfo: string | null
  bookingInfo: string | null
  bookingDate: string | null
  bookingTime: string | null
  serviceName: string | null
  errorMessage: string | null
  storagePath: string | null
  gmailMessageId: string | null
  gmailThreadId: string | null
  messageIdHeader: string | null
  rawSha256: string | null
  parsedPayload: unknown
  applyLedger: unknown
}

type EmailDetails = {
  rawText: string | null
  htmlText: string | null
  rawSizeBytes: number | null
  storagePath: string | null
}

type DetailsState =
  | { status: "idle"; data: null; error: null }
  | { status: "loading"; data: null; error: null }
  | { status: "loaded"; data: EmailDetails; error: null }
  | { status: "error"; data: null; error: string }

const statusFilterLabels: Record<string, string> = {
  all: "Wszystkie statusy",
  error: "Błędy",
  pending: "Do sprawdzenia",
  done: "Zakończone",
}

function getColorClasses(color: StatusColor): { dot: string; badge: string } {
  if (color === "green") {
    return {
      dot: "bg-emerald-500",
      badge: "text-emerald-700 bg-emerald-50 border-emerald-200",
    }
  }

  if (color === "yellow") {
    return {
      dot: "bg-amber-400",
      badge: "text-amber-700 bg-amber-50 border-amber-200",
    }
  }

  if (color === "red") {
    return {
      dot: "bg-red-500",
      badge: "text-red-700 bg-red-50 border-red-200",
    }
  }

  return {
    dot: "bg-gray-300",
    badge: "text-gray-600 bg-gray-50 border-gray-200",
  }
}

function getSortDate(email: MailboxEmailActivityItem, sortField: SortField): number {
  if (sortField === "visitDate" && email.bookingDate) {
    const value = `${email.bookingDate}T${email.bookingTime ?? "00:00"}`
    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) return date.getTime()
  }

  if (sortField === "emailDate" && email.internalDate) {
    const date = new Date(email.internalDate)
    if (!Number.isNaN(date.getTime())) return date.getTime()
  }

  const createdAt = new Date(email.createdAt)
  return Number.isNaN(createdAt.getTime()) ? 0 : createdAt.getTime()
}

function formatExactDate(value: string | null): string {
  if (!value) return "Brak"

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)
}

function formatVisitDate(email: MailboxEmailActivityItem): string {
  if (!email.bookingDate) return "Brak daty wizyty"
  return `${email.bookingDate}${email.bookingTime ? ` ${email.bookingTime}` : ""}`
}

function JsonBlock({ value }: { value: unknown }): JSX.Element {
  if (!value) {
    return <p className="text-sm text-muted-foreground">Brak danych.</p>
  }

  return (
    <pre className="max-h-80 overflow-auto rounded-xl border bg-muted/40 p-3 text-xs leading-relaxed text-foreground">
      {JSON.stringify(value, null, 2)}
    </pre>
  )
}

export function MailboxEmailActivityClient({ emails }: { emails: MailboxEmailActivityItem[] }): JSX.Element {
  const [sortField, setSortField] = useState<SortField>("emailDate")
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc")
  const [statusFilter, setStatusFilter] = useState("all")
  const [eventFilter, setEventFilter] = useState("all")
  const [query, setQuery] = useState("")
  const [selectedEmail, setSelectedEmail] = useState<MailboxEmailActivityItem | null>(null)
  const [details, setDetails] = useState<DetailsState>({ status: "idle", data: null, error: null })

  const visibleEmails = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return emails
      .filter((email) => statusFilter === "all" || email.status.group === statusFilter)
      .filter((email) => eventFilter === "all" || email.eventType === eventFilter)
      .filter((email) => {
        if (!normalizedQuery) return true

        return [
          email.fullSubject,
          email.clientInfo,
          email.serviceName,
          email.fromAddress,
          email.errorMessage,
          email.bookingDate,
          email.gmailMessageId,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedQuery))
      })
      .sort((left, right) => {
        const result = getSortDate(left, sortField) - getSortDate(right, sortField)
        return sortDirection === "asc" ? result : -result
      })
  }, [emails, eventFilter, query, sortDirection, sortField, statusFilter])

  useEffect(() => {
    if (!selectedEmail) {
      setDetails({ status: "idle", data: null, error: null })
      return
    }

    const controller = new AbortController()
    setDetails({ status: "loading", data: null, error: null })

    async function loadDetails(): Promise<void> {
      try {
        const response = await fetch(`/api/integrations/booksy/raw-emails/${selectedEmail?.id}`, {
          signal: controller.signal,
        })

        if (!response.ok) {
          const payload = await response.json().catch(() => null)
          throw new Error(payload?.message ?? "Nie udało się pobrać szczegółów maila")
        }

        const data = (await response.json()) as EmailDetails
        setDetails({ status: "loaded", data, error: null })
      } catch (error: unknown) {
        if (controller.signal.aborted) {
          return
        }

        setDetails({
          status: "error",
          data: null,
          error: error instanceof Error ? error.message : "Nie udało się pobrać szczegółów maila",
        })
      }
    }

    void loadDetails()

    return () => {
      controller.abort()
    }
  }, [selectedEmail])

  if (emails.length === 0) {
    return <div className="py-8 text-center text-sm text-gray-500">Brak przetworzonych emaili</div>
  }

  return (
    <>
      <div className="mb-3 grid gap-2 lg:grid-cols-[minmax(220px,1fr)_170px_170px_190px_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Szukaj klienta, usługi, błędu..."
            value={query}
          />
        </div>

        <Select onValueChange={setStatusFilter} value={statusFilter}>
          <SelectTrigger aria-label="Filtr statusu">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(statusFilterLabels).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select onValueChange={setEventFilter} value={eventFilter}>
          <SelectTrigger aria-label="Filtr typu">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Wszystkie typy</SelectItem>
            <SelectItem value="created">Nowe rezerwacje</SelectItem>
            <SelectItem value="cancelled">Anulowania</SelectItem>
            <SelectItem value="rescheduled">Zmiany terminu</SelectItem>
            <SelectItem value="unknown">Nieznane</SelectItem>
          </SelectContent>
        </Select>

        <Select onValueChange={(value) => setSortField(value as SortField)} value={sortField}>
          <SelectTrigger aria-label="Sortowanie">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="emailDate">Data maila</SelectItem>
            <SelectItem value="visitDate">Data wizyty</SelectItem>
            <SelectItem value="processedDate">Data zapisu</SelectItem>
          </SelectContent>
        </Select>

        <Button
          className="gap-2"
          onClick={() => setSortDirection((value) => (value === "asc" ? "desc" : "asc"))}
          type="button"
          variant="outline"
        >
          {sortDirection === "asc" ? <ArrowUpAZ className="h-4 w-4" /> : <ArrowDownAZ className="h-4 w-4" />}
          {sortDirection === "asc" ? "Rosnąco" : "Malejąco"}
        </Button>
      </div>

      <div className="mb-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>
          Widoczne: {visibleEmails.length} z {emails.length}
        </span>
        <span className="inline-flex items-center gap-1">
          <CalendarClock className="h-3.5 w-3.5" />
          Kliknij wpis, żeby zobaczyć treść maila
        </span>
      </div>

      {visibleEmails.length === 0 ? (
        <div className="rounded-xl border border-dashed py-8 text-center text-sm text-gray-500">
          Brak emaili dla wybranych filtrów
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {visibleEmails.map((email) => {
            const classes = getColorClasses(email.status.color)

            return (
              <li key={email.id}>
                <button
                  className="flex w-full items-start justify-between gap-3 py-3 text-left hover:bg-muted/30"
                  onClick={() => setSelectedEmail(email)}
                  type="button"
                >
                  <div className="min-w-0 flex-1 px-1">
                    <div className="flex items-start gap-2">
                      <span className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", classes.dot)} />
                      <div className="min-w-0 w-full">
                        <p className="truncate text-sm font-medium text-foreground">{email.subject}</p>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {email.eventLabel ? <Badge variant="outline">{email.eventLabel}</Badge> : null}
                          <Badge variant="outline">{formatVisitDate(email)}</Badge>
                        </div>
                        {email.clientInfo ? (
                          <p className="mt-1 text-xs font-medium text-foreground/70">{email.clientInfo}</p>
                        ) : null}
                        {email.bookingInfo ? (
                          <p className="mt-0.5 text-xs text-foreground/60">{email.bookingInfo}</p>
                        ) : null}
                        {email.errorMessage ? (
                          <p className="mt-0.5 truncate text-xs text-red-600" title={email.errorMessage}>
                            ↳ {email.errorMessage}
                          </p>
                        ) : null}
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Mail: {formatExactDate(email.internalDate)} · Dodano: {formatExactDate(email.createdAt)} ·{" "}
                          {email.sourceLabel}
                        </p>
                      </div>
                    </div>
                  </div>
                  <span className={cn("inline-flex shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium", classes.badge)}>
                    {email.status.label}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <Sheet open={Boolean(selectedEmail)} onOpenChange={(open) => !open && setSelectedEmail(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          {selectedEmail ? (
            <>
              <SheetHeader>
                <SheetTitle>Szczegóły maila</SheetTitle>
                <SheetDescription>{selectedEmail.fullSubject}</SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-5">
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold">Metadane</h3>
                  <dl className="grid gap-2 text-sm sm:grid-cols-2">
                    <Detail label="Status" value={selectedEmail.status.label} />
                    <Detail label="Typ" value={selectedEmail.eventLabel || "Nieznany"} />
                    <Detail label="Od" value={selectedEmail.fromAddress ?? "Brak"} />
                    <Detail label="Data maila" value={formatExactDate(selectedEmail.internalDate)} />
                    <Detail label="Data wizyty" value={formatVisitDate(selectedEmail)} />
                    <Detail label="Źródło" value={selectedEmail.sourceLabel} />
                    <Detail label="Gmail message id" value={selectedEmail.gmailMessageId ?? "Brak"} />
                    <Detail label="Storage path" value={selectedEmail.storagePath ?? "Brak"} />
                  </dl>
                </section>

                {selectedEmail.errorMessage ? (
                  <section className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <p>{selectedEmail.errorMessage}</p>
                    </div>
                  </section>
                ) : null}

                <section className="space-y-2">
                  <h3 className="text-sm font-semibold">Treść maila</h3>
                  {details.status === "loading" ? (
                    <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Pobieram maila z DB/storage...
                    </div>
                  ) : null}
                  {details.status === "error" ? (
                    <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{details.error}</p>
                  ) : null}
                  {details.status === "loaded" ? (
                    <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-xl border bg-muted/40 p-3 text-xs leading-relaxed text-foreground">
                      {details.data.rawText ?? details.data.htmlText ?? "Brak treści w zapisanym MIME."}
                    </pre>
                  ) : null}
                </section>

                <section className="space-y-2">
                  <h3 className="text-sm font-semibold">Dane sparsowane</h3>
                  <JsonBlock value={selectedEmail.parsedPayload} />
                </section>

                <section className="space-y-2">
                  <h3 className="text-sm font-semibold">Ledger zapisu</h3>
                  <JsonBlock value={selectedEmail.applyLedger} />
                </section>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  )
}

function Detail({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="min-w-0 rounded-xl border bg-background p-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-foreground">{value}</dd>
    </div>
  )
}
