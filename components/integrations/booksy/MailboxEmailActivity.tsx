import type { JSX } from "react"
import { formatDistanceToNow } from "date-fns"
import { pl } from "date-fns/locale"
import { MailboxEmailActivityClient, type MailboxEmailActivityItem } from "@/components/integrations/booksy/MailboxEmailActivityClient"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { createAdminSupabaseClient } from "@/lib/supabase/admin"
import { Mail } from "lucide-react"

type MailboxEmailActivityProps = {
  salonId: string
}

type ApplyLedger = {
  operation: "created" | "updated" | "skipped" | "failed"
  error_message: string | null
  applied_at?: string | null
  target_table?: string | null
  target_id?: string | null
}

type ParsedBookingPayload = {
  parsed?: {
    clientName?: string
    clientPhone?: string
    bookingDate?: string
    bookingTime?: string
    serviceName?: string
    oldDate?: string
    oldTime?: string
    price?: number
  }
  raw?: Record<string, unknown>
}

type ParsedEvent = {
  id: string
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
  gmail_message_id?: string | null
  gmail_thread_id?: string | null
  message_id_header?: string | null
  storage_path?: string | null
  raw_sha256?: string | null
  booksy_parsed_events: ParsedEvent[] | null
}

const BOOKSY_BOOKING_SUBJECT_PATTERNS: RegExp[] = [
  /nowa rezerwacja/i,
  /odwołał[aeę]?\s+wizytę/i,
  /zmienił\s+rezerwację/i,
  /zmiany w rezerwacji/i,
]

function decodeQP(text: string, charset: string): string {
  const normalized = text.replace(/_/g, " ")
  const bytes: number[] = []
  let i = 0

  while (i < normalized.length) {
    if (normalized[i] === "=" && i + 2 < normalized.length) {
      bytes.push(parseInt(normalized.slice(i + 1, i + 3), 16))
      i += 3
    } else {
      bytes.push(normalized.charCodeAt(i))
      i += 1
    }
  }

  try {
    return new TextDecoder(charset).decode(new Uint8Array(bytes))
  } catch {
    return text
  }
}

function decodeEmailSubject(subject: string | null, truncate = true): string {
  if (!subject || subject.trim().length === 0) return "Bez tematu"

  const decoded = subject.replace(
    /=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g,
    (_match, charset: string, encoding: string, text: string) => {
      try {
        if (encoding.toUpperCase() === "B") {
          const bytes = Buffer.from(text, "base64")
          return new TextDecoder(charset).decode(new Uint8Array(bytes))
        }

        return decodeQP(text, charset)
      } catch {
        return _match
      }
    }
  )

  const clean = decoded.replace(/\s+/g, " ").trim()
  return truncate && clean.length > 80 ? `${clean.slice(0, 80)}...` : clean
}

function isBooksyBookingRow(email: RawEmail): boolean {
  const decoded = decodeEmailSubject(email.subject, false)
  return BOOKSY_BOOKING_SUBJECT_PATTERNS.some((pattern) => pattern.test(decoded))
}

