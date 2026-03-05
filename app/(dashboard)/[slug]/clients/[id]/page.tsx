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
  template_name: string;
  submitted_at?: string;
  signed_at?: string;
  signature_url?: string;
  created_at: string;
  fill_token_exp?: string;
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

interface FormDetail {
  answers: Record<string, any>;
  template: {
    name: string;
    fields: Array<{
      id: string;
      label: string;
      type: string;
    }>;
  };
  signature_url?: string;
}

export default function ClientDetailPage() {
  const params = useParams()
  const slug = params.slug as string
  const id = params.id as string

  const [client, setClient] = useState<Client | null>(null)
  const [forms, setForms] = useState<ClientForm[]>([])
  const [beautyPlans, setBeautyPlans] = useState<BeautyPlan[]>([])
  const [loading, setLoading] = useState(true)

  const [selectedForm, setSelectedForm] = useState<FormDetail | null>(null)
  const [isFormDialogOpen, setIsFormDialogOpen] = useState(false)
  const [loadingForm, setLoadingForm] = useState(false)

  const [isNewPlanOpen, setIsNewPlanOpen] = useState(false)
  const [newPlanData, setNewPlanData] = useState({ title: '', description: '' })
  const [isAddStepOpen, setIsAddStepOpen] = useState(false)
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null)
  const [newStepData, setNewStepData] = useState({ service_id: '', planned_date: '', notes: '', step_order: 1 })

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const [clientRes, formsRes, plansRes] = await Promise.all([
        fetch(`/api/clients/${id}`),
        fetch(`/api/clients/${id}/forms`),
        fetch(`/api/clients/${id}/beauty-plans`)
      ])

      if (clientRes.ok) setClient(await clientRes.json())
      if (formsRes.ok) setForms(await formsRes.json())
      if (plansRes.ok) setBeautyPlans(await plansRes.json())
    } catch (error) {
      toast.error('BĹ‚Ä…d podczas pobierania danych')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleShowForm = async (formId: string) => {
    try {
      setLoadingForm(true)
      setIsFormDialogOpen(true)
      const res = await fetch(`/api/clients/${id}/forms/${formId}`)
      if (res.ok) {
        setSelectedForm(await res.json())
      }
    } catch (error) {
      toast.error('BĹ‚Ä…d podczas pobierania szczegĂłĹ‚Ăłw formularza')
    } finally {
      setLoadingForm(false)
    }
  }

  const handleResendLink = (formId: string) => {
    toast.success('Link zostaĹ‚ wysĹ‚any ponownie')
  }

  const handleCreatePlan = async () => {
    try {
      const res = await fetch(`/api/clients/${id}/beauty-plans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPlanData)
      })
      if (res.ok) {
        toast.success('Plan zostaĹ‚ utworzony')
        setIsNewPlanOpen(false)
        fetchData()
      }
    } catch (error) {
      toast.error('BĹ‚Ä…d podczas tworzenia planu')
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
        toast.success('Krok zostaĹ‚ dodany')
        setIsAddStepOpen(false)
        fetchData()
      }
    } catch (error) {
      toast.error('BĹ‚Ä…d podczas dodawania kroku')
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
      toast.error('BĹ‚Ä…d podczas aktualizacji kroku')
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
        WrĂłÄ‡ do klientĂłw
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
        <TabsList className="grid w-full grid-cols-4 lg:w-[540px]">
          <TabsTrigger value="ogolne">OgĂłlne</TabsTrigger>
          <TabsTrigger value="karty">Karty medyczne</TabsTrigger>
          <TabsTrigger value="beauty">Beauty Plan</TabsTrigger>
          <TabsTrigger value="sms">SMS</TabsTrigger>
        </TabsList>

        <TabsContent value="ogolne" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Informacje o kliencie</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">ImiÄ™ i nazwisko</Label>
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
              <CardTitle>WypeĹ‚nione formularze</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data przesĹ‚ania</TableHead>
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
                      <TableRow key={form.id} className="cursor-pointer" onClick={() => handleShowForm(form.id)}>
                        <TableCell>{form.submitted_at ? new Date(form.submitted_at).toLocaleDateString('pl-PL') : '-'}</TableCell>
                        <TableCell className="font-medium">{form.template_name}</TableCell>
                        <TableCell>
                          {form.submitted_at ? (
                            <Badge className="bg-green-500 hover:bg-green-600">WypeĹ‚niony</Badge>
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
                            WyĹ›lij ponownie
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Dialog open={isFormDialogOpen} onOpenChange={setIsFormDialogOpen}>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{selectedForm?.template.name || 'SzczegĂłĹ‚y formularza'}</DialogTitle>
              </DialogHeader>
              {loadingForm ? (
                <div className="py-12 flex justify-center">
                  <Loader2 className="w-8 h-8 animate-spin" />
                </div>
              ) : selectedForm ? (
                <div className="space-y-6 py-4">
                  {selectedForm.template.fields.map((field) => (
                    <div key={field.id} className="space-y-1">
                      <Label className="text-muted-foreground">{field.label}</Label>
                      <div className="p-2 border rounded-md bg-muted/20">
                        {String(selectedForm.answers[field.id] || '-')}
                      </div>
                    </div>
                  ))}
                  {selectedForm.signature_url && (
                    <div className="pt-4 border-t">
                      <Label className="block mb-2">Podpis klienta</Label>
                      <div className="border rounded-md p-2 bg-white inline-block">
                        <img src={selectedForm.signature_url} alt="Podpis" className="max-h-32" />
                      </div>
                    </div>
                  )}
                  <div className="flex justify-end pt-4">
                    <Button onClick={() => setIsFormDialogOpen(false)}>Zamknij</Button>
                  </div>
                </div>
              ) : null}
            </DialogContent>
          </Dialog>
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
                  Klient nie posiada jeszcze planĂłw zabiegowych.
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
                       plan.status === 'completed' ? 'UkoĹ„czony' : 'Pauzowany'}
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
                              {step.is_completed && <span className="text-xs text-green-600 font-medium">ZakoĹ„czono</span>}
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
                  <Label>TytuĹ‚ planu</Label>
                  <Input 
                    placeholder="np. Terapia przeciwstarzeniowa" 
                    value={newPlanData.title}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewPlanData({...newPlanData, title: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Opis (opcjonalnie)</Label>
                  <Textarea 
                    placeholder="KrĂłtki opis celĂłw planu..." 
                    value={newPlanData.description}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNewPlanData({...newPlanData, description: e.target.value})}
                  />
                </div>
                <Button className="w-full" onClick={handleCreatePlan} disabled={!newPlanData.title}>
                  UtwĂłrz plan
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
                  <Label>KolejnoĹ›Ä‡</Label>
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
      </Tabs>
    </div>
  )
}


