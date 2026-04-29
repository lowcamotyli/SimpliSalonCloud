'use client'

import type * as React from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Ban,
  Mail,
  Phone,
} from 'lucide-react'
import { ObjectCell } from '@/components/objects/ObjectCell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatPhoneNumber, getRelativeTime } from '@/lib/formatters'
import { cn } from '@/lib/utils/cn'

type Client = {
  id: string
  client_code: string
  full_name: string
  avatar_url?: string | null
  phone: string | null
  email: string | null
  notes: string | null
  visit_count: number
  last_visit_at: string | null
  blacklist_status: string
  tags?: string[] | null
}

interface ClientsListViewProps {
  clients: Client[]
  slug?: string
  sort: string
  order: string
  onSort: (col: string) => void
  onEditClient: (client: Client) => void
  deletingClientId: string | null
  onDeleteClient: (clientId: string, clientName: string) => void
  isBulkDeletingClients: boolean
  selectedClientIds: string[]
  onToggleClientSelection: (id: string) => void
}

type SortableColumn = 'full_name' | 'last_visit_at' | 'visit_count'

function SortIcon({
  active,
  direction,
}: {
  active: boolean
  direction: string
}): React.ReactElement {
  if (!active) {
    return <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
  }

  if (direction === 'asc') {
    return <ArrowUp className="h-4 w-4" />
  }

  return <ArrowDown className="h-4 w-4" />
}

function SortHeader({
  column,
  label,
  sort,
  order,
  onSort,
  className,
}: {
  column: SortableColumn
  label: string
  sort: string
  order: string
  onSort: (col: string) => void
  className?: string
}): React.ReactElement {
  const isActive = sort === column

  return (
    <Button
      type="button"
      variant="ghost"
      className={cn('h-auto p-0 font-semibold text-foreground hover:bg-transparent', className)}
      onClick={() => onSort(column)}
    >
      <span>{label}</span>
      <SortIcon active={isActive} direction={order} />
    </Button>
  )
}

function getBlacklistBadge(status: string): React.ReactNode {
  if (status === 'blacklisted') {
    return (
      <Badge variant="destructive" className="gap-1 whitespace-nowrap">
        <Ban className="h-3 w-3" />
        Czarna lista
      </Badge>
    )
  }

  if (status === 'warned') {
    return (
      <Badge className="gap-1 whitespace-nowrap bg-amber-100 text-amber-700 hover:bg-amber-100">
        <AlertTriangle className="h-3 w-3" />
        Ostrzezenie
      </Badge>
    )
  }

  return null
}

export function ClientsListView({
  clients,
  slug,
  sort,
  order,
  onSort,
  selectedClientIds,
  onToggleClientSelection,
}: ClientsListViewProps): React.ReactElement {
  const router = useRouter()
  const params = useParams()
  const routeSlug = params.slug as string
  const currentSlug = slug ?? routeSlug

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-white">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30 hover:bg-muted/30">
            <TableHead className="h-11 w-12 text-[12.5px] font-semibold">
              <span className="sr-only">Wybierz klienta</span>
            </TableHead>
            <TableHead className="h-11 min-w-[260px] text-[12.5px] font-semibold">
              <SortHeader
                column="full_name"
                label="Imie i nazwisko"
                sort={sort}
                order={order}
                onSort={onSort}
              />
            </TableHead>
            <TableHead className="h-11 min-w-[170px] text-[12.5px] font-semibold">Telefon</TableHead>
            <TableHead className="h-11 min-w-[220px] text-[12.5px] font-semibold">Email</TableHead>
            <TableHead className="h-11 min-w-[160px] text-[12.5px] font-semibold">
              <SortHeader
                column="last_visit_at"
                label="Ostatnia wizyta"
                sort={sort}
                order={order}
                onSort={onSort}
              />
            </TableHead>
            <TableHead className="h-11 min-w-[140px] text-[12.5px] font-semibold">
              <SortHeader
                column="visit_count"
                label="Liczba wizyt"
                sort={sort}
                order={order}
                onSort={onSort}
              />
            </TableHead>
            <TableHead className="h-11 min-w-[180px] text-[12.5px] font-semibold">Tagi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {clients.map((client) => {
            const isSelected = selectedClientIds.includes(client.id)
            const blacklistBadge = getBlacklistBadge(client.blacklist_status)
            const visibleTags = client.tags?.slice(0, 2) ?? []
            const hiddenTagsCount = client.tags ? Math.max(client.tags.length - visibleTags.length, 0) : 0

            return (
              <TableRow
                key={client.id}
                className={cn(
                  'cursor-pointer transition-colors hover:bg-secondary/10',
                  isSelected && 'bg-secondary/10'
                )}
                onClick={() => router.push(`/${currentSlug}/clients/${client.id}`)}
              >
                <TableCell onClick={(event) => event.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    aria-label={`Wybierz klienta ${client.full_name}`}
                    className="h-4 w-4 rounded border-input"
                    onChange={() => onToggleClientSelection(client.id)}
                  />
                </TableCell>
                <TableCell className="py-3">
                  <div className="space-y-2">
                    <ObjectCell
                      type="client"
                      id={client.id}
                      label={client.full_name}
                      slug={currentSlug}
                      meta={client.email ?? client.phone ?? undefined}
                      avatarUrl={client.avatar_url ?? undefined}
                      showActions={true}
                    />
                    {blacklistBadge ? (
                      <div className="flex flex-wrap items-center gap-2">{blacklistBadge}</div>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="py-3 text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 shrink-0" />
                    <span>{client.phone ? formatPhoneNumber(client.phone) : '—'}</span>
                  </div>
                </TableCell>
                <TableCell className="py-3 text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 shrink-0" />
                    <span className="truncate">{client.email || '—'}</span>
                  </div>
                </TableCell>
                <TableCell className="py-3">{client.last_visit_at ? getRelativeTime(client.last_visit_at) : 'Brak'}</TableCell>
                <TableCell className="py-3 font-medium">{client.visit_count}</TableCell>
                <TableCell className="py-3">
                  <div className="flex flex-wrap gap-2">
                    {visibleTags.length > 0 ? (
                      visibleTags.map((tag) => (
                        <Badge key={tag} variant="secondary">
                          {tag}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                    {hiddenTagsCount > 0 ? (
                      <Badge variant="outline">+{hiddenTagsCount}</Badge>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
