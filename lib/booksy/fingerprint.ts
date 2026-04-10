import { createHash } from "node:crypto";

const POLISH_DIACRITICS_MAP: Record<string, string> = {
  ą: "a",
  ć: "c",
  ę: "e",
  ł: "l",
  ń: "n",
  ó: "o",
  ś: "s",
  ź: "z",
  ż: "z",
};

export function computeFingerprint(
  salonId: string,
  eventType: string,
  clientContact: string,
  serviceName: string,
  startAtUtc: string,
): string {
  const input = [
    salonId,
    eventType,
    normalizeContact(clientContact),
    normalizeServiceName(serviceName),
    truncateTo15min(startAtUtc),
  ].join("|");

  return createHash("sha256").update(input).digest("hex");
}

export function normalizeContact(contact: string): string {
  const normalized = contact.trim().toLowerCase();

  if (normalized.includes("@")) {
    return normalized;
  }

  return normalized.replace(/\D+/g, "");
}

export function normalizeServiceName(name: string): string {
  const normalized = name.trim().toLowerCase();

  const withoutDiacritics = normalized.replace(/[ąćęłńóśźż]/g, (char) => POLISH_DIACRITICS_MAP[char] ?? char);

  const withoutAbbreviations = withoutDiacritics.replace(/(^|\s)(?:ul\.|dl\.|kr\.)(?=\s|$)/gi, " ");

  return withoutAbbreviations.replace(/\s+/g, " ").trim();
}

export function truncateTo15min(isoDate: string): string {
  const date = new Date(isoDate);
  const minutes = date.getUTCMinutes();
  const truncatedMinutes = Math.floor(minutes / 15) * 15;

  date.setUTCMinutes(truncatedMinutes, 0, 0);

  return date.toISOString();
}
