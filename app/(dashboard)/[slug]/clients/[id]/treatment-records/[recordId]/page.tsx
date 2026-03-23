'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { pl } from 'date-fns/locale'
import { ArrowLeft, Shield, X, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useCurrentRole } from '@/hooks/use-current-role'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PhotoUpload } from '@/components/treatment-records/photo-upload'

type TreatmentRecordDetail = {
  id: string
  salon_id: string
  booking_id: string | null
  client_id: string
  employee_id: string
  service_id: string | null
  performed_at: string
  parameters: Record<string, unknown>
  notes: string | null
  data_category: 'general' | 'health' | 'sensitive_health'
  has_health_consent: boolean
  created_at: string
  updated_at: string
  client: { id: string; full_name: string } | null
  employee: { id: string; first_name: string; last_name: string } | null
  service: { id: string; name: string } | null
}

export default function TreatmentRecordDetailPage() {
  const params = useParams()
  const { slug, id, recordId } = params as {
    slug: string
    id: string
    recordId: string
  }

  const { isOwnerOrManager, isLoading: roleLoading } = useCurrentRole()

  const [record, setRecord] = useState<TreatmentRecordDetail | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [editMode, setEditMode] = useState<boolean>(false)
  const [editParams, setEditParams] = useState<Record<string, unknown>>({})
  const [editNotes, setEditNotes] = useState<string>('')
  const [saving, setSaving] = useState<boolean>(false)

  const fetchRecord = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/treatment-records/${recordId}`)
      if (!response.ok) {
        throw new Error('Nie udało się pobrać danych karty zabiegu.')
      }
      const data = await response.json()
      setRecord(data.record)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (recordId) {
      fetchRecord()
    }
  }, [recordId])

  const handleEnterEditMode = () => {
    if (!record) return
    setEditParams({ ...record.parameters })
    setEditNotes(record.notes ?? '')
    setEditMode(true)
  }

  const handleCancelEdit = () => {
    setEditMode(false)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const response = await fetch(`/api/treatment-records/${recordId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parameters: editParams,
          notes: editNotes,
        }),
      })

      if (!response.ok) {
        throw new Error('Nie udało się zapisać zmian.')
      }

      toast.success('Karta zabiegu została zaktualizowana.')
      setEditMode(false)
      fetchRecord() // Reload data
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleParamChange = (
    index: number,
    field: 'key' | 'value',
    value: string
  ) => {
    const newParams = Object.entries(editParams)
    if (field === 'key') {
      newParams[index][0] = value
    } else {
      newParams[index][1] = value
    }
    setEditParams(Object.fromEntries(newParams))
  }

  const addParam = () => {
    setEditParams({ ...editParams, '': '' })
  }

  const removeParam = (key: string) => {
    const newParams = { ...editParams }
    delete newParams[key]
    // A bit of a hack to handle removing the temporary empty key
    const newEntries = Object.entries(newParams).filter(([k, _]) => k !== key)
    setEditParams(Object.fromEntries(newEntries))
  }

  if (loading) {
    return (
      <div className='p-4 space-y-4'>
        <Skeleton className='h-8 w-32' />
        <Skeleton className='h-10 w-full' />
        <Skeleton className='h-64 w-full' />
      </div>
    )
  }

  if (error) {
    return <p className='p-4 text-red-500'>{error}</p>
  }

  if (!record) {
    return <p className='p-4'>Nie znaleziono karty zabiegu.</p>
  }

  const DataCategoryBadge = ({
    category,
  }: {
    category: TreatmentRecordDetail['data_category']
  }) => {
    switch (category) {
      case 'general':
        return <Badge variant='secondary'>Ogólna</Badge>
      case 'health':
        return (
          <Badge variant='outline' className='border-yellow-500 text-yellow-700'>
            Zdrowotna
          </Badge>
        )
      case 'sensitive_health':
        return (
          <Badge variant='outline' className='border-red-500 text-red-700'>
            Wrażliwa zdrowotna
          </Badge>
        )
      default:
        return null
    }
  }

  return (
    <div className='p-4 space-y-4'>
      <Link
        href={`/${slug}/clients/${id}/treatment-records`}
        className='flex items-center text-sm text-gray-500 hover:text-gray-900'
      >
        <ArrowLeft className='w-4 h-4 mr-2' />
        Wróć do listy kart
      </Link>

      <div className='flex justify-between items-center'>
        <h1 className='text-2xl font-bold'>Karta zabiegu</h1>
        {!editMode && !roleLoading && isOwnerOrManager() && (
          <Button onClick={handleEnterEditMode}>Edytuj</Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className='flex flex-wrap items-center gap-2'>
            <span>
              {format(new Date(record.performed_at), 'dd.MM.yyyy HH:mm', {
                locale: pl,
              })}
            </span>
            <DataCategoryBadge category={record.data_category} />
            <span className='font-normal text-base'>
              - {record.client?.full_name || 'Klient bez nazwy'}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className='space-y-6'>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-4 text-sm'>
            <div>
              <Label>Zabieg</Label>
              <p className='font-semibold'>{record.service?.name || '—'}</p>
            </div>
            <div>
              <Label>Pracownik</Label>
              <p className='font-semibold'>
                {record.employee
                  ? `${record.employee.first_name} ${record.employee.last_name}`
                  : '—'}
              </p>
            </div>
          </div>

          <div className='space-y-2'>
            <h3 className='font-semibold text-lg'>Parametry</h3>
            {editMode ? (
              <div className='space-y-2'>
                {Object.entries(editParams).map(([key, value], index) => (
                  <div key={index} className='flex items-center gap-2'>
                    <Input
                      placeholder='Nazwa parametru'
                      value={key}
                      onChange={e =>
                        handleParamChange(index, 'key', e.target.value)
                      }
                      className='flex-1'
                    />
                    <Input
                      placeholder='Wartość'
                      value={String(value)}
                      onChange={e =>
                        handleParamChange(index, 'value', e.target.value)
                      }
                      className='flex-1'
                    />
                    <Button
                      variant='ghost'
                      size='icon'
                      onClick={() => removeParam(key)}
                    >
                      <X className='w-4 h-4' />
                    </Button>
                  </div>
                ))}
                <Button variant='outline' size='sm' onClick={addParam}>
                  <Plus className='w-4 h-4 mr-2' />
                  Dodaj parametr
                </Button>
              </div>
            ) : (
              <div>
                {Object.keys(record.parameters).length > 0 ? (
                  <div className='grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-4 border rounded-md'>
                    {Object.entries(record.parameters).map(([key, value]) => (
                      <div key={key}>
                        <Label>{key}</Label>
                        <p className='font-medium'>{String(value)}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className='text-gray-500'>Brak parametrów</p>
                )}
              </div>
            )}
          </div>

          <div className='space-y-2'>
            <h3 className='font-semibold text-lg'>Notatki</h3>
            {editMode ? (
              <Textarea
                value={editNotes}
                onChange={e => setEditNotes(e.target.value)}
                placeholder='Wprowadź notatki...'
                rows={5}
              />
            ) : (
              <p className='text-gray-700 whitespace-pre-wrap'>
                {record.notes || 'Brak notatek'}
              </p>
            )}
          </div>

          {editMode && (
            <div className='flex justify-end gap-2'>
              <Button variant='ghost' onClick={handleCancelEdit}>
                Anuluj
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Zapisywanie...' : 'Zapisz'}
              </Button>
            </div>
          )}

          {record.data_category !== 'general' && !editMode && (
            <div className='flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-md text-yellow-800'>
              <Shield className='w-5 h-5' />
              <p className='text-sm font-medium'>
                Dostęp do tej karty jest rejestrowany.
              </p>
            </div>
          )}

          {!editMode && (
            <div className='space-y-2 pt-2'>
              <h3 className='font-semibold text-lg'>Dokumentacja fotograficzna</h3>
              <PhotoUpload
                treatmentRecordId={record.id}
                clientId={record.client_id}
                hasHealthConsent={record.has_health_consent}
                isOwnerOrManager={isOwnerOrManager()}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
