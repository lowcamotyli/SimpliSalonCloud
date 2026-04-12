import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { loadBooksyFixtureBase64Url } from '@/tests/fixtures/booksy/helpers'

const {
  createAdminClientMock,
  validateCronSecretMock,
  getDecryptedTokensMock,
  encryptMock,
  getBooksyGmailRedirectUriMock,
  historyListMock,
  messagesGetMock,
  loggerErrorMock,
  loggerWarnMock,
  oauthSetCredentialsMock,
  oauthOnMock,
  OAuth2Mock,
} = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(),
  validateCronSecretMock: vi.fn(),
  getDecryptedTokensMock: vi.fn(),
  encryptMock: vi.fn(),
  getBooksyGmailRedirectUriMock: vi.fn(),
  historyListMock: vi.fn(),
  messagesGetMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  oauthSetCredentialsMock: vi.fn(),
  oauthOnMock: vi.fn(),
  OAuth2Mock: vi.fn(function OAuth2Mock() {
    return {
      setCredentials: oauthSetCredentialsMock,
      on: oauthOnMock,
    }
  }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: createAdminClientMock,
}))

vi.mock('@/lib/middleware/cron-auth', () => ({
  validateCronSecret: validateCronSecretMock,
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
    info: vi.fn(),
    warn: loggerWarnMock,
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
        history: {
          list: historyListMock,
        },
        messages: {
          get: messagesGetMock,
        },
      },
    })),
  },
}))

import { POST } from '@/app/api/internal/booksy/process-notifications/route'

type NotificationRow = {
  id: string
  booksy_gmail_account_id: string
  salon_id: string
  processing_status: 'pending' | 'processed' | 'failed'
  received_at: string
  processed_at?: string | null
  error_message?: string | null
}

type WatchRow = {
  id: string
  booksy_gmail_account_id: string
  salon_id: string
  last_history_id: number | null
  processing_claim_token: string | null
  processing_claimed_at: string | null
  needs_full_sync?: boolean
  last_error?: string | null
}

type AccountRow = {
  id: string
  salon_id: string
  is_active: boolean
}

function createSupabaseStub(config: {
  notifications: NotificationRow[]
  watch: WatchRow
  account: AccountRow
}) {
  const rawEmailUpserts: any[] = []
  const uploadedMime: Array<{ path: string; body: Buffer; options: any }> = []

  const client = {
    rawEmailUpserts,
    uploadedMime,
    storage: {
      from: vi.fn((bucket: string) => {
        if (bucket !== 'booksy-raw-emails') {
          throw new Error(`Unexpected bucket ${bucket}`)
        }

        return {
          upload: vi.fn(async (path: string, body: Buffer, options: any) => {
            uploadedMime.push({ path, body, options })
            return { error: null }
          }),
        }
      }),
    },
    from: vi.fn((table: string) => {
      if (table === 'booksy_gmail_notifications') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn((column: string, value: string) => {
              if (column !== 'processing_status' || value !== 'pending') {
                throw new Error(`Unexpected notifications filter ${column}=${value}`)
              }

              return {
                order: vi.fn(() => ({
                  limit: vi.fn(async () => ({
                    data: config.notifications.filter((item) => item.processing_status === 'pending'),
                    error: null,
                  })),
                })),
              }
            }),
          })),
          update: vi.fn((payload: Partial<NotificationRow>) => ({
            in: vi.fn(async (_column: string, ids: string[]) => {
              for (const row of config.notifications) {
                if (ids.includes(row.id)) {
                  Object.assign(row, payload)
                }
              }

              return { error: null }
            }),
          })),
        }
      }

      if (table === 'booksy_gmail_watches') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn((firstColumn: string, firstValue: string) => ({
              eq: vi.fn((secondColumn: string, secondValue: string) => ({
                maybeSingle: vi.fn(async () => {
                  const matches =
                    firstColumn === 'booksy_gmail_account_id' &&
                    firstValue === config.watch.booksy_gmail_account_id &&
                    secondColumn === 'salon_id' &&
                    secondValue === config.watch.salon_id

                  return { data: matches ? config.watch : null, error: null }
                }),
              })),
            })),
          })),
          update: vi.fn((payload: Partial<WatchRow> & { updated_at?: string | null }) => {
            let watchMatchedByAccountAndSalon = false
            const isClaimPayload =
              Object.prototype.hasOwnProperty.call(payload, 'processing_claim_token') &&
              Object.prototype.hasOwnProperty.call(payload, 'processing_claimed_at')

            const stage1 = {
              eq: vi.fn((firstColumn: string, firstValue: string) => {
                const stage2 = {
                  eq: vi.fn((secondColumn: string, secondValue: string) => {
                    const stage3 = {
                      eq: vi.fn(async (thirdColumn: string, thirdValue: string) => {
                        if (
                          firstColumn === 'booksy_gmail_account_id' &&
                          firstValue === config.watch.booksy_gmail_account_id &&
                          secondColumn === 'salon_id' &&
                          secondValue === config.watch.salon_id &&
                          thirdColumn === 'processing_claim_token' &&
                          thirdValue === config.watch.processing_claim_token
                        ) {
                          Object.assign(config.watch, payload)
                          return { error: null }
                        }

                        return { error: null }
                      }),
                      or: vi.fn(() => ({
                        select: vi.fn(async () => {
                          if (
                            firstColumn === 'booksy_gmail_account_id' &&
                            firstValue === config.watch.booksy_gmail_account_id &&
                            secondColumn === 'salon_id' &&
                            secondValue === config.watch.salon_id &&
                            !config.watch.processing_claim_token
                          ) {
                            Object.assign(config.watch, payload)
                            return { data: [{ id: config.watch.id }], error: null }
                          }

                          return { data: [], error: null }
                        }),
                      })),
                    }

                    watchMatchedByAccountAndSalon =
                      firstColumn === 'booksy_gmail_account_id' &&
                      firstValue === config.watch.booksy_gmail_account_id &&
                      secondColumn === 'salon_id' &&
                      secondValue === config.watch.salon_id
                    if (watchMatchedByAccountAndSalon && !isClaimPayload) {
                      Object.assign(config.watch, payload)
                    }

                    return stage3
                  }),
                }

                if (firstColumn === 'id' && firstValue === config.watch.id) {
                  Object.assign(config.watch, payload)
                }

                return stage2
              }),
            }

            return stage1
          }),
        }
      }

      if (table === 'booksy_gmail_accounts') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn((firstColumn: string, firstValue: string) => ({
              eq: vi.fn((secondColumn: string, secondValue: string) => ({
                eq: vi.fn((thirdColumn: string, thirdValue: boolean) => ({
                  maybeSingle: vi.fn(async () => {
                    const matches =
                      firstColumn === 'id' &&
                      firstValue === config.account.id &&
                      secondColumn === 'salon_id' &&
                      secondValue === config.account.salon_id &&
                      thirdColumn === 'is_active' &&
                      thirdValue === true

                    return { data: matches ? config.account : null, error: null }
                  }),
                })),
              })),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(async () => ({ error: null })),
          })),
        }
      }

      if (table === 'booksy_raw_emails') {
        return {
          upsert: vi.fn(async (payload: any) => {
            rawEmailUpserts.push(payload)
            return { error: null }
          }),
        }
      }

      throw new Error(`Unexpected table ${table}`)
    }),
  }

  return client
}

