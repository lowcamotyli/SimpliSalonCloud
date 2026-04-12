import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { loadBooksyFixtureBase64Url } from '@/tests/fixtures/booksy/helpers'

const {
  createAdminClientMock,
  getDecryptedTokensMock,
  encryptMock,
  getBooksyGmailRedirectUriMock,
  loggerInfoMock,
  loggerErrorMock,
  OAuth2Mock,
  oauthSetCredentialsMock,
  oauthOnMock,
  messagesListMock,
  messagesGetMock,
} = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(),
  getDecryptedTokensMock: vi.fn(),
  encryptMock: vi.fn(),
  getBooksyGmailRedirectUriMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  oauthSetCredentialsMock: vi.fn(),
  oauthOnMock: vi.fn(),
  OAuth2Mock: vi.fn(function OAuth2Mock() {
    return {
      setCredentials: oauthSetCredentialsMock,
      on: oauthOnMock,
    }
  }),
  messagesListMock: vi.fn(),
  messagesGetMock: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: createAdminClientMock,
}))

vi.mock('@/lib/booksy/gmail-auth', () => ({
  getDecryptedTokens: getDecryptedTokensMock,
  encrypt: encryptMock,
}))

vi.mock('@/lib/google/get-google-redirect-uri', () => ({
  getBooksyGmailRedirectUri: getBooksyGmailRedirectUriMock,
}))

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: loggerInfoMock,
    warn: vi.fn(),
    error: loggerErrorMock,
  },
}))

vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: OAuth2Mock,
    },
    gmail: vi.fn(() => ({
      users: {
        messages: {
          list: messagesListMock,
          get: messagesGetMock,
        },
      },
    })),
  },
}))

import { POST } from '@/app/api/internal/booksy/reconcile/route'

function createThenableBuilder<T>(rows: T[]) {
  const state = {
    filtered: rows.slice(),
  }

  const builder: any = {
    select: vi.fn(() => builder),
    eq: vi.fn((column: string, value: unknown) => {
      state.filtered = state.filtered.filter((row: any) => row[column] === value)
      return builder
    }),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => ({ data: state.filtered[0] ?? null, error: null })),
    single: vi.fn(async () => ({ data: state.filtered[0] ?? null, error: null })),
    then<TResult1 = any, TResult2 = never>(
      onfulfilled?: ((value: { data: T[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
    ) {
      return Promise.resolve({
        data: state.filtered,
        error: null,
      }).then(onfulfilled, onrejected)
    },
  }

  return builder
}

function createSupabaseStub() {
  const mailboxes = [
    {
      id: 'account-1',
      salon_id: 'salon-1',
      gmail_email: 'lowca.motyli@gmail.com',
      auth_status: 'active',
      is_active: true,
      is_primary: true,
      encrypted_access_token: 'enc-access',
      encrypted_refresh_token: 'enc-refresh',
      created_at: '2026-04-10T10:00:00.000Z',
      updated_at: '2026-04-10T10:00:00.000Z',
      display_name: null,
      last_auth_at: null,
      last_error: null,
      token_expires_at: null,
    },
  ]
  const reconciliationRuns: any[] = []
  const rawEmails: any[] = []
  const uploads: Array<{ path: string; body: Buffer; options: any }> = []

  return {
    reconciliationRuns,
    rawEmails,
    uploads,
    client: {
      storage: {
        from: vi.fn(() => ({
          upload: vi.fn(async (path: string, body: Buffer, options: any) => {
            uploads.push({ path, body, options })
            return { error: null }
          }),
        })),
      },
      from: vi.fn((table: string) => {
        if (table === 'booksy_gmail_accounts') {
          return createThenableBuilder(mailboxes)
        }

        if (table === 'booksy_reconciliation_runs') {
          return {
            insert: vi.fn((payload: any) => {
              const row = { id: `run-${reconciliationRuns.length + 1}`, ...payload }
              reconciliationRuns.push(row)
              return {
                select: vi.fn(() => ({
                  single: vi.fn(async () => ({ data: row, error: null })),
                })),
              }
            }),
            update: vi.fn((payload: any) => ({
              eq: vi.fn(async (_column: string, id: string) => {
                const row = reconciliationRuns.find((run) => run.id === id)
                Object.assign(row ?? {}, payload)
                return { error: null }
              }),
            })),
          }
        }

        if (table === 'booksy_raw_emails') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => Promise.resolve({ data: rawEmails, error: null })),
            })),
            upsert: vi.fn(async (payload: any) => {
              rawEmails.push(payload)
              return { error: null }
            }),
          }
        }

        throw new Error(`Unexpected table ${table}`)
      }),
    },
  }
}

describe('Booksy reconcile route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CRON_SECRET = 'cron-secret'
    process.env.GOOGLE_CLIENT_ID = 'google-client-id'
    process.env.GOOGLE_CLIENT_SECRET = 'google-client-secret'
    getDecryptedTokensMock.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    })
    encryptMock.mockImplementation((value: string) => `enc:${value}`)
    getBooksyGmailRedirectUriMock.mockReturnValue('http://localhost/api/integrations/gmail/callback')
    messagesListMock.mockResolvedValue({
      data: {
        messages: [{ id: 'gmail-forward-1' }],
      },
    })
    messagesGetMock.mockResolvedValue({
      data: {
        threadId: 'thread-1',
        historyId: '12345',
        internalDate: String(Date.UTC(2026, 3, 8, 13, 0, 0)),
        raw: loadBooksyFixtureBase64Url('forwarded-new-booking.eml'),
      },
    })
  })

  it('manual backfill imports forwarded Booksy emails into storage and raw ledger', async () => {
    const supabase = createSupabaseStub()
    createAdminClientMock.mockReturnValue(supabase.client)

    const response = await POST(new NextRequest('http://localhost/api/internal/booksy/reconcile', {
      method: 'POST',
      headers: {
        'x-cron-secret': 'cron-secret',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        accountId: 'account-1',
        windowDays: 1,
        includeForwarded: true,
      }),
    }))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toMatchObject({
      success: true,
      includeForwarded: true,
      processedMailboxes: 1,
      emailsBackfilled: 1,
    })
    expect(supabase.uploads).toHaveLength(1)
    expect(supabase.uploads[0].path).toBe('salon-1/account-1/2026/04/gmail-forward-1.eml')
    expect(supabase.rawEmails).toHaveLength(1)
    expect(supabase.rawEmails[0]).toMatchObject({
      salon_id: 'salon-1',
      booksy_gmail_account_id: 'account-1',
      gmail_message_id: 'gmail-forward-1',
      from_address: 'Bartłomiej Mitka <no-reply@booksy.com>',
      subject: 'Fwd: Bartłomiej Mitka: nowa rezerwacja piątek, 10 kwietnia 2026 15:45',
      storage_path: 'salon-1/account-1/2026/04/gmail-forward-1.eml',
      ingest_source: 'manual_backfill',
    })
    expect(loggerInfoMock).toHaveBeenCalled()
  })
})
