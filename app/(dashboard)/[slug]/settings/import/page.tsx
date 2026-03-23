'use client'

import { useState, useMemo, useCallback, useRef } from 'react'
import { useEmployees } from '@/hooks/use-employees'
import { useServices } from '@/hooks/use-services'
import { useImportBookings } from '@/hooks/use-import-bookings'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Upload,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  Loader2,
  User,
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { toast } from 'sonner'
import { BOOKING_STATUS_LABELS } from '@/lib/constants'
import { BUILTIN_TEMPLATES } from '@/lib/forms/builtin-templates'
import { TreatmentCardImportReview } from '@/components/settings/treatment-card-import-review'
import type { DataCategory } from '@/types/forms'

function SensitiveDataBadge({ dataCategory }: { dataCategory?: DataCategory }) {
  if (dataCategory !== 'sensitive_health') return null

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">
      <AlertTriangle className="h-3.5 w-3.5" />
      Dane wrazliwe
    </span>
  )
}


// --- CSV parsing ---
function parseCSV(text: string): string[][] {
  const lines: string[][] = []
  let current = ''
  let inQuotes = false
  let row: string[] = []

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const next = text[i + 1]

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        current += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        current += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        row.push(current.trim())
        current = ''
      } else if (ch === '\n' || (ch === '\r' && next === '\n')) {
        row.push(current.trim())
        current = ''
        if (row.some(cell => cell !== '')) lines.push(row)
        row = []
        if (ch === '\r') i++
      } else {
        current += ch
      }
    }
  }
  // last row
  row.push(current.trim())
  if (row.some(cell => cell !== '')) lines.push(row)

  return lines
}

const REQUIRED_HEADERS = ['data', 'godzina', 'klient_imie', 'klient_telefon', 'usluga', 'pracownik', 'czas_min', 'cena']
const SERVICE_REQUIRED_HEADERS = ['kategoria', 'podkategoria', 'nazwa', 'czas_min', 'cena']
const STATUS_MAP: Record<string, string> = {
  'completed': 'completed',
  'zakończona': 'completed',
  'zakonczona': 'completed',
  'scheduled': 'scheduled',
  'zaplanowana': 'scheduled',
  'booked': 'scheduled',
  'confirmed': 'confirmed',
  'potwierdzona': 'confirmed',
  'cancelled': 'cancelled',
  'anulowana': 'cancelled',
  'pending': 'pending',
  'oczekująca': 'pending',
  'oczekujaca': 'pending',
}

interface ServiceRow {
  kategoria: string
  podkategoria: string
  nazwa: string
  czas_min: string
  cena: string
  aktywna: string
}

interface ParsedRow {
  data: string
  godzina: string
  klient_imie: string
  klient_telefon: string
  klient_email: string
  usluga: string
  pracownik: string
  czas_min: string
  cena: string
  status: string
  notatki: string
  // mapped
  employeeId: string | null
  serviceId: string | null
  matchError: string | null
}

type FlatService = { id: string; name: string }

const STEPS = ['Upload', 'Podgląd', 'Import'] as const