describe('Booksy process-notifications worker route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.GOOGLE_CLIENT_ID = 'google-client-id'
    process.env.GOOGLE_CLIENT_SECRET = 'google-client-secret'
    validateCronSecretMock.mockReturnValue(null)
    getDecryptedTokensMock.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    })
    encryptMock.mockImplementation((value: string) => `enc:${value}`)
    getBooksyGmailRedirectUriMock.mockReturnValue('http://localhost/api/integrations/gmail/callback')
    historyListMock.mockResolvedValue({
      data: {
        historyId: '999',
        history: [
          {
            messagesAdded: [{ message: { id: 'gmail-msg-1' } }],
          },
        ],
      },
    })
    messagesGetMock.mockResolvedValue({
      data: {
        threadId: 'thread-1',
        historyId: '999',
        internalDate: String(Date.UTC(2026, 11, 5, 10, 15, 0)),
        raw: loadBooksyFixtureBase64Url('new-booking-base64.eml'),
        payload: {
          headers: [
            { name: 'Subject', value: 'Marta Wiśniewska: nowa rezerwacja' },
            { name: 'From', value: 'Booksy <notifications@booksy.com>' },
            { name: 'Message-Id', value: '<booksy-msg-123@example.com>' },
          ],
        },
      },
    })
  })

  it('discovers Gmail messages, stores raw MIME and inserts raw email records', async () => {
    const supabase = createSupabaseStub({
      notifications: [
        {
          id: 'notif-1',
          booksy_gmail_account_id: 'account-1',
          salon_id: 'salon-1',
          processing_status: 'pending',
          received_at: '2026-04-10T10:00:00.000Z',
        },
      ],
      watch: {
        id: 'watch-1',
        booksy_gmail_account_id: 'account-1',
        salon_id: 'salon-1',
        last_history_id: 123,
        processing_claim_token: null,
        processing_claimed_at: null,
        needs_full_sync: false,
        last_error: null,
      },
      account: {
        id: 'account-1',
        salon_id: 'salon-1',
        is_active: true,
      },
    })
    createAdminClientMock.mockReturnValue(supabase)

    const response = await POST(new NextRequest('http://localhost/api/internal/booksy/process-notifications', { method: 'POST' }))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toMatchObject({
      success: true,
      processedMailboxes: 1,
      processedNotifications: 1,
      rawEmailsDiscovered: 1,
    })
    expect(supabase.uploadedMime).toHaveLength(1)
    expect(supabase.uploadedMime[0].path).toBe('salon-1/account-1/2026/12/gmail-msg-1.eml')
    expect(supabase.uploadedMime[0].options).toMatchObject({
      upsert: true,
      contentType: 'message/rfc822',
    })
    expect(supabase.uploadedMime[0].body.toString('utf8')).toContain('Marta Wiśniewska')
    expect(supabase.rawEmailUpserts).toHaveLength(1)
    expect(supabase.rawEmailUpserts[0]).toMatchObject({
      salon_id: 'salon-1',
      booksy_gmail_account_id: 'account-1',
      gmail_message_id: 'gmail-msg-1',
      gmail_thread_id: 'thread-1',
      gmail_history_id: 999,
      subject: 'Marta Wiśniewska: nowa rezerwacja',
      from_address: 'Booksy <notifications@booksy.com>',
      message_id_header: '<booksy-msg-123@example.com>',
      ingest_source: 'watch',
    })
  })

  it('returns cron auth error response when validation fails', async () => {
    validateCronSecretMock.mockReturnValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    )

    const response = await POST(new NextRequest('http://localhost/api/internal/booksy/process-notifications', { method: 'POST' }))
    const payload = await response.json()

    expect(response.status).toBe(401)
    expect(payload).toEqual({ error: 'Unauthorized' })
  })
})
