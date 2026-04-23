export const SERVICE_PRICE_TYPES = ['fixed', 'variable', 'from', 'hidden', 'free'] as const

export type ServicePriceType = (typeof SERVICE_PRICE_TYPES)[number]

const SERVICE_PRICE_TYPE_SET = new Set<string>(SERVICE_PRICE_TYPES)

export function normalizeServicePriceType(value: string | null | undefined): ServicePriceType {
  if (value && SERVICE_PRICE_TYPE_SET.has(value)) {
    return value as ServicePriceType
  }
  return 'fixed'
}

export function sanitizeServicePrice(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return 0
  }
  return value
}

export function resolvePublicServicePrice(
  value: number | null | undefined,
  priceType: string | null | undefined
): number | null {
  const normalizedPriceType = normalizeServicePriceType(priceType)
  if (normalizedPriceType === 'hidden') {
    return null
  }
  return sanitizeServicePrice(value)
}

export function resolveBookingBasePrice(
  value: number | null | undefined,
  priceType: string | null | undefined
): number {
  const normalizedPriceType = normalizeServicePriceType(priceType)
  const sanitizedPrice = sanitizeServicePrice(value)

  if (normalizedPriceType === 'hidden' || normalizedPriceType === 'free') {
    return 0
  }

  return sanitizedPrice
}
