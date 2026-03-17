'use client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { ArrowLeft, FileText } from 'lucide-react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useCurrentRole } from '@/hooks/use-current-role'

type TreatmentRecord = {
  id: string
  salon_id: string
  booking_id: string | null
  client_id: string
  employee_id: string
  service_id: string | null
  performed_at: string
  parameters: Record<string, unknown>
  notes_encrypted: string | null
  data_category: 'general' | 'health' | 'sensitive_health'
  created_at: string
  updated_at: string
  client: { id: string; full_name: string } | null
  employee: { id: string; first_name: string; last_name: string } | null
  service: { id: string; name: string } | null
}

const formatPerformedAt = (isoDate: string): string => {
  const date = new Date(isoDate)
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${day}.${month}.${year} ${hours}:${minutes}`
}

const CategoryBadge = ({
  category,
}: {
  category: 'general' | 'health' | 'sensitive_health'
}) => {
  switch (category) {
    case 'health':
      return (
        <Badge variant="outline" className="border-yellow-500 text-yellow-700">
          Zdrowotna
        </Badge>
      )
    case 'sensitive_health':
      return (
        <Badge variant="outline" className="border-red-500 text-red-700">
          Wrażliwa zdrowotna
        </Badge>
      )
    case 'general':
    default:
      return <Badge>Ogólna</Badge>
  }
}

export default function ClientTreatmentRecordsPage() {
  const params = useParams()
  const router = useRouter()
  const { slug, id: clientId } = params as { slug: string; id: string }
  const {
    isLoading: isRoleLoading,
    isOwnerOrManager,
  } = useCurrentRole()

  const [records, setRecords] = useState<TreatmentRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchRecords = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(
          `/api/treatment-records?client_id=${clientId}`
        )
        if (!response.ok) {
          throw new Error('Nie udało się pobrać kart zabiegowych.')
        }
        const data = await response.json()
        setRecords(data.records || [])
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Wystąpił nieznany błąd.'
        )
      } finally {
        setLoading(false)
      }
    }

    if (clientId) {
      fetchRecords()
    }
  }, [clientId])

  const renderContent = () => {
    if (loading) {
      return (
        <TableBody>
          {[...Array(3)].map((_, i) => (
            <TableRow key={i}>
              <TableCell>
                <Skeleton className="h-4 w-[120px]" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-[150px]" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-[120px]" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-[100px]" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      )
    }

    if (error) {
      return (
        <div className="flex items-center justify-center p-8">
          <p className="text-red-500">{error}</p>
        </div>
      )
    }

    if (records.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center gap-4 py-16">
          <FileText className="h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground">Brak kart zabiegowych</p>
        </div>
      )
    }

    return (
      <TableBody>
        {records.map(record => (
          <TableRow
            key={record.id}
            className="cursor-pointer"
            onClick={() =>
              router.push(
                `/${slug}/clients/${clientId}/treatment-records/${record.id}`
              )
            }
          >
            <TableCell>{formatPerformedAt(record.performed_at)}</TableCell>
            <TableCell>{record.service?.name || '—'}</TableCell>
            <TableCell>
              {record.employee
                ? `${record.employee.first_name} ${record.employee.last_name}`
                : '—'}
            </TableCell>
            <TableCell>
              <CategoryBadge category={record.data_category} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center">
        <Button variant="outline" size="icon" className="mr-4" asChild>
          <Link href={`/${slug}/clients/${clientId}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <CardTitle className="flex-1">Karty zabiegowe</CardTitle>
        <Button variant="outline" asChild className="mr-2">
          <Link href={`/${slug}/clients/${clientId}/treatment-plans`}>
            Plany leczenia
          </Link>
        </Button>
        {!isRoleLoading && isOwnerOrManager() && (
          <Button asChild>
            <Link href={`/${slug}/clients/${clientId}/treatment-records/new`}>
              Nowa karta zabiegu
            </Link>
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {loading || error || records.length > 0 ? (
          <Table>
            {!loading && !error && records.length > 0 && (
              <TableHeader>
                <TableRow>
                  <TableHead>Data zabiegu</TableHead>
                  <TableHead>Zabieg</TableHead>
                  <TableHead>Pracownik</TableHead>
                  <TableHead>Kategoria</TableHead>
                </TableRow>
              </TableHeader>
            )}
            {renderContent()}
          </Table>
        ) : (
          renderContent()
        )}
      </CardContent>
    </Card>
  )
}
