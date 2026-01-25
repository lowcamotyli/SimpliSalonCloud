/**
 * Format Polish phone number
 * Input: "123456789" or "+48123456789"
 * Output: "+48 123 456 789"
 */
export function formatPhoneNumber(phone: string): string {
  if (!phone) return ''
  
  // Remove all non-digit characters except +
  const cleaned = phone.replace(/[^\d+]/g, '')
  
  // If doesn't start with +, add +48
  let normalized = cleaned
  if (!normalized.startsWith('+')) {
    normalized = normalized.replace(/^48/, '').replace(/^0/, '')
    normalized = '+48' + normalized
  }
  
  // Format: +48 XXX XXX XXX
  const match = normalized.match(/^(\+\d{2})(\d{3})(\d{3})(\d{3})/)
  if (match) {
    return `${match[1]} ${match[2]} ${match[3]} ${match[4]}`
  }
  
  return normalized
}

/**
 * Parse phone number to store in database
 * Input: "+48 123 456 789" or "123456789"
 * Output: "+48123456789"
 */
export function parsePhoneNumber(phone: string): string {
  if (!phone) return ''
  
  const cleaned = phone.replace(/[^\d+]/g, '')
  
  if (cleaned.startsWith('+')) {
    return cleaned
  }
  
  const withoutLeadingZero = cleaned.replace(/^0/, '')
  return '+48' + withoutLeadingZero
}

/**
 * Format price with currency
 * Input: 99.5
 * Output: "99,50 zł"
 */
export function formatPrice(price: number): string {
  return new Intl.NumberFormat('pl-PL', {
    style: 'currency',
    currency: 'PLN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price)
}

/**
 * Format date to Polish format
 * Input: "2024-01-15"
 * Output: "15 stycznia 2024"
 */
export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  
  return new Intl.DateTimeFormat('pl-PL', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(d)
}

/**
 * Format time to HH:MM format
 * Input: "14:30:00"
 * Output: "14:30"
 */
export function formatTime(time: string): string {
  if (!time) return ''
  return time.slice(0, 5)
}

/**
 * Format date and time together
 * Input: "2024-01-15", "14:30:00"
 * Output: "15 stycznia 2024, 14:30"
 */
export function formatDateTime(date: string | Date, time?: string): string {
  const dateStr = formatDate(date)
  if (time) {
    return `${dateStr}, ${formatTime(time)}`
  }
  return dateStr
}

/**
 * Get relative time (e.g., "za 2 dni", "wczoraj")
 */
export function getRelativeTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dateOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  
  const diffTime = dateOnly.getTime() - today.getTime()
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  
  if (diffDays === 0) return 'dzisiaj'
  if (diffDays === 1) return 'jutro'
  if (diffDays === -1) return 'wczoraj'
  if (diffDays > 0) return `za ${diffDays} dni`
  return `${Math.abs(diffDays)} dni temu`
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength - 3) + '...'
}
