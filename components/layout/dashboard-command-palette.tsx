'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, UserPlus, Scissors, Users, CalendarPlus, LayoutDashboard, Calendar, FileText } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'

type CommandAction = {
  id: string
  label: string
  keywords: string
  hint?: string
  icon: React.ComponentType<{ className?: string }>
  run: () => void
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  if (target.isContentEditable) {
    return true
  }

  const editable = target.closest('input, textarea, select, [contenteditable="true"]')
  return editable !== null
}

export function DashboardCommandPalette({ salonSlug }: { salonSlug: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const actions = useMemo<CommandAction[]>(
    () => [
      {
        id: 'go-dashboard',
        label: 'Przejdz do Dashboardu',
        keywords: 'dashboard home',
        hint: 'G D',
        icon: LayoutDashboard,
        run: () => router.push(`/${salonSlug}/dashboard`),
      },
      {
        id: 'go-calendar',
        label: 'Przejdz do Kalendarza',
        keywords: 'calendar terminarz',
        hint: 'G C',
        icon: Calendar,
        run: () => router.push(`/${salonSlug}/calendar`),
      },
      {
        id: 'go-bookings',
        label: 'Przejdz do Rezerwacji',
        keywords: 'bookings rezerwacje',
        hint: 'G B',
        icon: FileText,
        run: () => router.push(`/${salonSlug}/bookings`),
      },
      {
        id: 'new-client',
        label: 'Dodaj klienta',
        keywords: 'new client klient',
        hint: 'N C',
        icon: UserPlus,
        run: () => router.push(`/${salonSlug}/clients?action=new-client`),
      },
      {
        id: 'new-service',
        label: 'Dodaj usluge',
        keywords: 'new service usluga',
        hint: 'N S',
        icon: Scissors,
        run: () => router.push(`/${salonSlug}/services?action=new-service`),
      },
      {
        id: 'new-employee',
        label: 'Dodaj pracownika',
        keywords: 'new employee pracownik',
        hint: 'N E',
        icon: Users,
        run: () => router.push(`/${salonSlug}/employees?action=new-employee`),
      },
      {
        id: 'new-booking',
        label: 'Dodaj rezerwacje',
        keywords: 'new booking wizyta rezerwacja',
        hint: 'N B',
        icon: CalendarPlus,
        run: () => router.push(`/${salonSlug}/calendar?action=new-booking`),
      },
    ],
    [router, salonSlug]
  )

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) {
      return actions
    }

    return actions.filter((item) => {
      const haystack = `${item.label} ${item.keywords}`.toLowerCase()
      return haystack.includes(normalized)
    })
  }, [actions, query])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) {
        return
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen((prev) => !prev)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) {
          setQuery('')
        }
      }}
    >
      <DialogContent className="max-w-xl p-0">
        <DialogTitle className="sr-only">Command Palette</DialogTitle>
        <Command>
          <CommandInput
            placeholder="Wpisz komende..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoFocus
          />
          <CommandList>
            {filtered.length === 0 ? (
              <CommandEmpty>Brak wynikow</CommandEmpty>
            ) : (
              <CommandGroup>
                {filtered.map((item) => {
                  const Icon = item.icon
                  return (
                    <CommandItem
                      key={item.id}
                      onClick={() => {
                        item.run()
                        setOpen(false)
                        setQuery('')
                      }}
                    >
                      <Icon className="mr-2 h-4 w-4 text-muted-foreground" />
                      <span>{item.label}</span>
                      {item.hint ? (
                        <span className="ml-auto rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {item.hint}
                        </span>
                      ) : null}
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            )}
          </CommandList>
          <div className="border-t px-3 py-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Search className="h-3.5 w-3.5" />
              Otworz: Ctrl/Cmd+K
            </span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  )
}

