'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface Voucher {
  id: string
  code: string
  initial_value: number
  current_balance: number
  status: 'active' | 'used' | 'expired'
  expires_at: string
  buyer_client_id: string | null
  beneficiary_client_id: string | null
  created_at: string
  voucher_transactions?: Array<{
    id: string
    amount: number
    balance_after: number
    note: string | null
    created_at: string
  }>
}

type TabValue = 'all' | 'active' | 'used' | 'expired'

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(amount)

const formatDate = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'

  return new Intl.DateTimeFormat('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

const getStatusBadge = (status: Voucher['status']) => {
  if (status === 'active') {
    return <Badge variant="success">Aktywny</Badge>
  }

  if (status === 'used') {
    return <Badge variant="secondary">Wykorzystany</Badge>
  }

  return <Badge variant="destructive">Wygasly</Badge>
}

export default function VouchersSettingsPage() {
  const params = useParams()
  const slugParam = params.slug
  const slug = Array.isArray(slugParam) ? slugParam[0] : String(slugParam ?? '')

  const [salonId, setSalonId] = useState(slug)
  const [vouchers, setVouchers] = useState<Voucher[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabValue>('all')

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [initialValue, setInitialValue] = useState('')
  const [validityDays, setValidityDays] = useState('90')
  const [isCreating, setIsCreating] = useState(false)

  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false)
  const [selectedVoucher, setSelectedVoucher] = useState<Voucher | null>(null)
  const [isDetailsLoading, setIsDetailsLoading] = useState(false)

  useEffect(() => {
    let isCancelled = false

    const resolveSalonId = async () => {
      setSalonId(slug)

      try {
        const response = await fetch('/api/auth/session', { cache: 'no-store' })
        if (!response.ok) return

        const session = await response.json()
        const sessionSalonId =
          session?.salonId || session?.user?.salonId || session?.session?.salonId || null

        if (!isCancelled && typeof sessionSalonId === 'string' && sessionSalonId.length > 0) {
          setSalonId(sessionSalonId)
        }
      } catch {
        // Session endpoint may be unavailable in this app; slug fallback is always valid.
      }
    }

    void resolveSalonId()

    return () => {
      isCancelled = true
    }
  }, [slug])

  const fetchVouchers = async (currentSalonId: string) => {
    if (!currentSalonId) {
      setVouchers([])
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch(`/api/vouchers?salonId=${encodeURIComponent(currentSalonId)}`, {
        cache: 'no-store',
      })

      if (!response.ok) {
        throw new Error('Nie udalo sie pobrac voucherow')
      }

      const data = (await response.json()) as Voucher[]
      setVouchers(Array.isArray(data) ? data : [])
    } catch (error) {
      setVouchers([])
      toast.error(error instanceof Error ? error.message : 'Wystapil blad podczas pobierania')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void fetchVouchers(salonId)
  }, [salonId])

  const filteredVouchers = useMemo(() => {
    if (activeTab === 'all') return vouchers
    return vouchers.filter((voucher) => voucher.status === activeTab)
  }, [activeTab, vouchers])

  const handleCreateVoucher = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const parsedValue = Number(initialValue)
    const parsedDays = Number(validityDays)

    if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
      toast.error('Podaj poprawna wartosc vouchera')
      return
    }

    if (!Number.isInteger(parsedDays) || parsedDays <= 0) {
      toast.error('Podaj poprawna liczbe dni waznosci')
      return
    }

    setIsCreating(true)
    try {
      const response = await fetch('/api/vouchers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initialValue: parsedValue,
          validityDays: parsedDays,
          salonId,
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.error || 'Nie udalo sie wystawic vouchera')
      }

      toast.success('Voucher zostal wystawiony')
      setInitialValue('')
      setValidityDays('90')
      setIsCreateDialogOpen(false)
      await fetchVouchers(salonId)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Wystapil blad podczas tworzenia vouchera')
    } finally {
      setIsCreating(false)
    }
  }

  const handleOpenVoucherDetails = async (voucherId: string) => {
    setIsDetailsDialogOpen(true)
    setSelectedVoucher(null)
    setIsDetailsLoading(true)

    try {
      const response = await fetch(`/api/vouchers/${voucherId}`, { cache: 'no-store' })
      if (!response.ok) {
        throw new Error('Nie udalo sie pobrac szczegolow vouchera')
      }

      const payload = (await response.json()) as { voucher: Voucher }
      setSelectedVoucher(payload.voucher)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Wystapil blad podczas pobierania szczegolow')
      setIsDetailsDialogOpen(false)
    } finally {
      setIsDetailsLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-normal text-[var(--v3-text-primary)] sm:text-4xl">Vouchery</h1>
          <p className="font-ui text-base font-medium text-[var(--v3-text-secondary)] theme-header-subtitle">Zarzadzanie voucherami salonu.</p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>Wystaw voucher</Button>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabValue)}>
        <TabsList className="rounded-[var(--v3-r-sm)] border border-[var(--v3-border)] bg-[var(--v3-surface)] p-1">
          <TabsTrigger value="all">Wszystkie</TabsTrigger>
          <TabsTrigger value="active">Aktywne</TabsTrigger>
          <TabsTrigger value="used">Wykorzystane</TabsTrigger>
          <TabsTrigger value="expired">Wygasle</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="rounded-[var(--v3-r-md)] border border-[var(--v3-border)] bg-[var(--v3-surface)] shadow-[var(--v3-shadow-card)]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Kod</TableHead>
              <TableHead>Wartosc poczatkowa</TableHead>
              <TableHead>Saldo</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Wygasa</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-[var(--v3-text-secondary)]">
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Ladowanie voucherow...
                  </span>
                </TableCell>
              </TableRow>
            ) : filteredVouchers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-[var(--v3-text-secondary)]">
                  Brak voucherow
                </TableCell>
              </TableRow>
            ) : (
              filteredVouchers.map((voucher) => (
                <TableRow
                  key={voucher.id}
                  className="cursor-pointer transition-colors hover:bg-[var(--v3-secondary-soft)]"
                  onClick={() => void handleOpenVoucherDetails(voucher.id)}
                >
                  <TableCell className="font-medium">{voucher.code}</TableCell>
                  <TableCell className="font-display text-[17px] font-bold tabular-nums text-[var(--v3-gold)]">{formatCurrency(Number(voucher.initial_value))}</TableCell>
                  <TableCell className="font-display text-[17px] font-bold tabular-nums text-[var(--v3-gold)]">{formatCurrency(Number(voucher.current_balance))}</TableCell>
                  <TableCell>{getStatusBadge(voucher.status)}</TableCell>
                  <TableCell>{formatDate(voucher.expires_at)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Wystaw voucher</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateVoucher} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="voucher-value">Wartosc (PLN)</Label>
              <Input
                id="voucher-value"
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                value={initialValue}
                onChange={(event) => setInitialValue(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="voucher-validity">Waznosc (dni)</Label>
              <Input
                id="voucher-validity"
                type="number"
                min="1"
                step="1"
                value={validityDays}
                onChange={(event) => setValidityDays(event.target.value)}
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                Anuluj
              </Button>
              <Button type="submit" disabled={isCreating}>
                {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Utworz
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isDetailsDialogOpen} onOpenChange={setIsDetailsDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Szczegoly vouchera</DialogTitle>
          </DialogHeader>

          {isDetailsLoading ? (
            <div className="py-8 text-center text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Ladowanie szczegolow...
              </span>
            </div>
          ) : selectedVoucher ? (
            <div className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <p className="text-sm text-muted-foreground">Kod</p>
                  <p className="font-medium">{selectedVoucher.code}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <div>{getStatusBadge(selectedVoucher.status)}</div>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Wartosc poczatkowa</p>
                  <p>{formatCurrency(Number(selectedVoucher.initial_value))}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Saldo</p>
                  <p>{formatCurrency(Number(selectedVoucher.current_balance))}</p>
                </div>
              </div>

              <div>
                <p className="mb-2 text-sm font-medium">Historia transakcji</p>
                <div className="rounded-[var(--v3-r-md)] border border-[var(--v3-border)] bg-[var(--v3-surface)] shadow-[var(--v3-shadow-card)]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Kwota</TableHead>
                        <TableHead>Saldo po</TableHead>
                        <TableHead>Notatka</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(selectedVoucher.voucher_transactions ?? []).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-muted-foreground">
                            Brak transakcji dla tego vouchera
                          </TableCell>
                        </TableRow>
                      ) : (
                        (selectedVoucher.voucher_transactions ?? []).map((transaction) => (
                          <TableRow key={transaction.id} className="transition-colors hover:bg-[var(--v3-secondary-soft)]">
                            <TableCell>{formatDate(transaction.created_at)}</TableCell>
                            <TableCell className="font-display font-bold tabular-nums text-[var(--v3-gold)]">{formatCurrency(Number(transaction.amount))}</TableCell>
                            <TableCell className="font-display font-bold tabular-nums text-[var(--v3-gold)]">{formatCurrency(Number(transaction.balance_after))}</TableCell>
                            <TableCell>{transaction.note || '—'}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          ) : (
            <p className="py-8 text-center text-muted-foreground">Nie znaleziono danych vouchera</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