function getEmailStatus(email: RawEmail): MailboxEmailActivityItem["status"] {
  if (email.parse_status === "failed") return { label: "Błąd parsowania", color: "red", group: "error" }

  const event = email.booksy_parsed_events?.[0]
  if (!event) {
    if (email.parse_status === "parsed") return { label: "Przetworzone", color: "gray", group: "done" }
    return { label: "Oczekuje", color: "yellow", group: "pending" }
  }

  const ledger = event.booksy_apply_ledger?.[0]
  if (!ledger) {
    if (event.status === "manual_review") return { label: "Do weryfikacji", color: "yellow", group: "pending" }
    if (event.status === "discarded") return { label: "Pominięto", color: "gray", group: "done" }
    return { label: "W kolejce", color: "yellow", group: "pending" }
  }

  if (ledger.operation === "failed") return { label: "Błąd zapisu", color: "red", group: "error" }
  if (ledger.operation === "skipped") return { label: "Duplikat", color: "gray", group: "done" }
  if (ledger.operation === "created") return { label: "Wizyta utworzona", color: "green", group: "done" }
  if (ledger.operation === "updated") return { label: "Wizyta zaktualizowana", color: "green", group: "done" }

  return { label: "OK", color: "green", group: "done" }
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

function extractClientNameFromSubject(decodedSubject: string): string | null {
  const stripped = decodedSubject.replace(/^(Fw|Fwd|Re|Odp|PD):\s*/i, "").trim()
  const colonIdx = stripped.indexOf(": ")

  if (colonIdx <= 0) return null

  const candidate = stripped.slice(0, colonIdx).trim()
  if (candidate.length >= 2 && candidate.length <= 50 && !/\d/.test(candidate)) {
    return candidate
  }

  return null
}

function detectEventTypeFromSubject(decodedSubject: string): "created" | "cancelled" | "rescheduled" | null {
  if (/nowa rezerwacja/i.test(decodedSubject)) return "created"
  if (/odwołał[aeę]?\s+wizytę/i.test(decodedSubject)) return "cancelled"
  if (/zmienił\s+rezerwację|zmiany w rezerwacji/i.test(decodedSubject)) return "rescheduled"
  return null
}

function getRelativeTime(dateValue: string | null, fallbackDate: string): string {
  const candidate = new Date(dateValue ?? fallbackDate)

  if (Number.isNaN(candidate.getTime())) {
    return "przed chwilą"
  }

  return formatDistanceToNow(candidate, { addSuffix: true, locale: pl })
}

function getBookingInfo(parsedData: ParsedBookingPayload["parsed"] | undefined): string | null {
  if (!parsedData) return null

  const parts: string[] = []
  if (parsedData.oldDate && parsedData.oldDate !== "unknown") {
    parts.push(`Z: ${parsedData.oldDate}${parsedData.oldTime ? ` ${parsedData.oldTime}` : ""}`)
  }

  if (parsedData.bookingDate && parsedData.bookingDate !== "unknown") {
    const prefix = parsedData.oldDate ? "Na: " : ""
    parts.push(`${prefix}${parsedData.bookingDate}${parsedData.bookingTime ? ` ${parsedData.bookingTime}` : ""}`)
  }

  if (parsedData.serviceName) parts.push(parsedData.serviceName)
  return parts.length > 0 ? parts.join(" · ") : null
}

function toActivityItem(email: RawEmail): MailboxEmailActivityItem {
  const firstEvent = email.booksy_parsed_events?.[0]
  const parsedData = firstEvent?.payload?.parsed
  const ledger = firstEvent?.booksy_apply_ledger?.[0]
  const decodedSubject = decodeEmailSubject(email.subject)
  const fullSubject = decodeEmailSubject(email.subject, false)
  const fallbackClientName = !parsedData ? extractClientNameFromSubject(fullSubject) : null
  const fallbackEventType = !firstEvent ? detectEventTypeFromSubject(fullSubject) : null
  const eventType = firstEvent?.event_type ?? fallbackEventType ?? "unknown"

  return {
    id: email.id,
    subject: decodedSubject,
    fullSubject,
    fromAddress: email.from_address ?? null,
    internalDate: email.internal_date,
    createdAt: email.created_at,
    parseStatus: email.parse_status,
    ingestSource: email.ingest_source,
    sourceLabel: getSourceLabel(email.ingest_source),
    relativeTime: getRelativeTime(email.internal_date, email.created_at),
    status: getEmailStatus(email),
    eventType,
    eventLabel: getEventLabel(eventType),
    eventStatus: firstEvent?.status ?? null,
    confidenceScore: firstEvent?.confidence_score ?? null,
    clientInfo: parsedData?.clientName ?? fallbackClientName,
    bookingInfo: getBookingInfo(parsedData),
    bookingDate: parsedData?.bookingDate ?? null,
    bookingTime: parsedData?.bookingTime ?? null,
    serviceName: parsedData?.serviceName ?? null,
    errorMessage: ledger?.error_message ?? null,
    storagePath: email.storage_path ?? null,
    gmailMessageId: email.gmail_message_id ?? null,
    gmailThreadId: email.gmail_thread_id ?? null,
    messageIdHeader: email.message_id_header ?? null,
    rawSha256: email.raw_sha256 ?? null,
    parsedPayload: firstEvent?.payload ?? null,
    applyLedger: ledger ?? null,
  }
}

export async function MailboxEmailActivity({ salonId }: MailboxEmailActivityProps): Promise<JSX.Element> {
  const adminSupabase = createAdminSupabaseClient()
  const { data } = await (adminSupabase.from("booksy_raw_emails") as any)
    .select(`
      id, subject, from_address, internal_date, parse_status, ingest_source, created_at,
      gmail_message_id, gmail_thread_id, message_id_header, storage_path, raw_sha256,
      booksy_parsed_events (
        id, event_type, status, confidence_score, payload,
        booksy_apply_ledger ( operation, error_message, applied_at, target_table, target_id )
      )
    `)
    .eq("salon_id", salonId)
    .order("created_at", { ascending: false })
    .limit(50)

  const emails = ((data ?? []) as RawEmail[]).filter(isBooksyBookingRow).map(toActivityItem)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Mail className="h-4 w-4" />
          Aktywność emaili
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <MailboxEmailActivityClient emails={emails} />
      </CardContent>
    </Card>
  )
}
