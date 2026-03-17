'use client'

import { useState, useEffect, useCallback, FormEvent } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Plus, X } from 'lucide-react'
import { toast } from 'sonner'

import { useCurrentRole } from '@/hooks/use-current-role'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

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
}
type Employee = { id: string; first_name: string; last_name: string }
type Service = { id: string; name: string }

export default function NewTreatmentRecordPage() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()

  const slug = params.slug as string
  const clientId = params.id as string
  const bookingId = searchParams.get('bookingId')

  const { isOwnerOrManager, isLoading: isRoleLoading } = useCurrentRole()

  const [employees, setEmployees] = useState<Employee[]>([])
  const [services, setServices] = useState<Service[]>([])

  const [performedAt, setPerformedAt] = useState<string>(new Date().toISOString().slice(0, 16))
  const [serviceId, setServiceId] = useState<string>('')
  const [employeeId, setEmployeeId] = useState<string>('')
  const [dataCategory, setDataCategory] = useState<'general' | 'health' | 'sensitive_health'>('general')
  const [dynamicParameters, setDynamicParameters] = useState<{ key: string; value: string }[]>([{ key: '', value: '' }])
  const [protocols, setProtocols] = useState<Array<{ id: string; name: string; fields: Array<{ id: string; label: string; type: string }> }>>([])
  const [selectedProtocolId, setSelectedProtocolId] = useState<string>('')
  const [notes, setNotes] = useState<string>('')

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [isLoadingData, setIsLoadingData] = useState<boolean>(true)

  useEffect(() => {
    if (!isRoleLoading && !isOwnerOrManager()) {
      toast.error('Nie masz uprawnień do dodawania kart zabiegów.')
      router.push(`/${slug}/clients/${clientId}`)
    }
  }, [isRoleLoading, isOwnerOrManager, router, slug, clientId])

  useEffect(() => {
    const fetchData = async () => {
      setIsLoadingData(true)
      try {
        const [employeesRes, servicesRes] = await Promise.all([
          fetch('/api/employees'),
          fetch('/api/services'),
        ])

        if (!employeesRes.ok || !servicesRes.ok) {
          throw new Error('Failed to fetch initial data')
        }

        const employeesData = await employeesRes.json()
        const servicesData = await servicesRes.json()
        setEmployees(employeesData)
        setServices(servicesData)

        if (bookingId) {
          const bookingRes = await fetch(`/api/bookings/${bookingId}`)
          if (bookingRes.ok) {
            const bookingData = await bookingRes.json()
            if (bookingData.service_id) setServiceId(bookingData.service_id)
            if (bookingData.employee_id) setEmployeeId(bookingData.employee_id)
          }
        }
      } catch (error) {
        toast.error('Nie udało się załadować danych. Spróbuj ponownie.')
        console.error(error)
      } finally {
        setIsLoadingData(false)
      }
    }
    fetchData()
  }, [bookingId])

  useEffect(() => {
    if (!serviceId) { setProtocols([]); setSelectedProtocolId(''); return }
    fetch(`/api/treatment-protocols?service_id=${serviceId}`)
      .then(r => r.ok ? r.json() : { protocols: [] })
      .then(data => { setProtocols(data.protocols || []); setSelectedProtocolId('') })
      .catch(() => setProtocols([]))
  }, [serviceId])

  const handleParameterChange = (index: number, field: 'key' | 'value', value: string) => {
    const newParameters = [...dynamicParameters]
    newParameters[index][field] = value
    setDynamicParameters(newParameters)
  }

  const addParameter = () => {
    setDynamicParameters([...dynamicParameters, { key: '', value: '' }])
  }

  const removeParameter = (index: number) => {
    const newParameters = dynamicParameters.filter((_, i) => i !== index)
    setDynamicParameters(newParameters)
  }

  const handleProtocolSelect = (protocolId: string) => {
    setSelectedProtocolId(protocolId)
    const protocol = protocols.find(p => p.id === protocolId)
    if (!protocol) return
    const autofilled = protocol.fields.map(f => ({
      key: f.label,
      value: f.type === 'boolean' ? 'false' : f.type === 'number' ? '0' : '',
    }))
    setDynamicParameters(autofilled.length > 0 ? autofilled : [{ key: '', value: '' }])
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!employeeId) {
      toast.error('Proszę wybrać pracownika.')
      return
    }

    setIsSubmitting(true)
    try {
      const payload = {
        client_id: clientId,
        employee_id: employeeId,
        service_id: serviceId || null,
        booking_id: bookingId || null,
        performed_at: new Date(performedAt).toISOString(),
        data_category: dataCategory,
        parameters: Object.fromEntries(dynamicParameters.filter(p => p.key).map(p => [p.key, p.value])),
        notes: notes,
      }

      const res = await fetch('/api/treatment-records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || 'Nie udało się zapisać karty.')
      }

      const responseData = await res.json()
      const newRecord = responseData.record as TreatmentRecord
      toast.success('Karta zabiegu została pomyślnie dodana.')
      router.push(`/${slug}/clients/${clientId}/treatment-records/${newRecord.id}`)
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Button asChild variant="outline" size="icon">
          <Link href={`/${slug}/clients/${clientId}/treatment-records`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">Nowa karta zabiegu</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Wypełnij szczegóły zabiegu</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="performed_at">Data wykonania</Label>
                <Input
                  id="performed_at"
                  type="datetime-local"
                  value={performedAt}
                  onChange={(e) => setPerformedAt(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="data_category">Kategoria danych</Label>
                 <Select onValueChange={(value: 'general' | 'health' | 'sensitive_health') => setDataCategory(value)} defaultValue={dataCategory}>
                  <SelectTrigger id="data_category">
                    <SelectValue placeholder="Wybierz kategorię danych" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">Ogólna</SelectItem>
                    <SelectItem value="health">Zdrowotna</SelectItem>
                    <SelectItem value="sensitive_health">Wrażliwa zdrowotna</SelectItem>
                  </SelectContent>
                </Select>
              </div>
               <div className="space-y-2">
                <Label htmlFor="employee_id">Pracownik</Label>
                <Select onValueChange={setEmployeeId} value={employeeId} required>
                  <SelectTrigger id="employee_id">
                    <SelectValue placeholder="Wybierz pracownika" />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map(emp => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.first_name} {emp.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
               <div className="space-y-2">
                <Label htmlFor="service_id">Zabieg</Label>
                <Select onValueChange={setServiceId} value={serviceId}>
                  <SelectTrigger id="service_id">
                    <SelectValue placeholder="Wybierz zabieg" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Brak</SelectItem>
                    {services.map(srv => (
                      <SelectItem key={srv.id} value={srv.id}>
                        {srv.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {protocols.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="protocol_id">Protokół zabiegu (opcjonalne)</Label>
                <Select onValueChange={handleProtocolSelect} value={selectedProtocolId}>
                  <SelectTrigger id="protocol_id">
                    <SelectValue placeholder="Wybierz protokół..." />
                  </SelectTrigger>
                  <SelectContent>
                    {protocols.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
                <Label>Parametry zabiegu</Label>
                <div className="space-y-2">
                    {dynamicParameters.map((param, index) => (
                        <div key={index} className="flex items-center gap-2">
                            <Input
                                placeholder="Nazwa parametru (np. Użyty kwas)"
                                value={param.key}
                                onChange={(e) => handleParameterChange(index, 'key', e.target.value)}
                            />
                            <Input
                                placeholder="Wartość (np. Migdałowy 10%)"
                                value={param.value}
                                onChange={(e) => handleParameterChange(index, 'value', e.target.value)}
                            />
                            <Button type="button" variant="ghost" size="icon" onClick={() => removeParameter(index)}>
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    ))}
                </div>
                 <Button type="button" variant="outline" size="sm" onClick={addParameter}>
                    <Plus className="mr-2 h-4 w-4" />
                    Dodaj parametr
                </Button>
            </div>

            <div className="space-y-2">
                <Label htmlFor="notes">Notatki (zaszyfrowane)</Label>
                <Textarea
                    id="notes"
                    placeholder="Notatki widoczne tylko dla personelu..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={5}
                />
            </div>
            
            <div className="flex justify-end">
                <Button type="submit" disabled={isSubmitting || isLoadingData}>
                    {isSubmitting ? 'Zapisywanie...' : 'Zapisz kartę'}
                </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
