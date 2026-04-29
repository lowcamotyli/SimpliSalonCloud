'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { ObjectLink } from '@/components/objects'
import { createClient } from '@/lib/supabase/client'

interface FormField {
  id: string
  label: string
  type: string
  required: boolean
}

type Answers = Record<string, unknown>

interface Props {
  submission: {
    id: string
    source: 'client_form' | 'pre_appointment'
    form_template_id: string
    client_id?: string | null
    form_templates: { name: string } | null
    clients: { full_name: string | null } | null
    submitted_at: string | null
  } | null
  slug: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

const UUID_REGEX = /^[0-9a-f-]{36}$/i

function formatDate(value: string | null): string {
  if (!value) return 'Brak daty'
  return new Date(value).toLocaleString('pl-PL', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function renderAnswerValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return ''
  if (Array.isArray(value)) return value.join(', ')
  return String(value)
}

export function SubmissionViewDialog({ submission, slug, open, onOpenChange }: Props): JSX.Element {
  const [isLoading, setIsLoading] = useState(false)
  const [answers, setAnswers] = useState<Answers | null>(null)
  const [fields, setFields] = useState<FormField[] | null>(null)

  useEffect(() => {
    if (!open || !submission) {
      setAnswers(null)
      setFields(null)
      return
    }

    let isMounted = true
    const supabase = createClient()

    const fetchData = async (): Promise<void> => {
      setIsLoading(true)
      setAnswers(null)
      setFields(null)

      const [fetchedAnswers, fetchedFields] = await Promise.all([
        (async (): Promise<Answers | null> => {
          if (submission.source !== 'pre_appointment') return null
          const { data } = await supabase
            .from('pre_appointment_responses')
            .select('answers')
            .eq('id', submission.id)
            .single()
          return (data?.answers as Answers) ?? null
        })(),
        (async (): Promise<FormField[] | null> => {
          if (!UUID_REGEX.test(submission.form_template_id)) return null
          const { data } = await supabase
            .from('form_templates')
            .select('fields')
            .eq('id', submission.form_template_id)
            .single()
          return (data?.fields as unknown as FormField[]) ?? null
        })(),
      ])

      if (isMounted) {
        setAnswers(fetchedAnswers)
        setFields(fetchedFields)
        setIsLoading(false)
      }
    }

    void fetchData()

    return () => {
      isMounted = false
    }
  }, [open, submission])

  const title = submission?.form_templates?.name ?? 'Formularz'
  const clientName = submission?.clients?.full_name ?? 'Nieznany klient'
  const submittedAt = formatDate(submission?.submitted_at ?? null)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-lg border-border/80 p-0'>
        <DialogHeader>
          <div className='border-b px-6 py-4'>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className='mt-1 flex flex-wrap items-center gap-1.5'>
            <ObjectLink
              id={submission?.client_id ?? ''}
              label={clientName}
              missing={!submission?.client_id || !submission?.clients?.full_name?.trim()}
              showDot={false}
              slug={slug}
              type='client'
            />
            <span aria-hidden='true'>&bull;</span>
            <span>{submittedAt}</span>
          </DialogDescription>
          </div>
        </DialogHeader>

        <div className='max-h-[60vh] overflow-y-auto px-6 py-4'>
          {isLoading ? (
            <div className='flex min-h-[120px] items-center justify-center'>
              <Loader2 className='h-6 w-6 animate-spin text-muted-foreground' />
            </div>
          ) : submission?.source === 'client_form' ? (
            <p className='text-sm text-muted-foreground italic'>
              Podglad zaszyfrowanych formularzy nie jest jeszcze dostepny.
            </p>
          ) : fields && fields.length > 0 ? (
            <div className='space-y-4'>
              {fields.map((field) => {
                if (field.type === 'section_header') {
                  return (
                    <div key={field.id} className='pt-2'>
                      <p className='text-sm font-bold text-muted-foreground uppercase tracking-wide'>
                        {field.label}
                      </p>
                      <div className='mt-1 border-t border-border' />
                    </div>
                  )
                }

                const rawAnswer = answers?.[field.id]
                const answerText = renderAnswerValue(rawAnswer)

                return (
                  <div key={field.id} className='space-y-1'>
                    <p className='text-sm font-semibold'>{field.label}</p>
                    {answerText ? (
                      <p className='text-sm'>{answerText}</p>
                    ) : (
                      <p className='text-sm italic text-muted-foreground'>Brak odpowiedzi</p>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <p className='text-sm text-muted-foreground italic'>
              Brak pol do wyswietlenia.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
