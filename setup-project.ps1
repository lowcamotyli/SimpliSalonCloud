# SimpliSalon Project Setup Script
# Run: .\setup-project.ps1

Write-Host "🚀 SimpliSalon - Creating project files..." -ForegroundColor Cyan
Write-Host ""

function Create-File {
    param([string]$Path, [string]$Content)
    $dir = Split-Path -Parent $Path
    if ($dir -and !(Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
    [System.IO.File]::WriteAllText($Path, $Content, [System.Text.Encoding]::UTF8)
    Write-Host "✓ $Path" -ForegroundColor Green
}

# ============================================
# LIB FILES
# ============================================

Create-File "lib/supabase/client.ts" @'
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
'@

Create-File "lib/supabase/server.ts" @'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createServerSupabaseClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options })
          } catch (error) {
            // Handle error
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options })
          } catch (error) {
            // Handle error
          }
        },
      },
    }
  )
}
'@

Create-File "lib/supabase/admin.ts" @'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  )
}
'@

Create-File "lib/utils/cn.ts" @'
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
'@

Create-File "lib/utils/date.ts" @'
import { format, startOfWeek, addDays, parse } from 'date-fns'
import { pl } from 'date-fns/locale'

export function formatDate(date: Date | string, formatStr = 'yyyy-MM-dd'): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date
  return format(dateObj, formatStr, { locale: pl })
}

export function formatTime(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date
  return format(dateObj, 'HH:mm')
}

export function parseDate(dateStr: string): Date {
  return parse(dateStr, 'yyyy-MM-dd', new Date())
}

export function getCurrentWeek(): { start: Date; end: Date } {
  const today = new Date()
  const start = startOfWeek(today, { weekStartsOn: 1 })
  const end = addDays(start, 6)
  return { start, end }
}

export function getCurrentMonth(): { start: Date; end: Date } {
  const today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth(), 1)
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0)
  return { start, end }
}

export function generateWeekDays(startDate: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(startDate, i))
}

export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

export function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}
'@

Create-File "lib/utils/validation.ts" @'
import { z } from 'zod'

export const phoneSchema = z.string().regex(/^\d{9}$/, 'Telefon musi mieć 9 cyfr')

export const emailSchema = z.string().email('Nieprawidłowy email').optional().or(z.literal(''))

export const employeeCodeSchema = z.string().regex(/^EMP\d{3}$/, 'Format: EMP001')

export const clientCodeSchema = z.string().regex(/^CLI\d{4}$/, 'Format: CLI0001')

export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format: YYYY-MM-DD')

export const timeSchema = z.string().regex(/^\d{2}:\d{2}$/, 'Format: HH:mm')

export const priceSchema = z.number().min(0).max(10000)

export const durationSchema = z.number().int().min(15).max(480)
'@

