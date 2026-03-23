'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { useCurrentRole } from '@/hooks/use-current-role'

type TreatmentSession = {
  id: string
  plan_id: string
  session_number: number
  status: 'planned' | 'completed' | 'cancelled'
  booking_id: string | null
  treatment_record_id: string | null
  scheduled_at: string | null
  completed_at: string | null
  notes: string | null
}

type TreatmentPlan = {
  id: string
  client_id: string
  name: string
  total_sessions: number
  status: 'active' | 'completed' | 'cancelled'
  started_at: string | null
  completed_at: string | null
  notes: string | null
  sessions: TreatmentSession[]
}

type PageParams = {
  slug: string
  id: string
  planId: string
}

const planStatusClasses = {
  active: 'bg-blue-500 hover:bg-blue-500 text-white',
  completed: 'bg-green-500 hover:bg-green-500 text-white',
  cancelled: 'bg-gray-400 hover:bg-gray-400 text-white',
}

const sessionStatusClasses = {
  planned: 'bg-yellow-400 hover:bg-yellow-400 text-black',
  completed: 'bg-green-500 hover:bg-green-500 text-white',
  cancelled: 'bg-gray-400 hover:bg-gray-400 text-white',
}

export default function TreatmentPlanPage({ params }: { params: PageParams }) {
  const { isLoading: isRoleLoading, isOwnerOrManager } = useCurrentRole()
  const [plan, setPlan] = useState<TreatmentPlan | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isUpdating, setIsUpdating] = useState(false)

  const fetchPlan = useCallback(async () => {
    try {
      const response = await fetch(`/api/treatment-plans/${params.planId}`)
      if (!response.ok) {
        throw new Error('Nie udało się pobrać planu zabiegowego.')
      }
      const data = await response.json()
      setPlan(data.plan)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Wystąpił nieznany błąd.')
    } finally {
      setLoading(false)
    }
  }, [params.planId])

  useEffect(() => {
    if (params.planId) {
        setLoading(true)
        fetchPlan()
    }
  }, [params.planId, fetchPlan])

  const handleUpdateSession = async (sessionId: string, status: 'completed' | 'cancelled') => {
    setIsUpdating(true)
    const body = {
      status,
      ...(status === 'completed' && { completed_at: new Date().toISOString() }),
    }
    try {
      const response = await fetch(`/api/treatment-plans/${params.planId}/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!response.ok) {
        throw new Error('Nie udało się zaktualizować sesji.')
      }
      await fetchPlan()
    } catch (err) {
      console.error(err)
    } finally {
      setIsUpdating(false)
    }
  }

  const handleCancelPlan = async () => {
    if (!plan) return
    setIsUpdating(true)
    try {
      const response = await fetch(`/api/treatment-plans/${plan.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      })
      if (!response.ok) {
        throw new Error('Nie udało się anulować planu.')
      }
      await fetchPlan()
    } catch (err) {
      console.error(err)
    } finally {
      setIsUpdating(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-4">
            <Skeleton className="h-10 w-10" />
            <Skeleton className="h-8 w-1/4" />
            <Skeleton className="h-6 w-20" />
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-1/3 mb-2" />
            <Skeleton className="h-4 w-1/4" />
          </CardHeader>
          <CardContent>
             <Skeleton className="h-3 w-full rounded-full" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-1/3" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error) {
    return <div className="p-6 text-center text-red-500">{error}</div>
  }

  if (!plan) {
    return <div className="p-6 text-center">Nie znaleziono planu.</div>
  }

  const completedSessions = plan.sessions.filter(s => s.status === 'completed').length
  const progressPercentage = plan.total_sessions > 0 ? (completedSessions / plan.total_sessions) * 100 : 0
  
  const sortedSessions = [...plan.sessions].sort((a, b) => a.session_number - b.session_number);

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" asChild>
            <Link href={`/${params.slug}/clients/${params.id}/treatment-plans`}>
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">Back</span>
            </Link>
          </Button>
          <h1 className="text-2xl font-bold truncate">{plan.name}</h1>
          <Badge className={planStatusClasses[plan.status]}>{plan.status}</Badge>
        </div>
        {!isRoleLoading && isOwnerOrManager() && plan.status === 'active' && (
          <Button variant="destructive" onClick={handleCancelPlan} disabled={isUpdating}>
            {isUpdating ? 'Anulowanie...' : 'Anuluj plan'}
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Postęp planu</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-2 text-sm font-medium text-muted-foreground">
            <span>Postęp</span>
            <span>
              {completedSessions} / {plan.total_sessions} sesji
            </span>
          </div>
          <div className="w-full bg-secondary rounded-full h-2.5">
            <div
              className="bg-blue-600 h-2.5 rounded-full"
              style={{ width: `${progressPercentage}%` }}
            ></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sesje zabiegowe</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">Sesja</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Zaplanowano</TableHead>
                <TableHead>Zakończono</TableHead>
                <TableHead className="text-right">Akcje</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedSessions.map(session => (
                <TableRow key={session.id}>
                  <TableCell className="font-medium">{session.session_number}</TableCell>
                  <TableCell>
                    <Badge className={sessionStatusClasses[session.status]}>
                      {session.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {session.scheduled_at
                      ? new Date(session.scheduled_at).toLocaleDateString()
                      : '-'}
                  </TableCell>
                  <TableCell>
                    {session.completed_at
                      ? new Date(session.completed_at).toLocaleDateString()
                      : '-'}
                  </TableCell>
                  <TableCell className="text-right">
                    {!isRoleLoading && isOwnerOrManager() && session.status === 'planned' && (
                      <div className="flex gap-2 justify-end">
                        <Button
                          size="sm"
                          onClick={() => handleUpdateSession(session.id, 'completed')}
                          disabled={isUpdating}
                        >
                          Zakończ
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleUpdateSession(session.id, 'cancelled')}
                          disabled={isUpdating}
                        >
                          Anuluj
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
