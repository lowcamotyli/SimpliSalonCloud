'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
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

      const { data, error } = await supabase
        .from('client_forms')
        .select(
          'id, submitted_at, signed_at, form_template_id, client_id, booking_id, form_templates(name), clients(full_name)'
        )
        .not('submitted_at', 'is', null)
        .order('submitted_at', { ascending: false })
        .limit(50)

      if (error) {
        toast.error('Nie udało się pobrać formularzy')

        if (isMounted) {
          setSubmissions([])
          setIsLoading(false)
        }

        return
      }

      if (isMounted) {
        setSubmissions((data as unknown as SubmissionRow[]) ?? [])
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

      <Card>
        <CardHeader>
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
            <div className="space-y-4">
              {filteredSubmissions.map((submission) => {
                const client = getRelation(submission.clients)
                const formTemplate = getRelation(submission.form_templates)
                const clientName = client?.full_name?.trim() || 'Nieznany klient'
                const formName = formTemplate?.name ?? 'Bez nazwy formularza'

                return (
                  <Card key={submission.id} className="border-border/60 shadow-sm">
                    <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="flex items-center gap-2 text-base font-semibold">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <span>{clientName}</span>
                          </div>
                          <Badge variant={submission.signed_at ? 'success' : 'secondary'}>
                            {submission.signed_at ? 'Podpisany' : 'Bez podpisu'}
                          </Badge>
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
                          onClick={() =>
                            toast.info('Podgląd formularza będzie dostępny w kolejnym kroku')
                          }
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
    </div>
  )
}
