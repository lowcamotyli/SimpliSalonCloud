import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { expect, test, type Page } from '@playwright/test'

const slug = process.env.E2E_SLUG || 'anastazja'
const email = process.env.E2E_EMAIL
const password = process.env.E2E_PASSWORD

function loadEnv(path: string): Record<string, string> {
  const env: Record<string, string> = {}

  for (const line of fs.readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue
    const index = trimmed.indexOf('=')
    env[trimmed.slice(0, index)] = trimmed.slice(index + 1).replace(/^"|"$/g, '')
  }

  return env
}

function makeSupabase() {
  const env = loadEnv('.env.local')

  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
}

async function login(page: Page): Promise<void> {
  if (!email || !password) {
    throw new Error('Missing E2E_EMAIL or E2E_PASSWORD environment variables')
  }

  await page.goto('/login')
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(password)
  await page.getByRole('button', { name: /zaloguj/i }).click()
  await page.waitForURL(new RegExp(`/${slug}(/|$)`), { timeout: 30_000 })
}

async function getSalonId(supabase: any, salonSlug: string): Promise<string> {
  const { data, error } = await supabase.from('salons').select('id').eq('slug', salonSlug).single()

  if (error || !data?.id) {
    throw new Error(`Unable to resolve salon id for slug ${salonSlug}`)
  }

  return data.id as string
}

async function getFirstRawEmailId(supabase: any, salonId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('booksy_raw_emails')
    .select('id')
    .eq('salon_id', salonId)
    .limit(1)
    .maybeSingle()

  if (error) {
    throw error
  }

  return (data?.id as string | undefined) ?? null
}

async function seedManualReviewEvents(supabase: any, salonId: string, rawEmailId: string): Promise<string[]> {
  const now = Date.now()
  const cancelFingerprint = `e2e-mr-cancel-${now}`
  const rescheduleFingerprint = `e2e-mr-reschedule-${now}`

  const rows = [
    {
      salon_id: salonId,
      booksy_raw_email_id: rawEmailId,
      event_type: 'cancelled',
      confidence_score: 0.45,
      event_fingerprint: cancelFingerprint,
      payload: {
        parsed: {
          clientName: 'Testowy Klient E2E',
          serviceName: 'Strzyzenie',
          bookingDate: '2026-05-01',
          bookingTime: '10:00',
        },
      },
      status: 'manual_review',
      review_reason: 'cancel_not_found',
      review_detail: 'Test: wizyta nie znaleziona',
      candidate_bookings: [],
    },
    {
      salon_id: salonId,
      booksy_raw_email_id: rawEmailId,
      event_type: 'rescheduled',
      confidence_score: 0.55,
      event_fingerprint: rescheduleFingerprint,
      payload: {
        parsed: {
          clientName: 'Anna E2E',
          serviceName: 'Koloryzacja',
          bookingDate: '2026-05-10',
          bookingTime: '14:00',
          source: 'forwarded',
        },
      },
      status: 'manual_review',
      review_reason: 'ambiguous_match',
      review_detail: 'Test: kilka pasujacych wizyt',
      candidate_bookings: [
        {
          id: '00000000-0000-0000-0000-000000000001',
          appointmentDate: '2026-04-28',
          startTime: '14:00',
          clientName: 'Anna E2E',
          serviceName: 'Koloryzacja',
          score: 72,
        },
        {
          id: '00000000-0000-0000-0000-000000000002',
          appointmentDate: '2026-05-05',
          startTime: '14:00',
          clientName: 'Anna E2E',
          serviceName: 'Koloryzacja',
          score: 65,
        },
      ],
    },
  ]

  const { data, error } = await supabase
    .from('booksy_parsed_events')
    .insert(rows)
    .select('id,event_fingerprint')

  if (error) {
    throw error
  }

  const byFingerprint = new Map<string, string>()
  for (const row of data ?? []) {
    if (typeof row?.event_fingerprint === 'string' && typeof row?.id === 'string') {
      byFingerprint.set(row.event_fingerprint, row.id)
    }
  }

  const orderedIds = [byFingerprint.get(cancelFingerprint), byFingerprint.get(rescheduleFingerprint)].filter(
    (id): id is string => typeof id === 'string' && id.length > 0
  )

  return orderedIds
}

async function cleanupTestEvents(supabase: any, ids: string[]): Promise<void> {
  if (!ids.length) return

  const { error } = await supabase.from('booksy_parsed_events').delete().in('id', ids)

  if (error) {
    throw error
  }
}

async function openReviewSection(page: Page): Promise<void> {
  const trigger = page.locator('button', { hasText: 'Do przejrzenia' }).first()
  await expect(trigger).toBeVisible()
  // Wait for Radix hydration — aria-expanded is set after hydration
  await expect(trigger).toHaveAttribute('aria-expanded', /true|false/, { timeout: 10_000 })
  const expanded = await trigger.getAttribute('aria-expanded')
  if (expanded !== 'true') {
    await trigger.click()
    await page.waitForTimeout(400)
  }
}

test.describe('manual-review API auth guards', () => {
  test('GET /api/internal/booksy/manual-review without auth -> 401', async ({ request }) => {
    const response = await request.get('/api/internal/booksy/manual-review')
    expect(response.status()).toBe(401)
  })

  test('PATCH /api/internal/booksy/manual-review without auth -> 401', async ({ request }) => {
    const response = await request.patch('/api/internal/booksy/manual-review', {
      data: {
        parsedEventId: 'fake-id',
        action: 'discard',
      },
    })

    expect(response.status()).toBe(401)
  })
})

