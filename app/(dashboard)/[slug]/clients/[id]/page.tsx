'use client'

import { useParams } from 'next/navigation'
import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  ArrowLeft,
  FileText,
  Star,
  Calendar,
  CheckCircle2,
  Circle,
  Plus,
  Loader2,
  Download,
  RefreshCw,
  ChevronLeft,
} from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { SmsChat } from '@/components/crm/SmsChat'
import { SubmissionViewDialog } from '@/components/forms/submission-view-dialog'
import { createClient } from '@/lib/supabase/client'

interface Client {
  id: string;
  full_name: string;
  phone?: string;
  email?: string;
  notes?: string;
  visit_count: number;
}

interface ClientForm {
  id: string;
  template_name: string | null;
  submitted_at?: string;
  signed_at?: string;
  signature_url?: string;
  created_at: string;
  fill_token_exp?: string;
  form_template_id: string;
  source: 'client_form' | 'pre_appointment';
}

interface BeautyPlanStep {
  id: string;
  plan_id: string;
  service_id?: string;
  booking_id?: string;
  planned_date?: string;
  notes?: string;
  step_order: number;
  is_completed: boolean;
}

interface BeautyPlan {
  id: string;
  title: string;
  description?: string;
  status: string;
  beauty_plan_steps: BeautyPlanStep[];
}

interface Voucher {
  id: string;
  code: string;
  initial_value: number;
  current_balance: number;
  status: 'active' | 'used' | 'expired';
  expires_at: string;
  buyer_client_id: string | null;
  beneficiary_client_id: string | null;
}


