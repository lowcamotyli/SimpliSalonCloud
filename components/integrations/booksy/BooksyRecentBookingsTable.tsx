'use client'

import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type BookingRow = {
  id: string
  booking_date: string
  booking_time: string
  status: string
  base_price: number | null
  clients: { full_name: string } | null
  services: { name: string } | null
  employees: { first_name: string; last_name: string | null } | null
}

type Props = {
  bookings: BookingRow[]
}

function statusBadge(status: string) {
  if (status === 'scheduled') {
    return <Badge className="text-xs">Zaplanowana</Badge>
  }

  if (status === 'cancelled') {
    return (
      <Badge variant="destructive" className="text-xs">
        Anulowana
      </Badge>
    )
  }

  if (status === 'completed') {
    return (
      <Badge variant="secondary" className="text-xs">
        Zakonczona
      </Badge>
    )
  }

  return (
    <Badge variant="outline" className="text-xs">
      {status}
    </Badge>
  )
}

function toEmployeeName(booking: BookingRow): string {
  if (!booking.employees) {
    return '-'
  }

  return `${booking.employees.first_name} ${booking.employees.last_name ?? ''}`.trim()
}

export function BooksyRecentBookingsTable({ bookings }: Props): JSX.Element {
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [query, setQuery] = useState<string>('')

  const normalizedQuery = query.trim().toLowerCase()

  const filteredBookings = useMemo(() => {
    return bookings.filter((booking) => {
      if (statusFilter !== 'all' && booking.status !== statusFilter) {
        return false
      }

      if (!normalizedQuery) {
        return true
      }

      const haystack = [
        booking.clients?.full_name ?? '',
        booking.services?.name ?? '',
        toEmployeeName(booking),
      ]
        .join(' ')
        .toLowerCase()

      return haystack.includes(normalizedQuery)
    })
  }, [bookings, normalizedQuery, statusFilter])

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          placeholder="Szukaj po kliencie, usludze lub pracowniku"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Filtr statusu" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Wszystkie statusy</SelectItem>
            <SelectItem value="scheduled">Zaplanowana</SelectItem>
            <SelectItem value="completed">Zakonczona</SelectItem>
            <SelectItem value="cancelled">Anulowana</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filteredBookings.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Brak rezerwacji pasujacych do filtrow.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="pb-2 text-left font-medium">Data wizyty</th>
                <th className="pb-2 text-left font-medium">Klient</th>
                <th className="pb-2 text-left font-medium">Usluga</th>
                <th className="pb-2 text-left font-medium">Pracownik</th>
                <th className="pb-2 text-left font-medium">Status</th>
                <th className="pb-2 text-right font-medium">Cena</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredBookings.map((booking) => (
                <tr key={booking.id}>
                  <td className="whitespace-nowrap py-2.5 pr-4 text-xs text-muted-foreground">
                    {new Date(`${booking.booking_date}T${booking.booking_time}`).toLocaleString('pl-PL', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="py-2.5 pr-4">{booking.clients?.full_name ?? '-'}</td>
                  <td className="py-2.5 pr-4">{booking.services?.name ?? '-'}</td>
                  <td className="py-2.5 pr-4">{toEmployeeName(booking)}</td>
                  <td className="py-2.5 pr-4">{statusBadge(booking.status)}</td>
                  <td className="whitespace-nowrap py-2.5 text-right">{booking.base_price ? `${booking.base_price.toFixed(2)} zl` : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
