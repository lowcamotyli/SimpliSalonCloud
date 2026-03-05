import { NextResponse } from 'next/server'
import { verifyFormToken } from '@/lib/forms/token'
import { encryptAnswers } from '@/lib/forms/encryption'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import type { FormField } from '@/types/forms'

interface SubmitPayload {
  answers: Record<string, unknown>
  signature?: string
}

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  return true
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params

    let payload: Awaited<ReturnType<typeof verifyFormToken>>
    try {
      payload = await verifyFormToken(token)
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const adminClient = createAdminSupabaseClient()

    const { data: clientForm, error: clientFormError } = await adminClient
      .from('client_forms')
      .select('id, fill_token_exp, form_template_id')
      .eq('fill_token', token)
      .limit(1)
      .maybeSingle()

    if (clientFormError) {
      return NextResponse.json({ error: clientFormError.message }, { status: 500 })
    }

    if (!clientForm) {
      return NextResponse.json({ error: 'Nie znaleziono formularza' }, { status: 404 })
    }

    if (clientForm.fill_token_exp && new Date(clientForm.fill_token_exp) < new Date()) {
      return NextResponse.json({ error: 'Token wygasł' }, { status: 410 })
    }

    const body = (await request.json()) as SubmitPayload
    const answers = body?.answers
    const signature = body?.signature

    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
      return NextResponse.json({ error: 'Invalid payload: answers are required' }, { status: 400 })
    }

    const { data: template, error: templateError } = await adminClient
      .from('form_templates')
      .select('fields')
      .eq('id', clientForm.form_template_id)
      .limit(1)
      .maybeSingle()

    if (templateError) {
      return NextResponse.json({ error: templateError.message }, { status: 500 })
    }

    if (!template) {
      return NextResponse.json({ error: 'Nie znaleziono szablonu formularza' }, { status: 404 })
    }

    const fields = (template.fields ?? []) as FormField[]
    const missingRequired = fields
      .filter((field) => field.required)
      .filter((field) => !hasValue(answers[field.id]))
      .map((field) => field.id)

    if (missingRequired.length > 0) {
      return NextResponse.json(
        { error: 'Brak wymaganych odpowiedzi', missingFields: missingRequired },
        { status: 400 }
      )
    }

    const { encrypted, iv, tag } = encryptAnswers(answers)
    const hexAnswers = `\\x${encrypted.toString('hex')}`
    const hexIv = `\\x${iv.toString('hex')}`
    const hexTag = `\\x${tag.toString('hex')}`

    let signatureUrl: string | null = null
    if (signature) {
      const signatureBuffer = Buffer.from(
        signature.replace(/^data:image\/\w+;base64,/, ''),
        'base64'
      )
      const path = `${payload.salonId}/${payload.clientId}/${Date.now()}.png`

      const { error: uploadError } = await adminClient.storage
        .from('signatures')
        .upload(path, signatureBuffer, { contentType: 'image/png' })

      if (uploadError) {
        return NextResponse.json({ error: uploadError.message }, { status: 500 })
      }

      const { data: urlData, error: signedUrlError } = await adminClient.storage
        .from('signatures')
        .createSignedUrl(path, 3600)

      if (signedUrlError || !urlData?.signedUrl) {
        return NextResponse.json({ error: 'Failed to generate signature URL' }, { status: 500 })
      }
      signatureUrl = urlData.signedUrl
    }

    const now = new Date().toISOString()
    const updatePayload: {
      answers: string
      answers_iv: string
      answers_tag: string
      submitted_at: string
      signed_at?: string
      signature_url?: string | null
      fill_token: null
    } = {
      answers: hexAnswers,
      answers_iv: hexIv,
      answers_tag: hexTag,
      submitted_at: now,
      fill_token: null,
    }

    if (signatureUrl) {
      updatePayload.signed_at = now
      updatePayload.signature_url = signatureUrl
    }

    const { error: updateError } = await adminClient
      .from('client_forms')
      .update(updatePayload)
      .eq('id', clientForm.id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
