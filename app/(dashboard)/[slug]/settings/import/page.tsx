'use client'

import { useState, useMemo, useCallback, useRef } from 'react'
import { useEmployees } from '@/hooks/use-employees'
import { useServices } from '@/hooks/use-services'
import { useImportBookings } from '@/hooks/use-import-bookings'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
  Briefcase,
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { toast } from 'sonner'
import { BOOKING_STATUS_LABELS } from '@/lib/constants'

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
const STATUS_MAP: Record<string, string> = {
  'completed': 'completed',
  'zakończona': 'completed',
  'zakonczona': 'completed',
  'scheduled': 'scheduled',
  'zaplanowana': 'scheduled',
  'confirmed': 'confirmed',
  'potwierdzona': 'confirmed',
  'cancelled': 'cancelled',
  'anulowana': 'cancelled',
  'pending': 'pending',
  'oczekująca': 'pending',
  'oczekujaca': 'pending',
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
  const [importResult, setImportResult] = useState<{
    imported: number
    skipped: number
    errors: Array<{ row: number; reason: string }>
  } | null>(null)

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

    try {
      const result = await importMutation.mutateAsync(rows)
      setImportResult(result)
      setStep(2)
    } catch {
      // error handled by mutation
    }
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
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Import rezerwacji</h1>
        <p className="text-muted-foreground text-base font-medium">
          Migruj dane z innych systemów do SimpliSalon
        </p>
      </div>

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
                <Button variant="outline" onClick={reset} className="rounded-xl font-bold">
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Wróć
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={readyRows.length === 0 || importMutation.isPending}
                  className="gradient-button rounded-xl font-bold"
                >
                  {importMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4 mr-2" />
                  )}
                  Importuj {readyRows.length} rezerwacji
                </Button>
              </div>
            </div>

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
    </div>
  )
}
