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

// Service category colors for visual distinction
export const SERVICE_CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'Strzyżenie': {
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
  },
  'Koloryzacja': {
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    border: 'border-purple-200',
  },
  'Zabiegi': {
    bg: 'bg-pink-50',
    text: 'text-pink-700',
    border: 'border-pink-200',
  },
  'Stylizacja': {
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    border: 'border-rose-200',
  },
  'Pielęgnacja': {
    bg: 'bg-green-50',
    text: 'text-green-700',
    border: 'border-green-200',
  },
  'Makijaż': {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
  },
  'Paznokcie': {
    bg: 'bg-indigo-50',
    text: 'text-indigo-700',
    border: 'border-indigo-200',
  },
  'Inne': {
    bg: 'bg-gray-50',
    text: 'text-gray-700',
    border: 'border-gray-200',
  },
}

export const getServiceCategoryColor = (category?: string) => {
  if (!category) return SERVICE_CATEGORY_COLORS['Inne']
  return SERVICE_CATEGORY_COLORS[category] || SERVICE_CATEGORY_COLORS['Inne']
}