test.describe.serial('manual-review UI', () => {
  let seededIds: string[] = []
  let adminSupabase: any
  let testSalonId = ''
  let shouldSkipSuite = false
  let skipReason = 'No booksy_raw_emails in staging'

  test.beforeAll(async ({ browser }) => {
    adminSupabase = makeSupabase()

    const page = await browser.newPage()
    try {
      await login(page)
      testSalonId = await getSalonId(adminSupabase, slug)
      const rawEmailId = await getFirstRawEmailId(adminSupabase, testSalonId)

      if (!rawEmailId) {
        shouldSkipSuite = true
        return
      }

      seededIds = await seedManualReviewEvents(adminSupabase, testSalonId, rawEmailId)
      if (!seededIds.length) {
        shouldSkipSuite = true
        skipReason = 'Unable to seed manual review events in staging'
      }
    } finally {
      await page.close()
    }
  })

  test.afterAll(async () => {
    await cleanupTestEvents(adminSupabase, seededIds)
  })

  test('accordion section Do przejrzenia renders', async ({ page }) => {
    test.setTimeout(60_000)
    test.skip(shouldSkipSuite, skipReason)

    await login(page)
    await page.goto(`/${slug}/booksy`)
    await expect(page.getByText('Do przejrzenia').first()).toBeVisible()
  })

  test('badge shows count when events seeded', async ({ page }) => {
    test.setTimeout(60_000)
    test.skip(shouldSkipSuite, skipReason)

    await login(page)
    await page.goto(`/${slug}/booksy`)

    const trigger = page.locator('button', { hasText: 'Do przejrzenia' }).first()
    // Badge renders as div (shadcn Badge), not span — match any element with numeric text
    const numericBadge = trigger.locator('*').filter({ hasText: /^\d+$/ }).first()

    await expect(numericBadge).toBeVisible({ timeout: 10_000 })
  })

  test('event cards render with correct badges', async ({ page }) => {
    test.setTimeout(60_000)
    test.skip(shouldSkipSuite, skipReason)

    await login(page)
    // Wait for the ManualReviewQueue API response before asserting
    const responsePromise = page.waitForResponse(
      (resp) => resp.url().includes('/api/internal/booksy/manual-review') && resp.request().method() === 'GET',
      { timeout: 20_000 }
    )
    await page.goto(`/${slug}/booksy`)
    await responsePromise

    await openReviewSection(page)

    // First check if ANY event card rendered (component loaded, not error state)
    await expect(page.getByText('Klient:').first()).toBeVisible({ timeout: 15_000 })
    // Check seeded events and badges (Anna E2E appears 3x: clientName + 2 candidates)
    await expect(page.getByText('Testowy Klient E2E').first()).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText('Anna E2E').first()).toBeVisible()
    await expect(page.getByText('cancel_not_found').first()).toBeVisible()
    await expect(page.getByText('ambiguous_match')).toBeVisible()
    await expect(page.getByText('forwarded')).toBeVisible()
  })

  test('Zatwierdz button disabled when candidate not selected', async ({ page }) => {
    test.setTimeout(60_000)
    test.skip(shouldSkipSuite, skipReason)

    await login(page)
    const responsePromise2 = page.waitForResponse(
      (resp) => resp.url().includes('/api/internal/booksy/manual-review') && resp.request().method() === 'GET',
      { timeout: 20_000 }
    )
    await page.goto(`/${slug}/booksy`)
    await responsePromise2
    await openReviewSection(page)
    await expect(page.getByText('Anna E2E').first()).toBeVisible({ timeout: 15_000 })

    const annaCard = page
      .locator('text=Anna E2E')
      .first()
      .locator('xpath=ancestor::div[contains(@class, "rounded")]')
      .last()

    await expect(annaCard.getByRole('radio').first()).toBeVisible()
    // "Zatwierdź" contains Polish ź — use partial match
    await expect(annaCard.getByRole('button', { name: /zatwierd/i })).toBeDisabled()
  })

  test('Odrzuc removes event from list and updates DB status to discarded', async ({ page }) => {
    test.setTimeout(60_000)
    test.skip(shouldSkipSuite, skipReason)

    await login(page)
    const responsePromise3 = page.waitForResponse(
      (resp) => resp.url().includes('/api/internal/booksy/manual-review') && resp.request().method() === 'GET',
      { timeout: 20_000 }
    )
    await page.goto(`/${slug}/booksy`)
    await responsePromise3
    await openReviewSection(page)
    await expect(page.getByText('Testowy Klient E2E')).toBeVisible({ timeout: 15_000 })

    const clientCard = page
      .locator('text=Testowy Klient E2E')
      .locator('xpath=ancestor::div[contains(@class, "rounded")]')
      .last()

    await clientCard.getByRole('button', { name: /odrzu[ćc]/i }).click()
    await expect(page.getByText('Testowy Klient E2E')).not.toBeVisible({ timeout: 10_000 })

    const discardedId = seededIds[0]
    expect(discardedId).toBeTruthy()

    const { data, error } = await adminSupabase
      .from('booksy_parsed_events')
      .select('status')
      .eq('id', discardedId)
      .single()

    expect(error).toBeNull()
    expect(data?.status).toBe('discarded')
  })

  test('dashboard widget shows alert when manual_review events exist', async ({ page }) => {
    test.setTimeout(60_000)
    test.skip(shouldSkipSuite, skipReason)

    await login(page)
    await page.goto(`/${slug}/dashboard`)
    await expect(page.getByText(/rezerwacji wymaga przejrzenia/i)).toBeVisible({ timeout: 15_000 })
  })
})
