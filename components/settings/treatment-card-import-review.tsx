'use client'

import React from 'react'
import type { DataCategory, ImportArtifact, ImportFormTemplate } from '@/lib/forms/import-types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
// ScrollArea, Separator, Alert — inline implementations (shadcn components not installed)
function ScrollArea({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={`overflow-y-auto ${className ?? ''}`}>{children}</div>
}
function Separator() {
  return <hr className="border-t border-gray-200 my-2" />
}
type AlertVariant = 'default' | 'destructive'
function Alert({ variant = 'default', children, className }: { variant?: AlertVariant; children: React.ReactNode; className?: string }) {
  const base = 'flex flex-col gap-1 rounded-lg border p-4 text-sm'
  const variantClass = variant === 'destructive'
    ? 'border-red-200 bg-red-50 text-red-800'
    : 'border-amber-200 bg-amber-50 text-amber-800'
  return <div className={`${base} ${variantClass} ${className ?? ''}`}>{children}</div>
}
function AlertTitle({ children }: { children: React.ReactNode }) {
  return <p className="font-semibold">{children}</p>
}
function AlertDescription({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>
}
import { Input } from '@/components/ui/input'
import { Loader2, CheckCircle2, XCircle, AlertTriangle, ShieldAlert, ChevronDown, ChevronUp, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { useState, useEffect, useCallback } from 'react'

type ReportFile = {
  slug: string
  file: string
  displayName?: string
  status: 'approved' | 'rejected' | 'review_required'
  confidence: number | 'high' | 'medium' | 'low'
  dataCategory: DataCategory
  warningCount: number
  potentialHealthSensitiveFieldCount: number
  healthFieldCount: number
  sensitiveFieldCount: number
}
type Report = {
  total: number
  success: number
  review_required: number
  failed: number
  files: ReportFile[]
}

export function TreatmentCardImportReview(): JSX.Element {
  const [report, setReport] = useState<Report | null>(null)
  const [isLoadingReport, setIsLoadingReport] = useState<boolean>(true)
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)
  const [artifact, setArtifact] = useState<ImportArtifact | null>(null)
  const [isLoadingArtifact, setIsLoadingArtifact] = useState<boolean>(false)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [importedSlugs, setImportedSlugs] = useState<Set<string>>(new Set())
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({})
  const [isImporting, setIsImporting] = useState<boolean>(false)
  const [importSuccess, setImportSuccess] = useState<boolean>(false)
  const [gdprExpanded, setGdprExpanded] = useState<boolean>(false)

  useEffect(() => {
    const fetchReport = async () => {
      try {
        setIsLoadingReport(true)
        const res = await fetch('/api/forms/import-artifacts')
        if (!res.ok) throw new Error('Failed to fetch report')
        const data = await res.json()
        setReport(data.report)
      } catch (error) {
        toast.error('Nie udało się wczytać raportu importu.')
        console.error(error)
      } finally {
        setIsLoadingReport(false)
      }
    }
    fetchReport()
  }, [])

  useEffect(() => {
    if (!selectedSlug) {
      setArtifact(null)
      return
    }

    setImportSuccess(false)
    setCheckedItems({})
    setGdprExpanded(false)

    const fetchArtifact = async () => {
      setIsLoadingArtifact(true)
      try {
        const res = await fetch(`/api/forms/import-artifacts/${selectedSlug}`)
        if (!res.ok) throw new Error(`Failed to fetch artifact: ${res.statusText}`)
        const data = await res.json()
        setArtifact(data.artifact)
      } catch (error) {
        toast.error('Nie udało się wczytać szczegółów karty.')
        console.error(error)
      } finally {
        setIsLoadingArtifact(false)
      }
    }

    fetchArtifact()
  }, [selectedSlug])

  const handleImport = async () => {
    if (!artifact) return

    setIsImporting(true)
    try {
      const templateToImport: Omit<ImportFormTemplate, 'fields'> & { fields: Omit<ImportFormTemplate['fields'][0], 'isHealthField' | 'isSensitiveField' | 'blockImport'>[] } = {
        name: artifact.templateDraft.name,
        description: artifact.templateDraft.description,
        data_category: artifact.templateDraft.data_category,
        requires_signature: artifact.templateDraft.requires_signature,
        gdpr_consent_text: artifact.templateDraft.gdpr_consent_text,
        fields: artifact.templateDraft.fields.map(({ isHealthField, isSensitiveField, blockImport, ...rest }) => rest),
      }

      const res = await fetch('/api/forms/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(templateToImport),
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || 'Błąd importu szablonu')
      }

      toast.success('Szablon został pomyślnie zaimportowany.')
      setImportedSlugs(prev => new Set(prev).add(selectedSlug!))
      setImportSuccess(true)
      setCheckedItems({})
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setIsImporting(false)
    }
  }

  const filteredFiles = report?.files.filter(file => (file.displayName ?? file.file).toLowerCase().includes(searchQuery.toLowerCase())) ?? []

  const getConfidenceText = (confidence: number | 'high' | 'medium' | 'low') => {
    const isHigh = confidence === 'high' || (typeof confidence === 'number' && confidence > 0.8)
    const isMedium = confidence === 'medium' || (typeof confidence === 'number' && confidence > 0.5)
    if (isHigh) return <span className="text-green-600">Wysoka</span>
    if (isMedium) return <span className="text-amber-600">Średnia</span>
    return <span className="text-red-600">Niska</span>
  }
  
  const getDataCategoryBadge = (category: DataCategory) => {
    switch (category) {
      case 'health': return <Badge className="bg-amber-100 text-amber-800">Zdrowotne</Badge>
      case 'sensitive_health': return <Badge className="bg-red-100 text-red-800">Wrażliwe zdrowotne</Badge>
      default: return <Badge variant="secondary">Ogólne</Badge>
    }
  }
  
  let checkboxesToRender: {id: string, label: string}[] = [];
  if (artifact && artifact.approved && !importSuccess) {
    if (artifact.compliance.healthFieldCount > 0) {
      checkboxesToRender.push({ id: 'chk-health', label: 'Przejrzałem/am pytania zdrowotne i akceptuję ich zakres' });
    }
    if (artifact.compliance.requiresHealthConsent) {
      checkboxesToRender.push({ id: 'chk-gdpr', label: 'Akceptuję tekst zgody zdrowotnej RODO' });
    }
    if (artifact.templateDraft.data_category !== 'general') {
      checkboxesToRender.push({ id: 'chk-category', label: `Potwierdzam kategorię danych: ${artifact.templateDraft.data_category}` });
    }
    if (artifact.mapping.needsManualReview) {
      checkboxesToRender.push({ id: 'chk-mapping', label: 'Potwierdzam zakres przypisania do usług (wymaga ręcznej weryfikacji)' });
    }
    checkboxesToRender.push({ id: 'chk-confirm', label: 'Potwierdzam import szablonu do systemu formularzy' });
  }

  const allCheckboxesChecked = checkboxesToRender.length > 0 && checkboxesToRender.every(chk => checkedItems[chk.id]);

  return (
    <div className="flex space-x-4 h-[calc(100vh-240px)]">
      <div className="w-1/3 flex flex-col border rounded-lg p-2">
        {isLoadingReport ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : report ? (
          <>
            <div className="flex items-center space-x-2 p-2">
              <Badge variant="outline">Wszystkie: {report.total}</Badge>
              <Badge variant="destructive">Do przeglądu: {report.review_required}</Badge>
               <Input
                placeholder="Szukaj karty..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="h-8"
              />
            </div>
            <Separator />
            <ScrollArea className="flex-grow">
              <div className="p-2 space-y-2">
                {filteredFiles.map(file => (
                  <div
                    key={file.slug}
                    onClick={() => setSelectedSlug(file.slug)}
                    className={`p-3 rounded-lg cursor-pointer border ${selectedSlug === file.slug ? 'border-2 border-blue-500 bg-blue-50' : 'hover:bg-gray-50'}`}
                  >
                    <div className="flex justify-between items-start">
                      <p className="text-sm font-medium line-clamp-2 flex-1 pr-2">{file.displayName ?? file.file}</p>
                      <div className="flex-shrink-0">
                        {file.status === 'approved' ? <CheckCircle2 className="h-5 w-5 text-green-500" /> :
                         file.status === 'rejected' ? <XCircle className="h-5 w-5 text-red-500" /> :
                         <AlertTriangle className="h-5 w-5 text-amber-500" />}
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground mt-2">
                      <div className="flex items-center gap-2">
                        {getDataCategoryBadge(file.dataCategory)}
                        {file.warningCount > 0 && (
                          <Badge className="bg-orange-100 text-orange-800">{file.warningCount} ostrzeżeń</Badge>
                        )}
                         {importedSlugs.has(file.slug) && <Badge variant="default" className="bg-green-600">Zaimportowany</Badge>}
                      </div>
                      <div className="text-xs">
                        Zgodność: {getConfidenceText(file.confidence)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </>
        ) : (
          <div className="text-center p-4 text-muted-foreground">Nie znaleziono raportu.</div>
        )}
      </div>

      <div className="w-2/3 border rounded-lg overflow-y-auto p-4">
        {!selectedSlug ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <FileText className="h-12 w-12 mb-4" />
            <p>Wybierz kartę z listy po lewej stronie, aby zobaczyć szczegóły.</p>
          </div>
        ) : isLoadingArtifact ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
          </div>
        ) : artifact ? (
          <div className="space-y-6">
            {/* Section 1: Header */}
            <div className="pb-4 border-b">
              <div className="flex items-center space-x-3">
                 <h2 className="text-xl font-semibold">{artifact.templateDraft.name}</h2>
                 {getDataCategoryBadge(artifact.compliance.dataCategory)}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Język: {artifact.source.language} | Kategoria: {artifact.source.category}
              </p>
               <p className="text-sm text-muted-foreground">Plik źródłowy: {artifact.source.preferredFile ?? 'brak'}</p>
            </div>
            
            {/* Section 2: Compliance Card */}
            <Card>
              <CardHeader>
                <CardTitle>Zgodność i dane</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                 <div className="flex items-center space-x-4">
                    {getDataCategoryBadge(artifact.compliance.dataCategory)}
                    <p className="text-sm">Pola zdrowotne: <strong>{artifact.compliance.healthFieldCount}</strong></p>
                    <p className="text-sm">Pola wrażliwe: <strong>{artifact.compliance.sensitiveFieldCount}</strong></p>
                    {artifact.compliance.requiresHealthConsent ? 
                        <Badge className="bg-green-100 text-green-800">Wymaga zgody zdrowotnej</Badge> : 
                        <Badge variant="secondary">Brak zgody zdrowotnej</Badge>
                    }
                 </div>
                 {artifact.compliance.reviewNotes.length > 0 && (
                    <Alert>
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>Uwagi do przeglądu</AlertTitle>
                        <AlertDescription>
                            <ul className="list-disc list-inside">
                                {artifact.compliance.reviewNotes.map((note, i) => <li key={i}>{note}</li>)}
                            </ul>
                        </AlertDescription>
                    </Alert>
                 )}
              </CardContent>
            </Card>

            {/* Section 3: Fields Preview */}
            <div>
              <h3 className="text-lg font-semibold mb-2">Podgląd pól formularza ({artifact.templateDraft.fields.length} pól)</h3>
              <ScrollArea className="h-[300px] border rounded-md p-2">
                {artifact.templateDraft.fields.map(field => (
                  <div key={field.id} className={`p-2 rounded mb-1 ${field.isSensitiveField ? 'border-l-4 border-red-400 bg-red-50 pl-3' : field.isHealthField ? 'border-l-4 border-amber-400 bg-amber-50 pl-3' : 'border-l-4 border-transparent pl-3'}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{field.label}{field.required && <span className="text-red-500 text-xs ml-1">*</span>}</span>
                      <Badge variant="outline" className="text-xs">{field.type}</Badge>
                    </div>
                  </div>
                ))}
              </ScrollArea>
            </div>

            {/* Section 4: GDPR Consent */}
            {artifact.templateDraft.gdpr_consent_text && (
              <div>
                <Button variant="ghost" onClick={() => setGdprExpanded(!gdprExpanded)} className="w-full justify-between">
                  Tekst zgody RODO
                  {gdprExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
                {gdprExpanded && (
                  <Card className="mt-2">
                    <CardContent className="p-4">
                      <p className="text-sm text-muted-foreground">{artifact.templateDraft.gdpr_consent_text}</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
            
            {/* Section 5: Mapping */}
            <Card>
                <CardHeader><CardTitle>Mapowanie do usług</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                    <p className="text-sm">Sugerowane dopasowania: <span className="font-mono bg-gray-100 p-1 rounded text-xs">{artifact.mapping.serviceMatchers.join(', ')}</span></p>
                    <p className="text-sm">Pewność dopasowania: <strong>{Math.round(artifact.mapping.confidence * 100)}%</strong></p>
                    {artifact.mapping.needsManualReview && (
                        <Alert variant="destructive">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle>Wymaga ręcznej weryfikacji przypisania do usług.</AlertTitle>
                        </Alert>
                    )}
                </CardContent>
            </Card>

            {/* Section 6: Import Gate */}
            <div>
              {artifact.rejected === true ? (
                <Alert variant="destructive">
                  <ShieldAlert className="h-4 w-4" />
                  <AlertTitle>Karta odrzucona — import zablokowany</AlertTitle>
                  <AlertDescription>Ten szablon został odrzucony i nie może zostać zaimportowany.</AlertDescription>
                </Alert>
              ) : artifact.approved !== true ? (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Karta oczekuje na przegląd — import zablokowany</AlertTitle>
                  <AlertDescription>Import będzie możliwy po zatwierdzeniu przez dział compliance.</AlertDescription>
                </Alert>
              ) : importSuccess ? (
                <Card className="bg-green-50 border-green-200">
                  <CardContent className="p-6 flex items-center justify-center space-x-3">
                    <CheckCircle2 className="h-8 w-8 text-green-600" />
                    <p className="text-green-800 font-medium">Szablon został pomyślnie zapisany w systemie formularzy.</p>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardHeader><CardTitle>Potwierdzenie importu</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    {checkboxesToRender.map(chk => (
                      <div key={chk.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={chk.id}
                          checked={!!checkedItems[chk.id]}
                          onCheckedChange={(checked) => setCheckedItems(prev => ({ ...prev, [chk.id]: !!checked }))}
                        />
                        <Label htmlFor={chk.id} className="text-sm font-normal">{chk.label}</Label>
                      </div>
                    ))}
                  </CardContent>
                  <CardFooter>
                    <Button onClick={handleImport} disabled={!allCheckboxesChecked || isImporting} className="w-full">
                      {isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Importuj szablon'}
                    </Button>
                  </CardFooter>
                </Card>
              )}
            </div>

          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-red-500">
            <XCircle className="h-12 w-12 mb-4" />
            <p>Nie udało się wczytać danych dla wybranej karty.</p>
          </div>
        )}
      </div>
    </div>
  )
}