export default function ClientDetailPage() {
  const params = useParams()
  const slug = params.slug as string
  const id = params.id as string

  const [client, setClient] = useState<Client | null>(null)
  const [forms, setForms] = useState<ClientForm[]>([])
  const [beautyPlans, setBeautyPlans] = useState<BeautyPlan[]>([])
  const [vouchers, setVouchers] = useState<Voucher[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddVoucher, setShowAddVoucher] = useState(false)
  const [newVoucherValue, setNewVoucherValue] = useState(100)
  const [newVoucherDays, setNewVoucherDays] = useState(365)
  const [addingVoucher, setAddingVoucher] = useState(false)

  const [selectedForm, setSelectedForm] = useState<ClientForm | null>(null)
  const [isFormDialogOpen, setIsFormDialogOpen] = useState(false)

  const [isNewPlanOpen, setIsNewPlanOpen] = useState(false)
  const [newPlanData, setNewPlanData] = useState({ title: '', description: '' })
  const [isAddStepOpen, setIsAddStepOpen] = useState(false)
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null)
  const [newStepData, setNewStepData] = useState({ service_id: '', planned_date: '', notes: '', step_order: 1 })

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pl-PL', {
      style: 'currency',
      currency: 'PLN',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
  }

  const handleAddVoucher = async () => {
    if (!id || newVoucherValue <= 0 || newVoucherDays <= 0) return
    setAddingVoucher(true)
    try {
      const res = await fetch('/api/vouchers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          beneficiaryClientId: id,
          initialValue: newVoucherValue,
          validityDays: newVoucherDays,
        }),
      })
      if (!res.ok) throw new Error()
      const created = await res.json()
      setVouchers(prev => [created, ...prev])
      setShowAddVoucher(false)
      setNewVoucherValue(100)
      setNewVoucherDays(365)
      toast.success(`Voucher ${created.code} utworzony`)
    } catch {
      toast.error('Błąd podczas tworzenia vouchera')
    } finally {
      setAddingVoucher(false)
    }
  }

  const getVoucherStatusBadgeClass = (status: Voucher['status']) => {
    if (status === 'active') return 'bg-green-500 hover:bg-green-600'
    if (status === 'used') return 'bg-gray-500 hover:bg-gray-600'
    return 'bg-red-500 hover:bg-red-600'
  }

  const getVoucherStatusLabel = (status: Voucher['status']) => {
    if (status === 'active') return 'Aktywny'
    if (status === 'used') return 'Wykorzystany'
    return 'Wygasły'
  }

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const supabase = createClient()
      const { data: salonData } = await supabase
        .from('salons')
        .select('id')
        .eq('slug', slug)
        .single()

      const salonId = salonData?.id ?? ''

      const [clientRes, formsRes, plansRes, vouchersRes] = await Promise.all([
        fetch(`/api/clients/${id}`),
        fetch(`/api/clients/${id}/forms`),
        fetch(`/api/clients/${id}/beauty-plans`),
        salonId ? fetch(`/api/vouchers?salonId=${salonId}&clientId=${id}`) : Promise.resolve(null),
      ])

      if (clientRes.ok) { const cd = await clientRes.json(); setClient(cd.client ?? cd) }
      if (formsRes.ok) { const fd = await formsRes.json(); setForms(fd.forms ?? fd) }
      if (plansRes.ok) { const pd = await plansRes.json(); setBeautyPlans(pd.plans ?? pd) }
      if (vouchersRes?.ok) {
        const rawVouchers = await vouchersRes.json()
        const vouchersList = Array.isArray(rawVouchers) ? rawVouchers : (rawVouchers.vouchers ?? [])
        const clientVouchers = vouchersList.filter((voucher: Voucher) =>
          voucher.buyer_client_id === id || voucher.beneficiary_client_id === id
        )
        setVouchers(clientVouchers)
      } else {
        setVouchers([])
      }
    } catch (error) {
      toast.error('Błąd podczas pobierania danych')
    } finally {
      setLoading(false)
    }
  }, [id, slug])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleShowForm = (form: ClientForm) => {
    setSelectedForm(form)
    setIsFormDialogOpen(true)
  }

  const handleResendLink = (formId: string) => {
    toast.success('Link został wysłany ponownie')
  }

  const handleCreatePlan = async () => {
    try {
      const res = await fetch(`/api/clients/${id}/beauty-plans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPlanData)
      })
      if (res.ok) {
        toast.success('Plan został utworzony')
        setIsNewPlanOpen(false)
        fetchData()
      }
    } catch (error) {
      toast.error('Błąd podczas tworzenia planu')
    }
  }

  const handleAddStep = async () => {
    if (!selectedPlanId) return
    try {
      const res = await fetch(`/api/beauty-plans/${selectedPlanId}/steps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newStepData)
      })
      if (res.ok) {
        toast.success('Krok został dodany')
        setIsAddStepOpen(false)
        fetchData()
      }
    } catch (error) {
      toast.error('Błąd podczas dodawania kroku')
    }
  }

  const handleToggleStep = async (planId: string, stepId: string, currentStatus: boolean) => {
    try {
      const res = await fetch(`/api/beauty-plans/${planId}/steps/${stepId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_completed: !currentStatus })
      })
      if (res.ok) {
        fetchData()
      }
    } catch (error) {
      toast.error('Błąd podczas aktualizacji kroku')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <Link href={`/${slug}/clients`} className="flex items-center text-sm text-muted-foreground hover:text-primary transition-colors">
        <ArrowLeft className="w-4 h-4 mr-2" />
        Wróć do klientów
      </Link>

      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{client?.full_name}</h1>
          <p className="text-muted-foreground">{client?.email || 'Brak adresu email'}</p>
        </div>
        <Badge variant="outline" className="text-lg py-1 px-3">
          Wizyty: {client?.visit_count || 0}
        </Badge>
      </div>

      <Tabs defaultValue="ogolne" className="w-full">
        <TabsList className="grid w-full grid-cols-5 lg:w-[720px]">
          <TabsTrigger value="ogolne">Ogólne</TabsTrigger>
          <TabsTrigger value="karty">Karty medyczne</TabsTrigger>
          <TabsTrigger value="beauty">Beauty Plan</TabsTrigger>
          <TabsTrigger value="sms">SMS</TabsTrigger>
          <TabsTrigger value="vouchery">Vouchery</TabsTrigger>
        </TabsList>

        <TabsContent value="ogolne" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Informacje o kliencie</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Imię i nazwisko</Label>
                  <p className="font-medium text-lg">{client?.full_name}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Telefon</Label>
                  <p className="font-medium text-lg">{client?.phone || '-'}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Email</Label>
                  <p className="font-medium text-lg">{client?.email || '-'}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Liczba wizyt</Label>
                  <p className="font-medium text-lg">{client?.visit_count || 0}</p>
                </div>
              </div>
              <div>
                <Label className="text-muted-foreground">Notatki</Label>
                <div className="p-3 border rounded-md bg-muted/30 min-h-[100px]">
                  {client?.notes || 'Brak notatek'}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="karty" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Wypełnione formularze</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data przesłania</TableHead>
                    <TableHead>Nazwa szablonu</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Podpis</TableHead>
                    <TableHead className="text-right">Akcje</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {forms.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        Brak kart medycznych
                      </TableCell>
                    </TableRow>
                  ) : (
                    forms.map((form) => (
                      <TableRow key={form.id} className="cursor-pointer" onClick={() => form.submitted_at && handleShowForm(form)}>
                        <TableCell>{form.submitted_at ? new Date(form.submitted_at).toLocaleDateString('pl-PL') : '-'}</TableCell>
                        <TableCell className="font-medium">{form.template_name}</TableCell>
                        <TableCell>
                          {form.submitted_at ? (
                            <Badge className="bg-green-500 hover:bg-green-600">Wypełniony</Badge>
                          ) : (
                            <Badge className="bg-yellow-500 hover:bg-yellow-600">Oczekuje</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {form.signed_at ? <CheckCircle2 className="w-5 h-5 text-green-500" /> : <Circle className="w-5 h-5 text-muted-foreground" />}
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="sm" onClick={() => handleResendLink(form.id)}>
                            <RefreshCw className="w-4 h-4 mr-2" />
                            Wyślij ponownie
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <SubmissionViewDialog
            submission={selectedForm ? {
              id: selectedForm.id,
              source: selectedForm.source,
              form_template_id: selectedForm.form_template_id,
              form_templates: selectedForm.template_name ? { name: selectedForm.template_name } : null,
              clients: client ? { full_name: client.full_name } : null,
              submitted_at: selectedForm.submitted_at ?? null,
            } : null}
            open={isFormDialogOpen}
            onOpenChange={setIsFormDialogOpen}
          />
        </TabsContent>

        <TabsContent value="beauty" className="mt-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold">Plany zabiegowe</h2>
            <Button onClick={() => setIsNewPlanOpen(true)}>
              <Plus className="w-4 h-4 mr-2" /> Nowy plan
            </Button>
          </div>

          <div className="grid gap-6">
            {beautyPlans.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  Klient nie posiada jeszcze planów zabiegowych.
                </CardContent>
              </Card>
            ) : (
              beautyPlans.map((plan) => (
                <Card key={plan.id}>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle>{plan.title}</CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">{plan.description}</p>
                    </div>
                    <Badge className={
                      plan.status === 'active' ? 'bg-blue-500' :
                      plan.status === 'completed' ? 'bg-green-500' :
                      'bg-gray-500'
                    }>
                      {plan.status === 'active' ? 'Aktywny' :
                       plan.status === 'completed' ? 'Ukończony' : 'Pauzowany'}
                    </Badge>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-0 border-l-2 border-muted ml-4 pl-8 relative">
                      {plan.beauty_plan_steps
                        .sort((a, b) => a.step_order - b.step_order)
                        .map((step, idx) => (
                          <div key={step.id} className="mb-8 last:mb-0 relative">
                            <button 
                              onClick={() => handleToggleStep(plan.id, step.id, step.is_completed)}
                              className="absolute -left-[41px] top-0 bg-background p-1"
                            >
                              {step.is_completed ? (
                                <CheckCircle2 className="w-6 h-6 text-green-500 fill-green-50" />
                              ) : (
                                <Circle className="w-6 h-6 text-muted-foreground" />
                              )}
                            </button>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold">Krok {idx + 1}: {step.notes || 'Bez nazwy'}</span>
                                {step.planned_date && (
                                  <Badge variant="secondary" className="font-normal">
                                    <Calendar className="w-3 h-3 mr-1" />
                                    {new Date(step.planned_date).toLocaleDateString('pl-PL')}
                                  </Badge>
                                )}
                              </div>
                              {step.is_completed && <span className="text-xs text-green-600 font-medium">Zakończono</span>}
                            </div>
                          </div>
                        ))}
                    </div>
                    <div className="mt-6">
                      <Button variant="outline" size="sm" onClick={() => {
                        setSelectedPlanId(plan.id)
                        setIsAddStepOpen(true)
                      }}>
                        <Plus className="w-4 h-4 mr-2" /> Dodaj krok
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          <Dialog open={isNewPlanOpen} onOpenChange={setIsNewPlanOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nowy Beauty Plan</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Tytuł planu</Label>
                  <Input 
                    placeholder="np. Terapia przeciwstarzeniowa" 
                    value={newPlanData.title}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewPlanData({...newPlanData, title: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Opis (opcjonalnie)</Label>
                  <Textarea 
                    placeholder="Krótki opis celów planu..." 
                    value={newPlanData.description}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNewPlanData({...newPlanData, description: e.target.value})}
                  />
                </div>
                <Button className="w-full" onClick={handleCreatePlan} disabled={!newPlanData.title}>
                  Utwórz plan
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={isAddStepOpen} onOpenChange={setIsAddStepOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Dodaj krok do planu</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Notatki / Nazwa kroku</Label>
                  <Input 
                    placeholder="np. Pierwszy peeling chemiczny" 
                    value={newStepData.notes}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewStepData({...newStepData, notes: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Planowana data</Label>
                  <Input 
                    type="date" 
                    value={newStepData.planned_date}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewStepData({...newStepData, planned_date: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Kolejność</Label>
                  <Input 
                    type="number" 
                    value={newStepData.step_order}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewStepData({...newStepData, step_order: parseInt(e.target.value) || 1})}
                  />
                </div>
                <Button className="w-full" onClick={handleAddStep} disabled={!newStepData.notes}>
                  Dodaj krok
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </TabsContent>
        <TabsContent value="sms" className="mt-6">
          <SmsChat clientId={id} />
        </TabsContent>
        <TabsContent value="vouchery" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Vouchery klienta</CardTitle>
              <Button size="sm" onClick={() => setShowAddVoucher(v => !v)} className="gradient-button rounded-lg">
                <Plus className="h-4 w-4 mr-1" /> Dodaj voucher
              </Button>
            </CardHeader>
            <CardContent>
              {showAddVoucher && (
                <div className="mb-4 p-4 border rounded-lg space-y-3 bg-muted/30">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Wartość (zł)</Label>
                      <Input type="number" min={1} value={newVoucherValue} onChange={e => setNewVoucherValue(Number(e.target.value))} />
                    </div>
                    <div className="space-y-1">
                      <Label>Ważność (dni)</Label>
                      <Input type="number" min={1} value={newVoucherDays} onChange={e => setNewVoucherDays(Number(e.target.value))} />
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" size="sm" onClick={() => setShowAddVoucher(false)}>Anuluj</Button>
                    <Button size="sm" onClick={handleAddVoucher} disabled={addingVoucher} className="gradient-button rounded-lg">
                      {addingVoucher ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Utwórz'}
                    </Button>
                  </div>
                </div>
              )}
              {vouchers.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground">
                  Klient nie posiada voucherów.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kod</TableHead>
                      <TableHead>Saldo / Wartość</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Wygasa</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vouchers.map((voucher) => (
                      <TableRow key={voucher.id}>
                        <TableCell className="font-medium">{voucher.code}</TableCell>
                        <TableCell>
                          {formatCurrency(Number(voucher.current_balance))} / {formatCurrency(Number(voucher.initial_value))}
                        </TableCell>
                        <TableCell>
                          <Badge className={getVoucherStatusBadgeClass(voucher.status)}>
                            {getVoucherStatusLabel(voucher.status)}
                          </Badge>
                        </TableCell>
                        <TableCell>{new Date(voucher.expires_at).toLocaleDateString('pl-PL')}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
