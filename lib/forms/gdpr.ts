type SalonAddress = {
  street?: string | null
  city?: string | null
  postalCode?: string | null
  country?: string | null
} | null

type ResolveGdprContext = {
  salonName?: string | null
  salonEmail?: string | null
  address?: SalonAddress
}

export const DYNAMIC_GDPR_TEMPLATE = `Administratorem Twoich danych osobowych jest [NAZWA SALONU] z siedziba pod adresem [ADRES] ("Administrator").

W sprawach zwiazanych z przetwarzaniem danych osobowych mozesz skontaktowac sie z Administratorem pod adresem e-mail: [EMAIL SALONU].

Twoje dane osobowe przetwarzane sa w celu realizacji uslug i wykonania zawartej umowy (art. 6 ust. 1 lit. b RODO). W zakresie, w jakim dane dotycza zdrowia, podstawa przetwarzania jest Twoja wyrazna zgoda (art. 9 ust. 2 lit. a RODO).

Dane beda przechowywane przez okres niezbedny do realizacji uslugi, a po jej wykonaniu przez okres wynikajacy z przepisow prawa oraz do czasu przedawnienia ewentualnych roszczen.

Przysluguje Ci prawo dostepu do danych, ich sprostowania, usuniecia, ograniczenia przetwarzania, przenoszenia danych, wycofania zgody oraz wniesienia sprzeciwu - w przypadkach przewidzianych prawem. Masz takze prawo wniesienia skargi do Prezesa Urzedu Ochrony Danych Osobowych.`

const LEGACY_GDPR_MARKERS = [
  /BRAVE EDUCATION/i,
  /redsxiii@gmail\.com/i,
]

function normalizeWhitespace(value: string): string {
  return value.replace(/\r\n/g, '\n').trim()
}

function replaceToken(value: string, token: string, replacement: string): string {
  return value.replace(new RegExp(`\\[${token}\\]`, 'gi'), replacement)
}

export function buildSalonAddress(address?: SalonAddress): string | undefined {
  if (!address) {
    return undefined
  }

  const parts = [address.street, address.postalCode, address.city, address.country]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))

  if (parts.length === 0) {
    return undefined
  }

  return parts.join(', ')
}

export function containsLegacyGdprData(value?: string | null): boolean {
  if (!value) {
    return false
  }

  return LEGACY_GDPR_MARKERS.some((marker) => marker.test(value))
}

export function resolveGdprConsentText(
  value: string | null | undefined,
  context: ResolveGdprContext
): string | undefined {
  const salonName = context.salonName?.trim() || 'Twoj salon'
  const salonEmail = context.salonEmail?.trim() || 'kontakt@twoj-salon.pl'
  const salonAddress = buildSalonAddress(context.address)
  const rawValue = value?.trim()
  const baseText =
    !rawValue || containsLegacyGdprData(rawValue)
      ? DYNAMIC_GDPR_TEMPLATE
      : rawValue

  let resolved = normalizeWhitespace(baseText)
  resolved = replaceToken(resolved, 'NAZWA SALONU', salonName)
  resolved = replaceToken(resolved, 'EMAIL SALONU', salonEmail)
  resolved = replaceToken(resolved, 'EMAIL', salonEmail)

  resolved = replaceToken(resolved, 'ADRES', salonAddress || 'adres salonu nie zostal uzupelniony')

  return resolved
}
