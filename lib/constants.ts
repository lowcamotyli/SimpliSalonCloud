export const BOOKING_STATUSES = {
  SCHEDULED: 'scheduled',
  CONFIRMED: 'confirmed',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const

export const BOOKING_STATUS_LABELS: Record<string, string> = {
  scheduled: 'Zaplanowana',
  confirmed: 'Potwierdzona',
  completed: 'Zakończona',
  cancelled: 'Anulowana',
}

export const PAYMENT_METHODS = {
  CASH: 'cash',
  CARD: 'card',
  TRANSFER: 'transfer',
  BLIK: 'blik',
} as const

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Gotówka',
  card: 'Karta',
  transfer: 'Przelew',
  blik: 'BLIK',
}

export const USER_ROLES = {
  OWNER: 'owner',
  RECEPTIONIST: 'receptionist',
  STYLIST: 'stylist',
  VIEWER: 'viewer',
} as const

export const ROLE_LABELS: Record<string, string> = {
  owner: 'Właściciel',
  receptionist: 'Recepcja',
  stylist: 'Stylista',
  viewer: 'Podgląd',
}

export const BUSINESS_HOURS = {
  START: 8,
  END: 20,
} as const

export const DEFAULT_BOOKING_DURATION = 60 // minutes

export const PAYROLL_STATUSES = {
  DRAFT: 'draft',
  FINALIZED: 'finalized',
  SENT: 'sent',
} as const