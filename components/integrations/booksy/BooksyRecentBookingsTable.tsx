'use client'

import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ObjectCell, ObjectLink, ObjectPill } from '@/components/objects'

type BookingRow = {
  id: string
  booking_date: string
  booking_time: string
  status: string
  base_price: number | null
  client_id: string | null
  service_id: string | null
  employee_id: string | null
  clients: { full_name: string } | null
  services: { name: string } | null
  employees: { first_name: string; last_name: string | null } | null
}

type Props = {
  bookings: BookingRow[]
  slug: string
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

export function BooksyRecentBookingsTable({ bookings, slug }: Props): JSX.Element {
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
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          className="rounded-xl border-border"
          placeholder="Szukaj po kliencie, usludze lub pracowniku"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="rounded-xl border-border">
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
        <div className="overflow-x-auto rounded-2xl border border-border bg-background">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
                <th className="pb-2 text-left font-medium">Data wizyty</th>
                <th className="pb-2 text-left font-medium">Klient</th>
                <th className="pb-2 text-left font-medium">Usluga</th>
                <th className="pb-2 text-left font-medium">Pracownik</th>
                <th className="pb-2 text-left font-medium">Status</th>
                <th className="pb-2 text-right font-medium">Cena</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredBookings.map((booking) => (
                <tr key={booking.id}>
                  <td className="whitespace-nowrap py-3 pr-4 text-xs text-muted-foreground">
                    {new Date(`${booking.booking_date}T${booking.booking_time}`).toLocaleString('pl-PL', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="py-3 pr-4">
                    <ObjectCell
                      id={booking.client_id ?? ''}
                      label={booking.clients?.full_name ?? 'Klient'}
                      showActions={false}
                      slug={slug}
                      type="client"
                    />
                  </td>
                  <td className="py-3 pr-4">
                    {booking.service_id && booking.services?.name ? (
                      <ObjectPill
                        id={booking.service_id}
                        label={booking.services.name}
                        slug={slug}
                        type="service"
                      />
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    {booking.employee_id && booking.employees ? (
                      <ObjectLink
                        id={booking.employee_id}
                        label={toEmployeeName(booking)}
                        showDot
                        slug={slug}
                        type="worker"
                      />
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="py-3 pr-4">{statusBadge(booking.status)}</td>
                  <td className="whitespace-nowrap py-3 text-right">{booking.base_price ? `${booking.base_price.toFixed(2)} zl` : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
