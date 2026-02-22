import { expect, test } from '@playwright/test'

test.describe('critical UI and middleware flows', () => {
  test('health API responds with healthy/degraded/unhealthy envelope', async ({ request }) => {
    const response = await request.get('/api/health')
    expect([200, 500, 503]).toContain(response.status())

    const contentType = response.headers()['content-type'] || ''
    if (contentType.includes('application/json')) {
      const body = (await response.json()) as { status?: string; checks?: unknown; error?: string }
      if (response.status() === 500) {
        expect(body.error || body.status).toBeTruthy()
      } else {
        expect(['healthy', 'degraded', 'unhealthy']).toContain(body.status)
        expect(body).toHaveProperty('checks')
      }
    } else {
      const text = await response.text()
      expect(text.length).toBeGreaterThan(0)
    }
  })

  test('unauthenticated user is redirected from protected route to login', async ({ page }) => {
    await page.goto('/test-salon/dashboard')
    await page.waitForURL('**/login')
    await expect(page).toHaveURL(/\/login$/)
  })

  test('login page renders core auth fields', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByLabel('Hasło')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Zaloguj się' })).toBeVisible()
  })

  test('signup page keeps user on form when passwords mismatch', async ({ page }) => {
    await page.goto('/signup')

    await page.getByLabel('Imię i nazwisko').fill('QA Tester')
    await page.getByLabel('Email').fill(`qa.${Date.now()}@example.com`)
    await page.getByLabel('Hasło', { exact: true }).fill('Haslo123!')
    await page.getByLabel('Potwierdź hasło').fill('InneHaslo123!')
    await page.getByLabel('Nazwa salonu').fill('Salon QA')
    await page.getByLabel('Adres URL salonu').fill('salon-qa')

    await page.getByRole('button', { name: 'Utwórz konto' }).click()

    await expect(page).toHaveURL(/\/signup\??$/)
  })
})

