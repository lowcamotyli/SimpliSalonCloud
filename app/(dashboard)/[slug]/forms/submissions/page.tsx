'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { SubmissionViewDialog } from '@/components/forms/submission-view-dialog'
import {
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  Loader2,
  User,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

type SubmissionRow = {
  id: string
  submitted_at: string | null
  signed_at: string | null
  form_template_id: string
  client_id: string
  booking_id: string | null
  form_templates: { name: string } | null
  clients: { full_name: string | null } | null
  source: 'client_form' | 'pre_appointment'
}

function getRelation<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null
  }

  return value
}

function formatSubmittedAt(value: string | null) {
  if (!value) {
    return 'Brak daty'
  }

  return new Date(value).toLocaleString('pl-PL', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export default function FormSubmissionsPage() {
  const params = useParams<{ slug: string }>()
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [viewingSubmission, setViewingSubmission] = useState<SubmissionRow | null>(null)
  const salonSlug = Array.isArray(params?.slug) ? params.slug[0] : params?.slug ?? ''

  useEffect(() => {
    const slug = Array.isArray(params?.slug) ? params.slug[0] : params?.slug

    if (!slug) {
      setIsLoading(false)
      return
    }

    const supabase = createClient()
    let isMounted = true

    const fetchSubmissions = async () => {
      setIsLoading(true)

      const [clientFormsResult, preAppResult] = await Promise.all([
        supabase
          .from('client_forms')
          .select('id, submitted_at, signed_at, form_template_id, client_id, booking_id, form_templates(name), clients(full_name)')
          .not('submitted_at', 'is', null)
          .order('submitted_at', { ascending: false })
          .limit(50),
        supabase
          .from('pre_appointment_responses')
          .select('id, submitted_at, client_id, booking_id, form_template_id, clients(full_name)')
          .not('submitted_at', 'is', null)
          .order('submitted_at', { ascending: false })
          .limit(50),
      ])

      if (clientFormsResult.error || preAppResult.error) {
        toast.error('Nie udało się pobrać formularzy')
        if (isMounted) {
          setSubmissions([])
          setIsLoading(false)
        }
        return
      }

      // Fetch template names for pre_appointment_responses (TEXT field, no FK)
      const preAppRaw = preAppResult.data ?? []
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      const templateIds = [...new Set(preAppRaw.map((r: any) => r.form_template_id).filter((id: string) => uuidRegex.test(id)))]
      const templateNameMap = new Map<string, string>()
      if (templateIds.length > 0) {
        const { data: tplRows } = await supabase
          .from('form_templates')
          .select('id, name')
          .in('id', templateIds)
        for (const t of tplRows ?? []) templateNameMap.set(t.id, t.name)
      }

      const clientForms: SubmissionRow[] = (clientFormsResult.data ?? []).map(
        (r: any) => ({ ...r, signed_at: r.signed_at ?? null, source: 'client_form' as const })
      )

      const preAppForms: SubmissionRow[] = preAppRaw.map(
        (r: any) => ({
          ...r,
          signed_at: null,
          source: 'pre_appointment' as const,
          form_templates: { name: templateNameMap.get(r.form_template_id) ?? 'Formularz przed wizytą' },
        })
      )

      const merged = [...clientForms, ...preAppForms].sort((a, b) => {
        if (!a.submitted_at) return 1
        if (!b.submitted_at) return -1
        return new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()
      })

      if (isMounted) {
        setSubmissions(merged.slice(0, 50))
        setIsLoading(false)
      }
    }

    void fetchSubmissions()

    return () => {
      isMounted = false
    }
  }, [params?.slug])

  const filteredSubmissions = submissions.filter((submission) => {
    const client = getRelation(submission.clients)
    const formTemplate = getRelation(submission.form_templates)
    const clientName = client?.full_name?.trim() || 'Nieznany klient'
    const formName = formTemplate?.name ?? 'Bez nazwy formularza'
    const query = search.trim().toLowerCase()

    if (!query) {
      return true
    }

    return (
      clientName.toLowerCase().includes(query) ||
      formName.toLowerCase().includes(query)
    )
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">
            Wypełnione formularze
          </h1>
          <p className="text-muted-foreground">
            Formularze przesłane przez klientów
          </p>
        </div>

        <div className="w-full md:max-w-sm">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Szukaj po kliencie lub formularzu"
          />
        </div>
      </div>

      <Card className="border-border bg-card shadow-sm">
        <CardHeader className="border-b">
          <CardTitle>Ostatnie zgłoszenia</CardTitle>
          <CardDescription>
            Lista ostatnich 50 formularzy z datą przesłania.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex min-h-[240px] items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredSubmissions.length === 0 ? (
            <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 text-center">
              <FileText className="h-10 w-10 text-muted-foreground" />
              <div className="space-y-1">
                <p className="font-medium">Brak wypełnionych formularzy</p>
                <p className="text-sm text-muted-foreground">
                  Gdy klienci prześlą formularze, pojawią się tutaj.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredSubmissions.map((submission) => {
                const client = getRelation(submission.clients)
                const formTemplate = getRelation(submission.form_templates)
                const clientName = client?.full_name?.trim() || 'Nieznany klient'
                const formName = formTemplate?.name ?? 'Bez nazwy formularza'

                return (
                  <Card key={submission.id} className="border-border/70 bg-background shadow-sm transition-shadow hover:shadow-md">
                    <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="flex items-center gap-2 text-base font-semibold">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <span>{clientName}</span>
                          </div>
                          {submission.source === 'pre_appointment' ? (
                            <Badge variant="outline" className="border-blue-400 text-blue-600 bg-blue-50">Przed wizytą</Badge>
                          ) : (
                            <Badge variant={submission.signed_at ? 'success' : 'secondary'}>
                              {submission.signed_at ? 'Podpisany' : 'Bez podpisu'}
                            </Badge>
                          )}
                        </div>

                        <div className="flex flex-col gap-2 text-sm text-muted-foreground md:flex-row md:items-center md:gap-4">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4" />
                            <span>{formName}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4" />
                            <span>{formatSubmittedAt(submission.submitted_at)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {submission.signed_at ? (
                          <div className="flex items-center gap-2 text-sm text-green-700">
                            <CheckCircle2 className="h-4 w-4" />
                            <span>Podpis złożony</span>
                          </div>
                        ) : null}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setViewingSubmission(submission)}
                        >
                          <Eye className="mr-2 h-4 w-4" />
                          Zobacz
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
      <SubmissionViewDialog
        submission={viewingSubmission}
        slug={salonSlug}
        open={!!viewingSubmission}
        onOpenChange={(open) => { if (!open) setViewingSubmission(null) }}
      />
    </div>
  )
}
