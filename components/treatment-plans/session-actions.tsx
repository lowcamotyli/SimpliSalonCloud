'use client'

import { useMemo, useState } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

type SessionActionsProps = {
  session: {
    id: string
    session_number: number
    status: string
    notes: string | null
    booking_id: string | null
    scheduled_at: string | null
  }
  planId: string
  clientId: string
  salonSlug: string
  onUpdate: () => void
}

const statusConfig: Record<string, { label: string; className: string }> = {
  planned: {
    label: 'Zaplanowana',
    className: 'bg-gray-200 text-gray-800 hover:bg-gray-200',
  },
  completed: {
    label: 'Ukończona',
    className: 'bg-green-500 text-white hover:bg-green-500',
  },
  cancelled: {
    label: 'Pominięta',
    className: 'bg-yellow-400 text-black hover:bg-yellow-400',
  },
}

const getErrorMessage = async (response: Response): Promise<string> => {
  try {
    const data = (await response.json()) as { error?: string; message?: string }
    if (typeof data.error === 'string' && data.error.length > 0) return data.error
    if (typeof data.message === 'string' && data.message.length > 0) return data.message
  } catch {
  }
  return 'Nie udało się zaktualizować sesji.'
}

export default function SessionActions({ session, planId, onUpdate }: SessionActionsProps): JSX.Element {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSkipOpen, setIsSkipOpen] = useState(false)
  const [isNotesOpen, setIsNotesOpen] = useState(false)
  const [isBookingOpen, setIsBookingOpen] = useState(false)
  const [notesValue, setNotesValue] = useState(session.notes ?? '')
  const [bookingValue, setBookingValue] = useState(session.booking_id ?? '')

  const status = useMemo(() => {
    return statusConfig[session.status] ?? {
      label: session.status,
      className: 'bg-gray-200 text-gray-800 hover:bg-gray-200',
    }
  }, [session.status])

  const patchSession = async (payload: Record<string, string | null>): Promise<boolean> => {
    setIsSubmitting(true)
    setError(null)
    try {
      const response = await fetch(`/api/treatment-plans/${planId}/sessions/${session.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        throw new Error(await getErrorMessage(response))
      }

      onUpdate()
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się zaktualizować sesji.')
      return false
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleComplete = async (): Promise<void> => {
    await patchSession({ status: 'completed' })
  }

  const handleSkip = async (): Promise<void> => {
    const success = await patchSession({ status: 'cancelled' })
    if (success) {
      setIsSkipOpen(false)
    }
  }

  const handleSaveNotes = async (): Promise<void> => {
    const normalized = notesValue.trim()
    const success = await patchSession({ notes: normalized === '' ? null : normalized })
    if (success) {
      setIsNotesOpen(false)
    }
  }

  const handleSaveBooking = async (): Promise<void> => {
    const normalized = bookingValue.trim()
    const success = await patchSession({ booking_id: normalized === '' ? null : normalized })
    if (success) {
      setIsBookingOpen(false)
    }
  }

  const openNotesDialog = (): void => {
    setNotesValue(session.notes ?? '')
    setIsNotesOpen(true)
  }

  const openBookingDialog = (): void => {
    setBookingValue(session.booking_id ?? '')
    setIsBookingOpen(true)
  }

  return (
    <>
      <div className="flex items-center justify-end gap-2">
        <Badge className={status.className}>{status.label}</Badge>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={isSubmitting}>
              <MoreHorizontal className="h-4 w-4" />
              <span className="sr-only">Akcje dla sesji {session.session_number}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {session.status === 'planned' && (
              <DropdownMenuItem onSelect={() => void handleComplete()}>
                Oznacz jako ukończona
              </DropdownMenuItem>
            )}
            {session.status === 'planned' && (
              <DropdownMenuItem onSelect={() => setIsSkipOpen(true)}>
                Pomiń sesję
              </DropdownMenuItem>
            )}
            {session.status === 'planned' && <DropdownMenuSeparator />}
            <DropdownMenuItem onSelect={openNotesDialog}>Edytuj notatki</DropdownMenuItem>
            <DropdownMenuItem onSelect={openBookingDialog}>Powiąż z wizytą</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {error && <p className="mt-2 text-right text-xs text-red-600">{error}</p>}

      <AlertDialog open={isSkipOpen} onOpenChange={setIsSkipOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pominąć sesję?</AlertDialogTitle>
            <AlertDialogDescription>
              Ta sesja zostanie oznaczona jako pominięta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Wróć</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleSkip()} disabled={isSubmitting}>
              Potwierdź
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={isNotesOpen} onOpenChange={setIsNotesOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edytuj notatki sesji</DialogTitle>
            <DialogDescription>
              Uzupełnij notatki dla sesji nr {session.session_number}.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={notesValue}
            onChange={event => setNotesValue(event.target.value)}
            placeholder="Wpisz notatki"
            rows={6}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNotesOpen(false)} disabled={isSubmitting}>
              Anuluj
            </Button>
            <Button onClick={() => void handleSaveNotes()} disabled={isSubmitting}>
              Zapisz
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isBookingOpen} onOpenChange={setIsBookingOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Powiąż z wizytą</DialogTitle>
            <DialogDescription>
              Podaj identyfikator wizyty do powiązania sesji.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={bookingValue}
            onChange={event => setBookingValue(event.target.value)}
            placeholder="booking_id"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBookingOpen(false)} disabled={isSubmitting}>
              Anuluj
            </Button>
            <Button onClick={() => void handleSaveBooking()} disabled={isSubmitting}>
              Zapisz
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </>
  )
}
