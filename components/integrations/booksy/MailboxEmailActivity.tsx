import type { JSX } from "react"
import { formatDistanceToNow } from "date-fns"
import { pl } from "date-fns/locale"
import { Mail } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { createAdminSupabaseClient } from "@/lib/supabase/admin"

type MailboxEmailActivityProps = {
  salonId: string
}

type ApplyLedger = {
  operation: "created" | "updated" | "skipped" | "failed"
  error_message: string | null
}

type ParsedBookingPayload = {
  parsed?: {
    clientName?: string
    bookingDate?: string
    bookingTime?: string
    serviceName?: string
  }
}

type ParsedEvent = {
  event_type: "created" | "cancelled" | "rescheduled" | "unknown"
  status: "pending" | "applied" | "manual_review" | "discarded"
  confidence_score: number
  payload: ParsedBookingPayload | null
  booksy_apply_ledger: ApplyLedger[] | null
}

type RawEmail = {
  id: string
  subject: string | null
  from_address?: string | null
  internal_date: string | null
  parse_status: "pending" | "parsed" | "failed"
  ingest_source: string
  created_at: string
  booksy_parsed_events: ParsedEvent[] | null
}

const BOOKSY_BOOKING_SUBJECT_PATTERNS: RegExp[] = [
  /nowa rezerwacja/i,
  /odwołał[aeę]?\s+wizytę/i,
  /zmienił\s+rezerwację/i,
  /zmiany w rezerwacji/i,
]

function isBooksyBookingRow(email: RawEmail): boolean {
  // Decode subject first — encoded subjects (windows-1250, utf-8 QP) won't match Polish patterns
  const rawSubject = email.subject ?? ""
  const decoded = rawSubject
    .replace(
      /=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g,
      (_match, charset: string, encoding: string, text: string) => {
        try {
          if (encoding.toUpperCase() === "B") {
            return new TextDecoder(charset).decode(new Uint8Array(Buffer.from(text, "base64")))
          }
          return decodeQP(text, charset)
        } catch {
          return _match
        }
      }
    )
    .replace(/\s+/g, " ")
    .trim()
  return BOOKSY_BOOKING_SUBJECT_PATTERNS.some((pattern) => pattern.test(decoded))
}

function getEmailStatus(email: RawEmail): { label: string; color: "green" | "yellow" | "red" | "gray" } {
  if (email.parse_status === "failed") return { label: "Błąd parsowania", color: "red" }
  const event = email.booksy_parsed_events?.[0]
  if (!event) {
    // parsed=true but no event means email was deduplicated or skipped as non-booking
    if (email.parse_status === "parsed") return { label: "Przetworzone", color: "gray" }
    return { label: "Oczekuje", color: "yellow" }
  }
  const ledger = event.booksy_apply_ledger?.[0]
  if (!ledger) {
    if (event.status === "manual_review") return { label: "Do weryfikacji", color: "yellow" }
    if (event.status === "discarded") return { label: "Pominięto", color: "gray" }
    return { label: "W kolejce", color: "yellow" }
  }
  if (ledger.operation === "failed") return { label: "Błąd zapisu", color: "red" }
  if (ledger.operation === "skipped") return { label: "Duplikat", color: "gray" }
  if (ledger.operation === "created") return { label: "Wizyta utworzona", color: "green" }
  if (ledger.operation === "updated") return { label: "Wizyta zaktualizowana", color: "green" }
  return { label: "OK", color: "green" }
}

function getEventLabel(eventType: string | undefined): string {
  if (!eventType) return ""
  if (eventType === "created") return "Nowa rezerwacja"
  if (eventType === "cancelled") return "Anulowanie"
  if (eventType === "rescheduled") return "Zmiana terminu"
  return "Nieznany typ"
}

function getSourceLabel(source: string): string {
  if (source === "watch") return "Gmail push"
  if (source === "polling_fallback") return "Polling"
  if (source === "reconciliation") return "Reconcile"
  if (source === "manual_backfill") return "Ręczne"
  return source
}

