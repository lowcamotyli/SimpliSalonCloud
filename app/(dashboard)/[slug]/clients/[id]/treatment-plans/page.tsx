'use client'

import { useState, useEffect, FormEvent } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, PlusCircle } from 'lucide-react'

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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useCurrentRole } from '@/hooks/use-current-role'

type TreatmentPlan = {
  id: string
  client_id: string
  service_id: string | null
  protocol_id: string | null
  name: string
  total_sessions: number
  status: 'active' | 'completed' | 'cancelled'
  started_at: string | null
  completed_at: string | null
  notes: string | null
  session_count?: number
}

export default function TreatmentPlansPage({
  params,
}: {
  params: { slug: string; id: string }
}) {
  const { slug, id: clientId } = params
  const router = useRouter()
  const { isLoading: isRoleLoading, isOwnerOrManager } = useCurrentRole()
  const [plans, setPlans] = useState<TreatmentPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [newPlanName, setNewPlanName] = useState('')
  const [newPlanTotalSessions, setNewPlanTotalSessions] = useState(1)
  const [newPlanNotes, setNewPlanNotes] = useState('')

  useEffect(() => {
    async function fetchTreatmentPlans() {
      setLoading(true)
      try {
        const response = await fetch(`/api/treatment-plans?client_id=${clientId}`)
        if (!response.ok) {
          throw new Error('Failed to fetch treatment plans')
        }
        const data = await response.json()
        setPlans(data.plans || [])
      } catch (error) {
        console.error(error)
      } finally {
        setLoading(false)
      }
    }
    fetchTreatmentPlans()
  }, [clientId])

  const handleCreatePlan = async (e: FormEvent) => {
    e.preventDefault()
    if (!newPlanName || newPlanTotalSessions < 1) {
      return
    }

    try {
      const response = await fetch('/api/treatment-plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          name: newPlanName,
          total_sessions: Number(newPlanTotalSessions),
          notes: newPlanNotes,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to create plan')
      }

      const responseData = await response.json()
      setPlans(prev => [...prev, responseData.plan as TreatmentPlan])
      setIsDialogOpen(false)
      setNewPlanName('')
      setNewPlanTotalSessions(1)
      setNewPlanNotes('')
    } catch (error) {
      console.error(error)
    }
  }

  const getStatusVariant = (
    status: 'active' | 'completed' | 'cancelled'
  ) => {
    switch (status) {
      case 'active':
        return 'default'
      case 'completed':
        return 'success'
      case 'cancelled':
        return 'secondary'
      default:
        return 'outline'
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/${slug}/clients/${clientId}`}>
            <Button variant="outline" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold">Plany leczenia</h1>
        </div>
        {!isRoleLoading && isOwnerOrManager() && (
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <PlusCircle className="mr-2 h-4 w-4" />
              Nowy plan
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Utwórz nowy plan leczenia</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreatePlan} className="space-y-4">
              <div>
                <Label htmlFor="name">Nazwa planu</Label>
                <Input
                  id="name"
                  value={newPlanName}
                  onChange={e => setNewPlanName(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="total_sessions">Liczba sesji</Label>
                <Input
                  id="total_sessions"
                  type="number"
                  min="1"
                  value={newPlanTotalSessions}
                  onChange={e => setNewPlanTotalSessions(parseInt(e.target.value))}
                  required
                />
              </div>
              <div>
                <Label htmlFor="notes">Notatki</Label>
                <Textarea
                  id="notes"
                  value={newPlanNotes}
                  onChange={e => setNewPlanNotes(e.target.value)}
                />
              </div>
              <DialogFooter>
                <Button type="submit">Utwórz plan</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Istniejące plany</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : plans.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              Brak planów leczenia
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nazwa</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Postęp</TableHead>
                  <TableHead>Data rozpoczęcia</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.map(plan => (
                  <TableRow
                    key={plan.id}
                    onClick={() => router.push(`/${slug}/clients/${clientId}/treatment-plans/${plan.id}`)}
                    className="cursor-pointer"
                  >
                    <TableCell className="font-medium">{plan.name}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusVariant(plan.status)}>
                        {plan.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {plan.session_count || 0} / {plan.total_sessions}
                    </TableCell>
                    <TableCell>
                      {plan.started_at
                        ? new Date(plan.started_at).toLocaleDateString()
                        : 'Nierozpoczęty'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
