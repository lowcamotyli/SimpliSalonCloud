import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { expect, test, type Page } from '@playwright/test'

const slug = process.env.E2E_SLUG || 'anastazja'
const email = process.env.E2E_EMAIL
const password = process.env.E2E_PASSWORD

const eventIds = [
  '4e99d91c-cb69-4afd-99ce-ffe8c6a23075',
  '46dec029-9853-4751-8082-af56977e3a6e',
  'bff615b7-7147-4651-8d04-3a2e980b045c',
]

const bookingIds = [
  '58b1b769-c20f-4094-aef4-6bd30f8d57d2',
  '4b30cbdc-2f65-482f-8def-44b0ce7792a2',
  '109c8977-098d-4f98-a098-7f07e2d98ab7',
]

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

test('operator can apply prepared Booksy cancel and reschedule events from the UI', async ({ page }) => {
  test.setTimeout(240_000)

  await login(page)
  await page.goto(`/${slug}/settings/integrations/booksy`)
  await expect(page.getByRole('heading', { name: 'Integracja Booksy' })).toBeVisible()

  const reconcileResponses: Array<{ status: number; body: unknown }> = []
  page.on('response', async (response) => {
    if (!response.url().includes('/api/integrations/booksy/reconcile')) return

    const text = await response.text().catch(() => '')
    let body: unknown = text
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      body = text
    }

    reconcileResponses.push({ status: response.status(), body })
  })

  const reconcileButton = page.getByRole('button', { name: /reconcile 14 dni/i }).first()
  await expect(reconcileButton).toBeVisible()
  await reconcileButton.click()
  await expect(reconcileButton).not.toHaveText('Trwa...', { timeout: 180_000 })
  await page.waitForTimeout(1000)

  console.log('reconcileResponses', JSON.stringify(reconcileResponses, null, 2))
  expect(reconcileResponses.at(-1)?.status).toBe(200)

  const env = loadEnv('.env.local')
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  const { data: events, error: eventsError } = await supabase
    .from('booksy_parsed_events')
    .select('id,status,event_type')
    .in('id', eventIds)
  expect(eventsError).toBeNull()
  console.log('eventsAfterUiReconcile', JSON.stringify(events, null, 2))
  expect(events?.every((event) => event.status === 'applied')).toBe(true)

  const { data: bookings, error: bookingsError } = await supabase
    .from('bookings')
    .select('id,booking_date,booking_time,status,clients(full_name)')
    .in('id', bookingIds)
  expect(bookingsError).toBeNull()
  console.log('bookingsAfterUiReconcile', JSON.stringify(bookings, null, 2))

  expect(bookings).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: bookingIds[0], status: 'cancelled' }),
      expect.objectContaining({ id: bookingIds[1], status: 'cancelled' }),
      expect.objectContaining({
        id: bookingIds[2],
        status: 'scheduled',
        booking_date: '2025-11-13',
        booking_time: '10:15:00',
      }),
    ])
  )
})