Create-File "lib/constants.ts" @'
export const BOOKING_STATUSES = {
  SCHEDULED: 'scheduled',
  CONFIRMED: 'confirmed',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const

export const BOOKING_STATUS_LABELS: Record<string, string> = {
  scheduled: 'Umówiona',
  confirmed: 'Potwierdzona',
  completed: 'Opłacona',
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

export const USER_ROLE_LABELS: Record<string, string> = {
  owner: 'Właściciel',
  receptionist: 'Recepcjonista',
  stylist: 'Stylista',
  viewer: 'Podgląd',
}

export const BUSINESS_HOURS = {
  START: 8,
  END: 20,
} as const

export const DEFAULT_BOOKING_DURATION = 60

export const PAYROLL_STATUSES = {
  DRAFT: 'draft',
  FINALIZED: 'finalized',
  SENT: 'sent',
} as const
'@

Create-File "lib/providers/query-provider.tsx" @'
'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}
'@

# ============================================
# BOOKSY FILES
# ============================================

Create-File "lib/booksy/email-parser.ts" @'
interface BooksyEmailData {
  type: 'new' | 'change' | 'cancel'
  clientName: string
  clientPhone: string
  serviceName: string
  price: number
  date: string
  time: string
  timeEnd?: string
  duration?: number
  employeeName: string
  oldDate?: string
  oldTime?: string
  notes?: string
}

const MONTH_PL_TO_MM: Record<string, string> = {
  'stycznia': '01', 'lutego': '02', 'marca': '03', 'kwietnia': '04',
  'maja': '05', 'czerwca': '06', 'lipca': '07', 'sierpnia': '08',
  'września': '09', 'wrzesnia': '09', 'października': '10', 'pazdziernika': '10',
  'listopada': '11', 'grudnia': '12'
}

export function parseBooksyEmail(subject: string, body: string): BooksyEmailData | null {
  try {
    const lcSubj = subject.toLowerCase()
    const lcBody = body.toLowerCase()

    let type: 'new' | 'change' | 'cancel' = 'new'
    
    if (/(odwołał|odwołała)\s+wizytę/i.test(lcSubj) || /(odwołał|odwołała)\s+wizytę/i.test(lcBody)) {
      type = 'cancel'
    } else if (/(zmienił|zmieniła|przesunął|przesunęła)\s+(rezerwację|wizytę)/i.test(lcSubj) ||
               /(zmienił|zmieniła|przesunął|przesunęła)\s+(rezerwację|wizytę)/i.test(lcBody)) {
      type = 'change'
    }

    let clientName = ''
    const clientMatch = subject.match(/^(?:re:\s*|fw:\s*)*([^:]+?):\s*(?:nowa|zmienił|zmieniła|odwołał|odwołała)/i)
    if (clientMatch) {
      clientName = clientMatch[1].trim()
    }

    let clientPhone = ''
    const phoneMatch = body.match(/(?:\+?48\s*)?(\d{3}\s*\d{3}\s*\d{3})/i)
    if (phoneMatch) {
      clientPhone = phoneMatch[1].replace(/\s/g, '')
    }

    const dateTimeMatch = body.match(
      /(\d{1,2})\s+(stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|września|wrzesnia|października|pazdziernika|listopada|grudnia)\s+(\d{4}).*?(\d{1,2}:\d{2})\s*[—–-]\s*(\d{1,2}:\d{2})/i
    )

    let date = ''
    let time = ''
    let timeEnd = ''
    let duration = 0

    if (dateTimeMatch) {
      const day = dateTimeMatch[1].padStart(2, '0')
      const month = MONTH_PL_TO_MM[dateTimeMatch[2].toLowerCase()] || '01'
      const year = dateTimeMatch[3]
      time = dateTimeMatch[4]
      timeEnd = dateTimeMatch[5]

      date = `${year}-${month}-${day}`

      const [startH, startM] = time.split(':').map(Number)
      const [endH, endM] = timeEnd.split(':').map(Number)
      duration = (endH * 60 + endM) - (startH * 60 + startM)
    }

    let oldDate = ''
    let oldTime = ''

    if (type === 'change') {
      const oldMatch = body.match(
        /z dnia.*?(\d{1,2})\s+(stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|września|wrzesnia|października|pazdziernika|listopada|grudnia)\s+(\d{4})\s+(\d{1,2}:\d{2})/i
      )

      if (oldMatch) {
        const day = oldMatch[1].padStart(2, '0')
        const month = MONTH_PL_TO_MM[oldMatch[2].toLowerCase()] || '01'
        const year = oldMatch[3]
        oldTime = oldMatch[4]
        oldDate = `${year}-${month}-${day}`
      }
    }

    let serviceName = ''
    let price = 0

    const lines = body.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
    let priceLineIdx = -1

    for (let i = 0; i < lines.length; i++) {
      if (/\d{1,4}(?:[.,]\d{2})\s*zł/i.test(lines[i])) {
        priceLineIdx = i
        break
      }
    }

    if (priceLineIdx !== -1) {
      const priceLine = lines[priceLineIdx]
      const priceMatch = priceLine.match(/(\d{1,4}(?:[.,]\d{2}))\s*zł/i)
      if (priceMatch) {
        price = parseFloat(priceMatch[1].replace(',', '.'))
      }

      for (let i = priceLineIdx - 1; i >= Math.max(0, priceLineIdx - 5); i--) {
        const line = lines[i]
        
        if (/\d{3}\s*\d{3}\s*\d{3}|@|zł|\d{1,2}:\d{2}/i.test(line)) continue
        if (/^(pracownik|from|to|subject|temat)/i.test(line)) continue
        
        const serviceMatch = line.match(/^([A-Za-zÀ-žĄĆĘŁŃÓŚŹŻąćęłńóśźż\s]{3,80})(?:\s*:\s*(.+))?$/i)
        if (serviceMatch) {
          serviceName = serviceMatch[1].trim()
          break
        }
      }
    }

    let employeeName = ''
    const employeeLineIdx = lines.findIndex(l => /^pracownik\s*:/i.test(l))
    
    if (employeeLineIdx !== -1) {
      const empMatch = lines[employeeLineIdx].match(/^pracownik\s*:?\s*(.+)$/i)
      if (empMatch && empMatch[1].trim()) {
        employeeName = empMatch[1].trim().split(/\s+/)[0]
      } else if (employeeLineIdx + 1 < lines.length) {
        const nextLine = lines[employeeLineIdx + 1].trim()
        if (/^[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]{2,}$/i.test(nextLine)) {
          employeeName = nextLine
        }
      }
    }

    if (!clientName || !date || !time) {
      console.error('Missing required fields:', { clientName, date, time })
      return null
    }

    return {
      type,
      clientName,
      clientPhone,
      serviceName: serviceName || 'Usługa z Booksy',
      price,
      date,
      time,
      timeEnd,
      duration,
      employeeName,
      oldDate: type === 'change' ? oldDate : undefined,
      oldTime: type === 'change' ? oldTime : undefined,
    }
  } catch (error) {
    console.error('Error parsing Booksy email:', error)
    return null
  }
}
'@

Write-Host ""
Write-Host "✅ CZĘŚĆ 1/4 - Pliki LIB utworzone!" -ForegroundColor Cyan
Write-Host ""