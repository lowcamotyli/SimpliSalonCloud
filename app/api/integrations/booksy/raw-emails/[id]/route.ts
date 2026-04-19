import { NextRequest, NextResponse } from "next/server"
import { withErrorHandling } from "@/lib/error-handler"
import { ForbiddenError, NotFoundError } from "@/lib/errors"
import { createAdminSupabaseClient } from "@/lib/supabase/admin"
import { getAuthContext } from "@/lib/supabase/get-auth-context"

const RAW_EMAIL_BUCKET = "booksy-raw-emails"

type RouteContext = {
  params: Promise<{ id: string }>
}

async function requireOwnerRole(supabase: Awaited<ReturnType<typeof getAuthContext>>["supabase"]): Promise<void> {
  const { data, error } = await supabase.rpc("has_salon_role", {
    required_role: "owner",
  })

  if (error) throw error
  if (!data) throw new ForbiddenError("Only salon owner can view Booksy raw emails")
}

function splitMime(rawMime: string): { headers: Record<string, string>; body: string } {
  const normalized = rawMime.replace(/\r\n/g, "\n")
  const separator = normalized.indexOf("\n\n")

  if (separator === -1) {
    return { headers: {}, body: normalized }
  }

  const headerText = normalized.slice(0, separator)
  const body = normalized.slice(separator + 2)
  const headers: Record<string, string> = {}
  let currentHeader: string | null = null

  for (const line of headerText.split("\n")) {
    if (/^\s/.test(line) && currentHeader) {
      headers[currentHeader] = `${headers[currentHeader]} ${line.trim()}`
      continue
    }

    const colonIndex = line.indexOf(":")
    if (colonIndex === -1) continue

    currentHeader = line.slice(0, colonIndex).trim().toLowerCase()
    headers[currentHeader] = line.slice(colonIndex + 1).trim()
  }

  return { headers, body }
}

function getHeaderParameter(headerValue: string | undefined, key: string): string | null {
  if (!headerValue) return null

  const pattern = new RegExp(`${key}="?([^";]+)"?`, "i")
  return headerValue.match(pattern)?.[1] ?? null
}

function decodeQuotedPrintable(input: string): Buffer {
  const normalized = input.replace(/=\r?\n/g, "")
  const bytes: number[] = []

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index]
    if (char === "=" && /^[0-9A-Fa-f]{2}$/.test(normalized.slice(index + 1, index + 3))) {
      bytes.push(parseInt(normalized.slice(index + 1, index + 3), 16))
      index += 2
      continue
    }

    bytes.push(char.charCodeAt(0))
  }

  return Buffer.from(bytes)
}

function decodeBodyContent(body: string, encoding: string | undefined, charset: string | null): string {
  const normalizedEncoding = encoding?.toLowerCase() ?? "7bit"
  let buffer: Buffer

  if (normalizedEncoding.includes("base64")) {
    buffer = Buffer.from(body.replace(/\s+/g, ""), "base64")
  } else if (normalizedEncoding.includes("quoted-printable")) {
    buffer = decodeQuotedPrintable(body)
  } else {
    buffer = Buffer.from(body, "utf8")
  }

  try {
    return new TextDecoder(charset ?? "utf-8").decode(buffer)
  } catch {
    return buffer.toString("utf8")
  }
}

function extractMimeText(rawMime: string): { text: string | null; html: string | null } {
  const { headers, body } = splitMime(rawMime)
  const contentType = headers["content-type"]?.toLowerCase() ?? "text/plain"
  const boundary = getHeaderParameter(headers["content-type"], "boundary")

  if (contentType.startsWith("multipart/") && boundary) {
    const boundaryMarker = `--${boundary}`
    const parts = body
      .split(boundaryMarker)
      .map((part) => part.trim())
      .filter((part) => part && part !== "--")

    let text: string | null = null
    let html: string | null = null

    for (const part of parts) {
      const cleanedPart = part.endsWith("--") ? part.slice(0, -2).trim() : part
      const extracted = extractMimeText(cleanedPart)
      text = text ?? extracted.text
      html = html ?? extracted.html
      if (text) break
    }

    return { text, html }
  }

  const charset = getHeaderParameter(headers["content-type"], "charset")
  const decoded = decodeBodyContent(body, headers["content-transfer-encoding"], charset)

  if (contentType.includes("text/html")) {
    return { text: null, html: stripHtml(decoded) }
  }

  return { text: decoded, html: null }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
}

export const GET = withErrorHandling(async (_request: NextRequest, { params }: RouteContext) => {
  const { salonId, supabase } = await getAuthContext()
  await requireOwnerRole(supabase)

  const { id } = await params
  const admin = createAdminSupabaseClient()

  const { data: email, error } = await admin
    .from("booksy_raw_emails")
    .select("id, salon_id, storage_path")
    .eq("id", id)
    .eq("salon_id", salonId)
    .maybeSingle()

  if (error) throw error
  if (!email) throw new NotFoundError("Booksy raw email")

  if (!email.storage_path) {
    return NextResponse.json({
      rawText: null,
      htmlText: null,
      rawSizeBytes: null,
      storagePath: null,
    })
  }

  const { data, error: downloadError } = await admin.storage.from(RAW_EMAIL_BUCKET).download(email.storage_path)
  if (downloadError) throw downloadError

  const rawMime = await data.text()
  const extracted = extractMimeText(rawMime)

  return NextResponse.json({
    rawText: extracted.text,
    htmlText: extracted.html,
    rawSizeBytes: Buffer.byteLength(rawMime, "utf8"),
    storagePath: email.storage_path,
  })
})
