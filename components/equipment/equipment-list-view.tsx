'use client'

import type * as React from 'react'
import { useMemo, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Pencil,
  Power,
  PowerOff,
} from 'lucide-react'
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

type EquipmentItem = {
  id: string
  name: string
  type: string
  description?: string | null
  is_active: boolean
  created_at: string
  assigned_services_count?: number
  service_equipment?: { equipment_id: string }[]
}

interface EquipmentListViewProps {
  equipment: EquipmentItem[]
  onEdit: (item: EquipmentItem) => void
  onToggleStatus: (id: string, is_active: boolean) => void
  onOpenServices: (item: EquipmentItem) => void
}

type SortField = 'name' | 'type' | 'is_active'
type SortDirection = 'asc' | 'desc'

const TYPE_LABELS: Record<string, string> = {
  laser: 'Laser',
  fotel: 'Fotel',
  stol_manicure: 'Stol manicure',
  fotopolimeryzator: 'Fotopolimeryzator',
  inne: 'Inne',
  other: 'Inne',
}

function SortIcon({
  active,
  direction,
}: {
  active: boolean
  direction: SortDirection
}): React.ReactElement {
  if (!active) {
    return <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
  }

  if (direction === 'asc') {
    return <ArrowUp className="h-4 w-4" />
  }

  return <ArrowDown className="h-4 w-4" />
}

function getTypeLabel(type: string): string {
  return TYPE_LABELS[type] ?? TYPE_LABELS.other
}

function getSortValue(item: EquipmentItem, field: SortField): string | number {
  if (field === 'is_active') {
    return item.is_active ? 1 : 0
  }

  return item[field].toLocaleLowerCase('pl-PL')
}

function getAssignedServicesCount(item: EquipmentItem): number {
  if (typeof item.assigned_services_count === 'number') {
    return item.assigned_services_count
  }

  return item.service_equipment?.length ?? 0
}

export default function EquipmentListView({
  equipment,
  onEdit,
  onToggleStatus,
  onOpenServices,
}: EquipmentListViewProps): React.ReactElement {
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDir, setSortDir] = useState<SortDirection>('asc')

  const sortedEquipment = useMemo(() => {
    const items = [...equipment]

    items.sort((left, right) => {
      const leftValue = getSortValue(left, sortField)
      const rightValue = getSortValue(right, sortField)

      if (leftValue < rightValue) {
        return sortDir === 'asc' ? -1 : 1
      }

      if (leftValue > rightValue) {
        return sortDir === 'asc' ? 1 : -1
      }

      return left.name.localeCompare(right.name, 'pl-PL')
    })

    return items
  }, [equipment, sortDir, sortField])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortField(field)
    setSortDir('asc')
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[240px]">
              <Button
                type="button"
                variant="ghost"
                className="h-auto p-0 font-semibold text-foreground hover:bg-transparent"
                onClick={() => handleSort('name')}
              >
                <span>Nazwa</span>
                <SortIcon active={sortField === 'name'} direction={sortDir} />
              </Button>
            </TableHead>
            <TableHead className="min-w-[200px]">
              <Button
                type="button"
                variant="ghost"
                className="h-auto p-0 font-semibold text-foreground hover:bg-transparent"
                onClick={() => handleSort('type')}
              >
                <span>Typ</span>
                <SortIcon active={sortField === 'type'} direction={sortDir} />
              </Button>
            </TableHead>
            <TableHead className="min-w-[140px]">Uslugi</TableHead>
            <TableHead className="min-w-[140px]">
              <Button
                type="button"
                variant="ghost"
                className="h-auto p-0 font-semibold text-foreground hover:bg-transparent"
                onClick={() => handleSort('is_active')}
              >
                <span>Status</span>
                <SortIcon active={sortField === 'is_active'} direction={sortDir} />
              </Button>
            </TableHead>
            <TableHead className="w-[120px] text-right">Akcje</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedEquipment.map((item) => {
            const servicesCount = getAssignedServicesCount(item)

            return (
              <TableRow
                key={item.id}
                className="cursor-pointer transition-colors hover:bg-muted/40"
                onClick={() => onOpenServices(item)}
              >
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell>{getTypeLabel(item.type)}</TableCell>
                <TableCell>
                  <Badge variant={servicesCount === 0 ? 'secondary' : 'default'}>
                    {servicesCount} uslug
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={item.is_active ? 'default' : 'secondary'}>
                    {item.is_active ? 'Aktywny' : 'Nieaktywny'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={`Edytuj ${item.name}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        onEdit(item)
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={item.is_active ? `Dezaktywuj ${item.name}` : `Aktywuj ${item.name}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        onToggleStatus(item.id, item.is_active)
                      }}
                    >
                      {item.is_active ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                    </Button>
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