function getColorClasses(color: "green" | "yellow" | "red" | "gray"): { dot: string; badge: string } {
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

function decodeQP(text: string, charset: string): string {
  const normalized = text.replace(/_/g, ' ')
  const bytes: number[] = []
  let i = 0
  while (i < normalized.length) {
    if (normalized[i] === '=' && i + 2 < normalized.length) {
      bytes.push(parseInt(normalized.slice(i + 1, i + 3), 16))
      i += 3
    } else {
      bytes.push(normalized.charCodeAt(i))
      i++
    }
  }
  try {
    return new TextDecoder(charset).decode(new Uint8Array(bytes))
  } catch {
    return text
  }
}

function decodeEmailSubject(subject: string | null): string {
  if (!subject || subject.trim().length === 0) return 'Bez tematu'

  const decoded = subject.replace(
    /=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g,
    (_match, charset: string, encoding: string, text: string) => {
      try {
        if (encoding.toUpperCase() === 'B') {
          const bytes = Buffer.from(text, 'base64')
          return new TextDecoder(charset).decode(new Uint8Array(bytes))
        }
        return decodeQP(text, charset)
      } catch {
        return _match
      }
    }
  )

  const clean = decoded.replace(/\s+/g, ' ').trim()
  return clean.length > 60 ? clean.slice(0, 60) + '…' : clean
}

function getRelativeTime(dateValue: string | null, fallbackDate: string): string {
  const candidate = new Date(dateValue ?? fallbackDate)
  if (Number.isNaN(candidate.getTime())) {
    return "przed chwilą"
  }

  return formatDistanceToNow(candidate, { addSuffix: true, locale: pl })
}

export async function MailboxEmailActivity({ salonId }: MailboxEmailActivityProps): Promise<JSX.Element> {
  const adminSupabase = createAdminSupabaseClient()
  const { data } = await (adminSupabase.from("booksy_raw_emails") as any)
    .select(`
      id, subject, from_address, internal_date, parse_status, ingest_source, created_at,
      booksy_parsed_events (
        event_type, status, confidence_score, payload,
        booksy_apply_ledger ( operation, error_message )
      )
    `)
    .eq("salon_id", salonId)
    .order("created_at", { ascending: false })
    .limit(20)

  const emails = ((data ?? []) as RawEmail[]).filter(isBooksyBookingRow)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Mail className="h-4 w-4" />
          Aktywność emaili
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {emails.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-500">Brak przetworzonych emaili</div>
        ) : (
          <ul className="divide-y">
            {emails.map((email) => {
              const status = getEmailStatus(email)
              const classes = getColorClasses(status.color)
              const firstEvent = email.booksy_parsed_events?.[0]
              const eventLabel = getEventLabel(firstEvent?.event_type)
              const parsedData = firstEvent?.payload?.parsed
              const ledger = firstEvent?.booksy_apply_ledger?.[0]
              const relativeTime = getRelativeTime(email.internal_date, email.created_at)
              const sourceLabel = getSourceLabel(email.ingest_source)
              const decodedSubject = decodeEmailSubject(email.subject)

              const clientInfo = parsedData?.clientName
                ? `${parsedData.clientName}${parsedData.bookingDate ? `, ${parsedData.bookingDate}${parsedData.bookingTime ? ' ' + parsedData.bookingTime : ''}` : ''}`
                : null

              return (
                <li className="flex items-start justify-between gap-3 py-3" key={email.id}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                      <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${classes.dot}`} />
                      <div className="min-w-0 w-full">
                        <p className="truncate text-sm font-medium text-foreground">{decodedSubject}</p>
                        {eventLabel ? (
                          <p className="mt-0.5 text-xs text-blue-600 font-medium">{eventLabel}</p>
                        ) : null}
                        {clientInfo ? (
                          <p className="mt-0.5 text-xs text-foreground/70">{clientInfo}</p>
                        ) : null}
                        {ledger?.error_message ? (
                          <p className="mt-0.5 text-xs text-red-600 truncate" title={ledger.error_message}>
                            ↳ {ledger.error_message}
                          </p>
                        ) : null}
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {relativeTime} · {sourceLabel}
                        </p>
                      </div>
                    </div>
                  </div>
                  <span
                    className={`inline-flex shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${classes.badge}`}
                  >
                    {status.label}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
