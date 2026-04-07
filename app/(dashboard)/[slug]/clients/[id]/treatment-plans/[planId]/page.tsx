'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useCurrentRole } from '@/hooks/use-current-role'
import SessionActions from '@/components/treatment-plans/session-actions'

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

const planStatusLabels: Record<string, string> = {
  active: 'Aktywny',
  completed: 'Ukończony',
  cancelled: 'Anulowany',
}

const sessionStatusLabels: Record<string, string> = {
  planned: 'Zaplanowana',
  completed: 'Ukończona',
  cancelled: 'Anulowana',
}

export default function TreatmentPlanPage(): JSX.Element {
  const params = useParams<PageParams>()
  const router = useRouter()
  const { isLoading: isRoleLoading, isOwnerOrManager } = useCurrentRole()
  const [plan, setPlan] = useState<TreatmentPlan | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isUpdating, setIsUpdating] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editName, setEditName] = useState('')
  const [editNotes, setEditNotes] = useState('')

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

  const openEditDialog = (): void => {
    if (!plan) return
    setEditName(plan.name)
    setEditNotes(plan.notes ?? '')
    setIsEditDialogOpen(true)
  }

  const handleEditPlan = async (): Promise<void> => {
    if (!plan) return
    const trimmedName = editName.trim()
    if (!trimmedName) return

    setIsUpdating(true)
    try {
      const response = await fetch(`/api/treatment-plans/${plan.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          notes: editNotes.trim() === '' ? null : editNotes.trim(),
        }),
      })
      if (!response.ok) {
        throw new Error('Nie udało się zaktualizować planu.')
      }
      setIsEditDialogOpen(false)
      await fetchPlan()
    } catch (err) {
      console.error(err)
    } finally {
      setIsUpdating(false)
    }
  }

  const handleDeletePlan = async (): Promise<void> => {
    if (!plan) return
    const confirmed = window.confirm('Czy na pewno chcesz usunąć ten plan zabiegowy?')
    if (!confirmed) return

    setIsUpdating(true)
    try {
      const response = await fetch(`/api/treatment-plans/${plan.id}`, {
        method: 'DELETE',
      })
      if (!response.ok) {
        throw new Error('Nie udało się usunąć planu.')
      }
      router.push(`/${params.slug}/clients/${params.id}/treatment-plans`)
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
  
  const sortedSessions = [...plan.sessions].sort((a, b) => a.session_number - b.session_number)
  const hasPlanNotes = Boolean(plan.notes?.trim())

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
          <Badge className={planStatusClasses[plan.status]}>{planStatusLabels[plan.status] ?? plan.status}</Badge>
        </div>
        {!isRoleLoading && isOwnerOrManager() && (
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={openEditDialog} disabled={isUpdating}>
              Edytuj plan
            </Button>
            <Button variant="destructive" onClick={handleDeletePlan} disabled={isUpdating}>
              Usuń plan
            </Button>
            {plan.status === 'active' && (
              <Button variant="destructive" onClick={handleCancelPlan} disabled={isUpdating}>
                {isUpdating ? 'Anulowanie...' : 'Anuluj plan'}
              </Button>
            )}
          </div>
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
                      {sessionStatusLabels[session.status] ?? session.status}
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
                    {!isRoleLoading && isOwnerOrManager() && (
                      <SessionActions
                        session={session}
                        planId={plan.id}
                        clientId={params.id}
                        salonSlug={params.slug}
                        onUpdate={fetchPlan}
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {hasPlanNotes && (
        <Card>
          <CardHeader>
            <CardTitle>Notatki</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm">{plan.notes}</p>
          </CardContent>
        </Card>
      )}

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edytuj plan</DialogTitle>
            <DialogDescription>Zmień nazwę i notatki planu zabiegowego.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="plan-name">Nazwa planu</Label>
              <Input
                id="plan-name"
                value={editName}
                onChange={event => setEditName(event.target.value)}
                placeholder="Wpisz nazwę planu"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-notes">Notatki</Label>
              <Textarea
                id="plan-notes"
                value={editNotes}
                onChange={event => setEditNotes(event.target.value)}
                placeholder="Dodaj notatki"
                rows={5}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} disabled={isUpdating}>
              Anuluj
            </Button>
            <Button onClick={handleEditPlan} disabled={isUpdating || editName.trim().length === 0}>
              Zapisz
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