export default function ImportPage() {
  const [step, setStep] = useState(0)
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([])
  const [fileName, setFileName] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 })
  const [importResult, setImportResult] = useState<{
    imported: number
    skipped: number
    errors: Array<{ row: number; reason: string }>
  } | null>(null)
  const [servicesStep, setServicesStep] = useState(0)
  const [parsedServiceRows, setParsedServiceRows] = useState<ServiceRow[]>([])
  const [servicesFileName, setServicesFileName] = useState('')
  const [isImportingServices, setIsImportingServices] = useState(false)
  const [servicesImportResult, setServicesImportResult] = useState<{
    imported: number
    skipped: number
    errors: Array<{ row: number; reason: string }>
  } | null>(null)
  const servicesFileInputRef = useRef<HTMLInputElement>(null)

  const formImportFileRef = useRef<HTMLInputElement>(null)
  const [selectedBuiltins, setSelectedBuiltins] = useState<Set<string>>(new Set())
  const [formImportResult, setFormImportResult] = useState<{ imported: number; errors: string[] } | null>(null)
  const [isImportingForms, setIsImportingForms] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const { data: employees } = useEmployees()
  const { data: servicesData } = useServices()
  const importMutation = useImportBookings()

  // Flatten grouped services to a flat list
  const flatServices: FlatService[] = useMemo(() => {
    if (!servicesData) return []
    const result: FlatService[] = []
    const categories = (servicesData as any).services || servicesData
    if (!Array.isArray(categories)) return []
    for (const cat of categories) {
      const subs = cat.subcategories
      if (Array.isArray(subs)) {
        for (const sub of subs) {
          if (Array.isArray(sub.services)) {
            for (const svc of sub.services) {
              result.push({ id: svc.id, name: svc.name })
            }
          }
        }
      } else if (typeof subs === 'object') {
        for (const key of Object.keys(subs)) {
          const sub = subs[key]
          if (Array.isArray(sub.services)) {
            for (const svc of sub.services) {
              result.push({ id: svc.id, name: svc.name })
            }
          }
        }
      }
    }
    return result
  }, [servicesData])

  const matchEmployee = useCallback((name: string): string | null => {
    if (!employees || !name) return null
    const lower = name.toLowerCase().trim()
    const match = employees.find(e => {
      const full = `${e.first_name} ${e.last_name || ''}`.toLowerCase().trim()
      return full === lower || e.first_name.toLowerCase() === lower
    })
    return match?.id || null
  }, [employees])

  const matchService = useCallback((name: string): string | null => {
    if (!flatServices.length || !name) return null
    const lower = name.toLowerCase().trim()
    const match = flatServices.find(s => s.name.toLowerCase().trim() === lower)
    return match?.id || null
  }, [flatServices])

  const handleFileSelect = useCallback((file: File) => {
    if (!file.name.endsWith('.csv')) {
      toast.error('Proszę wybrać plik CSV')
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      if (!text) {
        toast.error('Nie udało się odczytać pliku')
        return
      }

      const lines = parseCSV(text)
      if (lines.length < 2) {
        toast.error('Plik jest pusty lub zawiera tylko nagłówki')
        return
      }

      const headers = lines[0].map(h => h.toLowerCase().replace(/\s+/g, '_'))
      const missing = REQUIRED_HEADERS.filter(h => !headers.includes(h))
      if (missing.length > 0) {
        toast.error(`Brakuje kolumn: ${missing.join(', ')}`)
        return
      }

      const colIndex = (name: string) => headers.indexOf(name)

      const rows: ParsedRow[] = []
      for (let i = 1; i < lines.length; i++) {
        const cells = lines[i]
        const pracownik = cells[colIndex('pracownik')] || ''
        const usluga = cells[colIndex('usluga')] || ''

        const employeeId = matchEmployee(pracownik)
        const serviceId = matchService(usluga)

        let matchError: string | null = null
        if (!employeeId && pracownik) matchError = `Nie znaleziono pracownika: "${pracownik}"`
        if (!serviceId && usluga) {
          const serviceErr = `Nie znaleziono usługi: "${usluga}"`
          matchError = matchError ? `${matchError}; ${serviceErr}` : serviceErr
        }

        rows.push({
          data: cells[colIndex('data')] || '',
          godzina: cells[colIndex('godzina')] || '',
          klient_imie: cells[colIndex('klient_imie')] || '',
          klient_telefon: cells[colIndex('klient_telefon')] || '',
          klient_email: cells[colIndex('klient_email')] || '',
          usluga,
          pracownik,
          czas_min: cells[colIndex('czas_min')] || '',
          cena: cells[colIndex('cena')] || '',
          status: cells[colIndex('status')] || 'completed',
          notatki: cells[colIndex('notatki')] || '',
          employeeId,
          serviceId,
          matchError,
        })
      }

      setParsedRows(rows)
      setFileName(file.name)
      setStep(1)
    }
    reader.readAsText(file, 'UTF-8')
  }, [matchEmployee, matchService])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFileSelect(file)
  }, [handleFileSelect])

  const updateRowEmployee = (rowIndex: number, employeeId: string) => {
    setParsedRows(prev => prev.map((row, i) => {
      if (i !== rowIndex) return row
      const newServiceError = !row.serviceId && row.usluga ? `Nie znaleziono usługi: "${row.usluga}"` : null
      return {
        ...row,
        employeeId,
        matchError: newServiceError,
      }
    }))
  }

  const updateRowService = (rowIndex: number, serviceId: string) => {
    setParsedRows(prev => prev.map((row, i) => {
      if (i !== rowIndex) return row
      const newEmpError = !row.employeeId ? `Nie znaleziono pracownika: "${row.pracownik}"` : null
      return {
        ...row,
        serviceId,
        matchError: newEmpError,
      }
    }))
  }

  const hasUnresolved = parsedRows.some(r => !r.employeeId || !r.serviceId)
  const readyRows = parsedRows.filter(r => r.employeeId && r.serviceId)

  const handleImport = async () => {
    const rows = readyRows.map(r => ({
      booking_date: r.data,
      booking_time: r.godzina,
      client_name: r.klient_imie,
      client_phone: r.klient_telefon,
      client_email: r.klient_email,
      employee_id: r.employeeId!,
      service_id: r.serviceId!,
      duration: parseInt(r.czas_min) || 60,
      price: parseFloat(r.cena) || 0,
      status: STATUS_MAP[r.status.toLowerCase()] || 'completed',
      notes: r.notatki,
    }))

    setIsImporting(true)
    setImportProgress({ current: 0, total: rows.length })

    const batchSize = 100
    const finalResult = { imported: 0, skipped: 0, errors: [] as Array<{ row: number; reason: string }> }

    try {
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize)
        const batchResult = await importMutation.mutateAsync(batch)

        finalResult.imported += batchResult.imported
        finalResult.skipped += batchResult.skipped
        finalResult.errors.push(...(batchResult.errors || []).map(e => ({
          row: i + e.row,
          reason: e.reason
        })))

        setImportProgress({ current: Math.min(i + batchSize, rows.length), total: rows.length })
      }

      setImportResult(finalResult)
      setStep(2)
    } catch {
      // error handled by mutation logic ideally, but stop importing process on total failure
    } finally {
      setIsImporting(false)
    }
  }

  const importFormsFromFile = async (file: File) => {
    const raw = await file.text()
    const parsed: unknown = JSON.parse(raw)
    const templates = Array.isArray(parsed) ? parsed : [parsed]

    if (!templates.length) {
      throw new Error('Plik JSON nie zawiera szablonów.')
    }

    const validTemplates = templates.map((template, index) => {
      if (
        !template ||
        typeof template !== 'object' ||
        typeof (template as { name?: unknown }).name !== 'string' ||
        !Array.isArray((template as { fields?: unknown }).fields)
      ) {
        throw new Error(`Nieprawidłowy format szablonu na pozycji ${index + 1}.`)
      }
      return template as {
        name: string
        description?: string
        requires_signature?: boolean
        gdpr_consent_text?: string
        fields: Array<{ id: string; type: string; label: string; required: boolean; options?: string[] }>
      }
    })

    let imported = 0
    const errors: string[] = []

    for (const template of validTemplates) {
      try {
        const response = await fetch('/api/forms/templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...template,
            is_active: true,
          }),
        })

        if (!response.ok) {
          throw new Error('Błąd API')
        }

        imported += 1
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Nieznany błąd'
        errors.push(`${template.name}: ${message}`)
      }
    }

    setFormImportResult({ imported, errors })
  }

  const handleFormsBulkImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setIsImportingForms(true)

    try {
      await importFormsFromFile(file)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nie udało się zaimportować pliku JSON'
      toast.error(message)
      setFormImportResult({ imported: 0, errors: [message] })
    } finally {
      setIsImportingForms(false)
      event.target.value = ''
      if (formImportFileRef.current) {
        formImportFileRef.current.value = ''
      }
    }
  }

  const handleBuiltinsImport = async () => {
    if (!selectedBuiltins.size) return

    setIsImportingForms(true)
    let imported = 0
    const errors: string[] = []

    try {
      for (const name of selectedBuiltins) {
        const template = BUILTIN_TEMPLATES.find(item => item.name === name)
        if (!template) {
          errors.push(`${name}: szablon nie istnieje`)
          continue
        }

        try {
          const response = await fetch('/api/forms/templates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...template,
              is_active: true,
            }),
          })

          if (!response.ok) {
            throw new Error('Błąd API')
          }

          imported += 1
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Nieznany błąd'
          errors.push(`${name}: ${message}`)
        }
      }

      setFormImportResult({ imported, errors })
      setSelectedBuiltins(new Set())
    } finally {
      setIsImportingForms(false)
    }
  }

  const handleServicesFileSelect = useCallback((file: File) => {
    if (!file.name.endsWith(".csv")) { toast.error("Proszę wybrać plik CSV"); return }
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      if (!text) { toast.error("Nie udało się odczytać pliku"); return }
      const lines = parseCSV(text)
      if (lines.length < 2) { toast.error("Plik jest pusty lub zawiera tylko nagłówki"); return }
      const headers = lines[0].map(h => h.toLowerCase().replace(/\s+/g, "_"))
      const missing = SERVICE_REQUIRED_HEADERS.filter(h => !headers.includes(h))
      if (missing.length > 0) { toast.error("Brakuje kolumn: " + missing.join(", ")); return }
      const col = (name: string) => headers.indexOf(name)
      const rows: ServiceRow[] = lines.slice(1).map(cells => ({
        kategoria: cells[col("kategoria")] || "",
        podkategoria: cells[col("podkategoria")] || "",
        nazwa: cells[col("nazwa")] || "",
        czas_min: cells[col("czas_min")] || "",
        cena: cells[col("cena")] || "",
        aktywna: cells[col("aktywna")] || "1",
      }))
      setParsedServiceRows(rows)
      setServicesFileName(file.name)
      setServicesStep(1)
    }
    reader.readAsText(file, "UTF-8")
  }, [])

  const handleServicesImport = async () => {
    setIsImportingServices(true)
    const errors: Array<{ row: number; reason: string }> = []
    let imported = 0
    let skipped = 0

    // Validate rows client-side before sending
    const validRows: Array<{ rowIndex: number; service: object }> = []
    for (let i = 0; i < parsedServiceRows.length; i++) {
      const row = parsedServiceRows[i]
      if (!row.nazwa) {
        errors.push({ row: i + 2, reason: "Brak nazwy uslugi" })
      } else {
        validRows.push({
          rowIndex: i + 2,
          service: {
            category: row.kategoria || "Inne",
            subcategory: row.podkategoria || "Ogolne",
            name: row.nazwa,
            duration: parseInt(row.czas_min) || 60,
            price: parseFloat(row.cena) || 0,
            active: row.aktywna !== "0" && row.aktywna?.toLowerCase() !== "nie",
          },
        })
      }
    }

    if (validRows.length > 0) {
      try {
        const res = await fetch("/api/services/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ services: validRows.map((r) => r.service) }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          // Mark all valid rows as failed
          validRows.forEach((r) => errors.push({ row: r.rowIndex, reason: body.error || "Blad API" }))
        } else {
          const data = await res.json()
          imported = data.imported ?? 0
          skipped = data.skipped ?? 0
        }
      } catch {
        validRows.forEach((r) => errors.push({ row: r.rowIndex, reason: "Blad sieci" }))
      }
    }

    setServicesImportResult({ imported, skipped, errors })
    setServicesStep(2)
    setIsImportingServices(false)
  }

  const resetServices = () => {
    setServicesStep(0)
    setParsedServiceRows([])
    setServicesFileName("")
    setServicesImportResult(null)
  }
  const reset = () => {
    setStep(0)
    setParsedRows([])
    setFileName('')
    setImportResult(null)
  }

  return (
    <div className="max-w-[1600px] mx-auto space-y-8 pb-8 px-4 sm:px-0">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Import danych</h1>
        <p className="text-muted-foreground text-base font-medium">
          Migruj dane z innych systemów do SimpliSalon
        </p>
      </div>

      <Tabs defaultValue="bookings">
        <TabsList className="mb-6">
          <TabsTrigger value="bookings">Rezerwacje</TabsTrigger>
          <TabsTrigger value="services">Usługi</TabsTrigger>
          <TabsTrigger value="forms">Formularze</TabsTrigger>
          <TabsTrigger value="treatment-cards">Karty zabiegowe</TabsTrigger>
        </TabsList>

        <TabsContent value="bookings" className="space-y-8">
      {/* Steps indicator */}
      <div className="flex items-center gap-2">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <div className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all",
              i === step
                ? "bg-primary text-white shadow-lg shadow-primary/20"
                : i < step
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-gray-100 text-gray-400"
            )}>
              {i < step ? <CheckCircle2 className="h-4 w-4" /> : <span>{i + 1}</span>}
              {label}
            </div>
            {i < STEPS.length - 1 && <ArrowRight className="h-4 w-4 text-gray-300" />}
          </div>
        ))}
      </div>

      {/* Step 0: Upload */}
      {step === 0 && (
        <div className="space-y-6">
          <Card className="p-8 glass border-none shadow-xl">
            <div className="flex flex-col sm:flex-row items-start gap-6 mb-8">
              <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                <FileSpreadsheet className="h-7 w-7" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-bold text-foreground">Szablon CSV</h2>
                <p className="text-muted-foreground">
                  Pobierz szablon, wypełnij go danymi z poprzedniego systemu, a następnie załaduj tutaj.
                </p>
                <a
                  href="/templates/bookings-import-template.csv"
                  download
                  className="inline-flex items-center gap-2 text-primary font-bold hover:underline"
                >
                  <Download className="h-4 w-4" />
                  Pobierz szablon CSV
                </a>
              </div>
            </div>

            <div
              className="border-2 border-dashed border-gray-200 rounded-2xl p-12 text-center hover:border-primary/50 hover:bg-primary/5 transition-all cursor-pointer"
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleFileSelect(file)
                }}
              />
              <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-lg font-bold text-foreground mb-1">
                Przeciągnij plik CSV lub kliknij, aby wybrać
              </p>
              <p className="text-sm text-muted-foreground">
                Maksymalnie 500 wierszy na jeden import
              </p>
            </div>
          </Card>

          <Card className="p-6 glass border-none shadow-sm">
            <h3 className="font-bold text-foreground mb-3">Wymagane kolumny</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {['data', 'godzina', 'klient_imie', 'klient_telefon', 'usluga', 'pracownik', 'czas_min', 'cena'].map(col => (
                <Badge key={col} variant="outline" className="px-3 py-1.5 text-sm font-mono justify-center">
                  {col}
                </Badge>
              ))}
            </div>
            <p className="text-sm text-gray-400 mt-3">
              Opcjonalne: <span className="font-mono">klient_email</span>, <span className="font-mono">status</span>, <span className="font-mono">notatki</span>
            </p>
          </Card>
        </div>
      )}

      {/* Step 1: Preview & mapping */}
      {step === 1 && (
        <div className="space-y-6">
          <Card className="p-6 glass border-none shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Podgląd: {fileName}</h2>
                <p className="text-sm text-gray-500 mt-1">
                  {parsedRows.length} wierszy &middot;{' '}
                  <span className="text-emerald-600 font-semibold">{readyRows.length} gotowych</span>
                  {hasUnresolved && (
                    <span className="text-amber-600 font-semibold"> &middot; {parsedRows.length - readyRows.length} wymaga dopasowania</span>
                  )}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={reset} className="rounded-xl font-bold" disabled={isImporting}>
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Wróć
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={readyRows.length === 0 || isImporting}
                  className="gradient-button rounded-xl font-bold"
                >
                  {isImporting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4 mr-2" />
                  )}
                  {isImporting ? `Importowanie... ${importProgress.current}/${importProgress.total}` : `Importuj ${readyRows.length} rezerwacji`}
                </Button>
              </div>
            </div>

            {isImporting && importProgress.total > 0 && (
              <div className="mb-6 space-y-2">
                <div className="flex justify-between text-sm font-medium text-gray-700">
                  <span>Postęp importu</span>
                  <span>{Math.round((importProgress.current / importProgress.total) * 100)}%</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="bg-primary h-2.5 rounded-full transition-all duration-300"
                    style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}

            <div className="overflow-x-auto -mx-6 px-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="pb-3 text-left font-bold text-gray-400 text-xs uppercase tracking-wider">#</th>
                    <th className="pb-3 text-left font-bold text-gray-400 text-xs uppercase tracking-wider">Data</th>
                    <th className="pb-3 text-left font-bold text-gray-400 text-xs uppercase tracking-wider">Godzina</th>
                    <th className="pb-3 text-left font-bold text-gray-400 text-xs uppercase tracking-wider">Klient</th>
                    <th className="pb-3 text-left font-bold text-gray-400 text-xs uppercase tracking-wider">Telefon</th>
                    <th className="pb-3 text-left font-bold text-gray-400 text-xs uppercase tracking-wider">Usługa</th>
                    <th className="pb-3 text-left font-bold text-gray-400 text-xs uppercase tracking-wider">Pracownik</th>
                    <th className="pb-3 text-left font-bold text-gray-400 text-xs uppercase tracking-wider">Czas</th>
                    <th className="pb-3 text-left font-bold text-gray-400 text-xs uppercase tracking-wider">Cena</th>
                    <th className="pb-3 text-left font-bold text-gray-400 text-xs uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedRows.map((row, i) => {
                    const hasError = !row.employeeId || !row.serviceId
                    return (
                      <tr
                        key={i}
                        className={cn(
                          "border-b border-gray-50 transition-colors",
                          hasError ? "bg-amber-50/50" : "hover:bg-gray-50/50"
                        )}
                      >
                        <td className="py-3 pr-3 text-gray-400 font-mono text-xs">{i + 1}</td>
                        <td className="py-3 pr-3 font-medium">{row.data}</td>
                        <td className="py-3 pr-3 font-medium">{row.godzina}</td>
                        <td className="py-3 pr-3">
                          <div className="flex items-center gap-1.5">
                            <User className="h-3.5 w-3.5 text-gray-400" />
                            <span className="font-medium">{row.klient_imie}</span>
                          </div>
                        </td>
                        <td className="py-3 pr-3 text-gray-500 font-mono text-xs">{row.klient_telefon}</td>
                        <td className="py-3 pr-3">
                          {row.serviceId ? (
                            <span className="text-emerald-700 font-semibold">{row.usluga}</span>
                          ) : (
                            <div className="space-y-1">
                              <div className="flex items-center gap-1 text-amber-600 text-xs font-bold">
                                <AlertTriangle className="h-3 w-3" />
                                {row.usluga || '(puste)'}
                              </div>
                              <select
                                className="w-full text-xs border border-amber-200 rounded-lg px-2 py-1 bg-white"
                                value=""
                                onChange={(e) => updateRowService(i, e.target.value)}
                              >
                                <option value="">Wybierz usługę...</option>
                                {flatServices.map(s => (
                                  <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                              </select>
                            </div>
                          )}
                        </td>
                        <td className="py-3 pr-3">
                          {row.employeeId ? (
                            <span className="text-emerald-700 font-semibold">{row.pracownik}</span>
                          ) : (
                            <div className="space-y-1">
                              <div className="flex items-center gap-1 text-amber-600 text-xs font-bold">
                                <AlertTriangle className="h-3 w-3" />
                                {row.pracownik || '(puste)'}
                              </div>
                              <select
                                className="w-full text-xs border border-amber-200 rounded-lg px-2 py-1 bg-white"
                                value=""
                                onChange={(e) => updateRowEmployee(i, e.target.value)}
                              >
                                <option value="">Wybierz pracownika...</option>
                                {employees?.map(emp => (
                                  <option key={emp.id} value={emp.id}>
                                    {emp.first_name} {emp.last_name || ''}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                        </td>
                        <td className="py-3 pr-3 text-gray-600">{row.czas_min} min</td>
                        <td className="py-3 pr-3 font-bold">{row.cena} zł</td>
                        <td className="py-3">
                          <Badge variant="outline" className="text-xs">
                            {BOOKING_STATUS_LABELS[STATUS_MAP[row.status.toLowerCase()] || 'completed'] || row.status}
                          </Badge>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Step 2: Results */}
      {step === 2 && importResult && (
        <div className="space-y-6">
          <Card className="p-8 glass border-none shadow-xl text-center">
            <div className="mx-auto mb-6">
              {importResult.imported > 0 ? (
                <div className="h-20 w-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="h-10 w-10 text-emerald-600" />
                </div>
              ) : (
                <div className="h-20 w-20 rounded-full bg-rose-100 flex items-center justify-center mx-auto">
                  <XCircle className="h-10 w-10 text-rose-600" />
                </div>
              )}
            </div>

            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              {importResult.imported > 0 ? 'Import zakończony!' : 'Import nieudany'}
            </h2>

            <div className="flex items-center justify-center gap-6 mt-6 mb-8">
              <div className="text-center">
                <p className="text-3xl font-black text-emerald-600">{importResult.imported}</p>
                <p className="text-sm font-bold text-gray-400 uppercase tracking-wider">Zaimportowane</p>
              </div>
              <div className="h-12 w-px bg-gray-200" />
              <div className="text-center">
                <p className="text-3xl font-black text-amber-600">{importResult.skipped}</p>
                <p className="text-sm font-bold text-gray-400 uppercase tracking-wider">Pominięte</p>
              </div>
            </div>

            {importResult.errors.length > 0 && (
              <div className="text-left max-w-lg mx-auto mb-8">
                <h3 className="font-bold text-gray-700 mb-3">Błędy:</h3>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {importResult.errors.map((err, i) => (
                    <div key={i} className="flex gap-2 text-sm">
                      <span className="text-gray-400 font-mono shrink-0">Wiersz {err.row}:</span>
                      <span className="text-rose-600">{err.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Button
              onClick={reset}
              className="gradient-button rounded-xl font-bold px-8"
            >
              Importuj kolejny plik
            </Button>
          </Card>
        </div>
      )}
        </TabsContent>

        <TabsContent value="services" className="space-y-6">
          {servicesStep === 0 && (
            <div className="space-y-6">
              <Card className="p-8 glass border-none shadow-xl">
                <div className="flex flex-col sm:flex-row items-start gap-6 mb-8">
                  <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                    <FileSpreadsheet className="h-7 w-7" />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-xl font-bold text-foreground">Import usług z CSV</h2>
                    <p className="text-muted-foreground">
                      Zaimportuj listę usług z pliku CSV. Pobierz szablon, wypełnij go danymi i wgraj tutaj.
                    </p>
                    <a href="/templates/services-import-template.csv" download className="inline-flex items-center gap-2 text-primary font-bold hover:underline">
                      <Download className="h-4 w-4" />
                      Pobierz szablon CSV
                    </a>
                  </div>
                </div>
                <div
                  className="border-2 border-dashed border-gray-200 rounded-2xl p-12 text-center hover:border-primary/50 hover:bg-primary/5 transition-all cursor-pointer"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleServicesFileSelect(f) }}
                  onClick={() => servicesFileInputRef.current?.click()}
                >
                  <input ref={servicesFileInputRef} type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleServicesFileSelect(f) }} />
                  <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-lg font-bold text-foreground mb-1">Przeciągnij plik CSV lub kliknij, aby wybrać</p>
                  <p className="text-sm text-muted-foreground">Kolumny: kategoria, podkategoria, nazwa, czas_min, cena</p>
                </div>
              </Card>
              <Card className="p-6 glass border-none shadow-sm">
                <h3 className="font-bold text-foreground mb-3">Wymagane kolumny</h3>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {["kategoria", "podkategoria", "nazwa", "czas_min", "cena"].map(col => (
                    <Badge key={col} variant="outline" className="px-3 py-1.5 text-sm font-mono justify-center">{col}</Badge>
                  ))}
                </div>
                <p className="text-sm text-gray-400 mt-3">Opcjonalne: <span className="font-mono">aktywna</span> (1/0, domyślnie 1)</p>
              </Card>
            </div>
          )}
          {servicesStep === 1 && (
            <Card className="p-6 glass border-none shadow-xl">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Podgląd: {servicesFileName}</h2>
                  <p className="text-sm text-gray-500 mt-1">{parsedServiceRows.length} usług do importu</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={resetServices} className="rounded-xl font-bold" disabled={isImportingServices}>
                    <ArrowLeft className="h-4 w-4 mr-1" />Wróć
                  </Button>
                  <Button onClick={handleServicesImport} disabled={parsedServiceRows.length === 0 || isImportingServices} className="gradient-button rounded-xl font-bold">
                    {isImportingServices ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                    {isImportingServices ? "Importowanie..." : `Importuj ${parsedServiceRows.length} usług`}
                  </Button>
                </div>
              </div>
              <div className="overflow-x-auto -mx-6 px-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="pb-3 text-left font-bold text-gray-400 text-xs uppercase tracking-wider">#</th>
                      <th className="pb-3 text-left font-bold text-gray-400 text-xs uppercase tracking-wider">Kategoria</th>
                      <th className="pb-3 text-left font-bold text-gray-400 text-xs uppercase tracking-wider">Podkategoria</th>
                      <th className="pb-3 text-left font-bold text-gray-400 text-xs uppercase tracking-wider">Nazwa</th>
                      <th className="pb-3 text-left font-bold text-gray-400 text-xs uppercase tracking-wider">Czas</th>
                      <th className="pb-3 text-left font-bold text-gray-400 text-xs uppercase tracking-wider">Cena</th>
                      <th className="pb-3 text-left font-bold text-gray-400 text-xs uppercase tracking-wider">Aktywna</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedServiceRows.map((row, i) => (
                      <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50">
                        <td className="py-3 pr-3 text-gray-400 font-mono text-xs">{i + 1}</td>
                        <td className="py-3 pr-3 text-gray-600">{row.kategoria}</td>
                        <td className="py-3 pr-3 text-gray-600">{row.podkategoria}</td>
                        <td className="py-3 pr-3 font-medium">{row.nazwa}</td>
                        <td className="py-3 pr-3 text-gray-600">{row.czas_min} min</td>
                        <td className="py-3 pr-3 font-bold">{row.cena} zl</td>
                        <td className="py-3">
                          <Badge variant={row.aktywna === "0" || row.aktywna?.toLowerCase() === "nie" ? "outline" : "secondary"} className="text-xs">
                            {row.aktywna === "0" || row.aktywna?.toLowerCase() === "nie" ? "Nie" : "Tak"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
          {servicesStep === 2 && servicesImportResult && (
            <Card className="p-8 glass border-none shadow-xl text-center">
              <div className="mx-auto mb-6">
                {servicesImportResult.imported > 0 ? (
                  <div className="h-20 w-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="h-10 w-10 text-emerald-600" />
                  </div>
                ) : (
                  <div className="h-20 w-20 rounded-full bg-rose-100 flex items-center justify-center mx-auto">
                    <XCircle className="h-10 w-10 text-rose-600" />
                  </div>
                )}
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                {servicesImportResult.imported > 0 ? "Import zakończony!" : "Import nieudany"}
              </h2>
              <div className="flex items-center justify-center gap-6 mt-6 mb-8">
                <div className="text-center">
                  <p className="text-3xl font-black text-emerald-600">{servicesImportResult.imported}</p>
                  <p className="text-sm font-bold text-gray-400 uppercase tracking-wider">Zaimportowane</p>
                </div>
                {servicesImportResult.skipped > 0 && (
                  <>
                    <div className="h-12 w-px bg-gray-200" />
                    <div className="text-center">
                      <p className="text-3xl font-black text-amber-500">{servicesImportResult.skipped}</p>
                      <p className="text-sm font-bold text-gray-400 uppercase tracking-wider">Pominięte (duplikaty)</p>
                    </div>
                  </>
                )}
                {servicesImportResult.errors.length > 0 && (
                  <>
                    <div className="h-12 w-px bg-gray-200" />
                    <div className="text-center">
                      <p className="text-3xl font-black text-rose-600">{servicesImportResult.errors.length}</p>
                      <p className="text-sm font-bold text-gray-400 uppercase tracking-wider">Błędy</p>
                    </div>
                  </>
                )}
              </div>
              {servicesImportResult.errors.length > 0 && (
                <div className="text-left max-w-lg mx-auto mb-8">
                  <h3 className="font-bold text-gray-700 mb-3">Błędy:</h3>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {servicesImportResult.errors.map((err, i) => (
                      <div key={i} className="flex gap-2 text-sm">
                        <span className="text-gray-400 font-mono shrink-0">Wiersz {err.row}:</span>
                        <span className="text-rose-600">{err.reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <Button onClick={resetServices} className="gradient-button rounded-xl font-bold px-8">Importuj kolejny plik</Button>
            </Card>
          )}
        </TabsContent>
        <TabsContent value="forms" className="space-y-6"> 
          {formImportResult ? (
            <Card className="p-8 glass border-none shadow-xl">
              <div className="flex items-start gap-4">
                <div className="h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                </div>
                <div className="space-y-2 flex-1">
                  <h3 className="text-xl font-bold text-foreground">Wynik importu formularzy</h3>
                  <p className="text-muted-foreground">
                    Zaimportowano: <span className="font-bold text-foreground">{formImportResult.imported}</span>
                  </p>
                  {formImportResult.errors.length > 0 && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
                      <p className="text-sm font-semibold text-rose-700 mb-2">Błędy:</p>
                      <ul className="space-y-1 text-sm text-rose-700">
                        {formImportResult.errors.map((error, index) => (
                          <li key={index}>{error}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <Button className="mt-2 rounded-xl font-bold" onClick={() => setFormImportResult(null)}>
                    Importuj kolejne
                  </Button>
                </div>
              </div>
            </Card>
          ) : (
            <>
              <Card className="p-8 glass border-none shadow-xl space-y-6">
                <div>
                  <h2 className="text-xl font-bold text-foreground">Import z pliku JSON</h2>
                  <p className="text-muted-foreground mt-1">
                    Wgraj eksport szablonów formularzy.
                  </p>
                </div>

                <div
                  className="border-2 border-dashed border-gray-200 rounded-2xl p-10 text-center hover:border-primary/50 hover:bg-primary/5 transition-all cursor-pointer"
                  onClick={() => formImportFileRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={async (e) => {
                    e.preventDefault()
                    const file = e.dataTransfer.files?.[0]
                    if (!file) return

                    setIsImportingForms(true)
                    try {
                      await importFormsFromFile(file)
                    } catch (error) {
                      const message = error instanceof Error ? error.message : 'Nie udało się zaimportować pliku JSON'
                      toast.error(message)
                      setFormImportResult({ imported: 0, errors: [message] })
                    } finally {
                      setIsImportingForms(false)
                      if (formImportFileRef.current) {
                        formImportFileRef.current.value = ''
                      }
                    }
                  }}
                >
                  <input
                    ref={formImportFileRef}
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={handleFormsBulkImport}
                  />
                  <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-lg font-bold text-foreground mb-1">
                    Przeciągnij plik JSON lub kliknij
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Obsługuje tablicę szablonów lub pojedynczy szablon
                  </p>
                </div>

                <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
                  <p className="font-semibold mb-2">Wymagana struktura JSON:</p>
                  <p>
                    Tablica obiektów z polami: <span className="font-mono">name</span> (string), <span className="font-mono">fields</span> (array), <span className="font-mono">requires_signature</span> (boolean), <span className="font-mono">gdpr_consent_text</span> (string, opcjonalnie).
                  </p>
                </div>
              </Card>

              <Card className="p-8 glass border-none shadow-xl space-y-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-foreground">Biblioteka szablonów</h2>
                    <p className="text-muted-foreground mt-1">Wybierz gotowe formularze do szybkiego dodania.</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setSelectedBuiltins(new Set(BUILTIN_TEMPLATES.map(template => template.name)))}
                    >
                      Zaznacz wszystkie
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setSelectedBuiltins(new Set())}
                    >
                      Odznacz wszystkie
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {BUILTIN_TEMPLATES.map((template) => (
                    <Card key={template.name} className="p-5 border border-gray-200 relative">
                      <div className="absolute top-4 right-4">
                        <Checkbox
                          checked={selectedBuiltins.has(template.name)}
                          onCheckedChange={(checked) => {
                            setSelectedBuiltins(prev => {
                              const next = new Set(prev)
                              if (checked === true) {
                                next.add(template.name)
                              } else {
                                next.delete(template.name)
                              }
                              return next
                            })
                          }}
                        />
                      </div>
                      <div className="space-y-2 pr-8">
                        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                          <span>{template.name}</span>
                          <SensitiveDataBadge dataCategory={template.data_category} />
                        </CardTitle>
                        <CardDescription>{template.description}</CardDescription>
                        <Badge variant="secondary">{template.fields.length} pól</Badge>
                      </div>
                    </Card>
                  ))}
                </div>

                <div className="flex justify-end">
                  <Button
                    onClick={handleBuiltinsImport}
                    disabled={!selectedBuiltins.size || isImportingForms}
                    className="rounded-xl font-bold"
                  >
                    {isImportingForms ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    Dodaj zaznaczone ({selectedBuiltins.size})
                  </Button>
                </div>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="treatment-cards">
          <TreatmentCardImportReview />
        </TabsContent>
      </Tabs>
    </div>
  )
}

