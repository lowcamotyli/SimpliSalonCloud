import test from 'node:test'
import assert from 'node:assert/strict'
import { SubscriptionManager } from '@/lib/payments/subscription-manager'

type SupabaseResult<T> = Promise<{ data: T | null; error: any }>

function createHandlePaymentSuccessManager(options: {
  existingInvoice: boolean
  invoiceInsertError?: { code?: string; message?: string } | null
}) {
  const counters = {
    subscriptionUpdates: 0,
    invoiceInserts: 0,
    enablePlanFeaturesCalls: 0,
  }

  let subscriptionsSelectCall = 0

  const mockSupabase = {
    from(table: string) {
      if (table === 'subscriptions') {
        return {
          select() {
            subscriptionsSelectCall += 1
            const currentCall = subscriptionsSelectCall

            return {
              eq() {
                return this
              },
              single(): SupabaseResult<Record<string, unknown>> {
                if (currentCall === 1) {
                  return Promise.resolve({
                    data: {
                      id: 'sub-1',
                      salon_id: 'salon-1',
                      plan_type: 'professional',
                      billing_interval: 'monthly',
                      amount_cents: 29900,
                      metadata: {},
                    },
                    error: null,
                  })
                }

                return Promise.resolve({
                  data: {
                    id: 'sub-1',
                    plan_type: 'professional',
                    billing_interval: 'monthly',
                  },
                  error: null,
                })
              },
            }
          },
          update() {
            counters.subscriptionUpdates += 1

            return {
              eq(): SupabaseResult<null> {
                return Promise.resolve({ data: null, error: null })
              },
            }
          },
        }
      }

      if (table === 'invoices') {
        return {
          select() {
            return {
              eq() {
                return this
              },
              maybeSingle(): SupabaseResult<Record<string, unknown>> {
                return Promise.resolve({
                  data: options.existingInvoice ? { id: 'inv-1' } : null,
                  error: null,
                })
              },
            }
          },
          insert() {
            counters.invoiceInserts += 1

            return Promise.resolve({
              data: null,
              error: options.invoiceInsertError ?? null,
            })
          },
        }
      }

      if (table === 'salons') {
        return {
          select() {
            return {
              eq() {
                return this
              },
              single(): SupabaseResult<Record<string, unknown>> {
                return Promise.resolve({
                  data: {
                    id: 'salon-1',
                    name: 'Salon Test',
                    owner_email: 'owner@example.com',
                    billing_email: 'billing@example.com',
                    address: 'Test Address',
                  },
                  error: null,
                })
              },
            }
          },
        }
      }

      throw new Error(`Unexpected table in mock: ${table}`)
    },
  }

  const manager = Object.create(SubscriptionManager.prototype) as any

  manager.supabase = mockSupabase
  manager.enablePlanFeatures = async () => {
    counters.enablePlanFeaturesCalls += 1
  }

  return { manager, counters }
}

test('handlePaymentSuccess: retry with existing invoice is idempotent and does not insert duplicate invoice', async () => {
  const { manager, counters } = createHandlePaymentSuccessManager({ existingInvoice: true })

  await (manager as any).handlePaymentSuccess({
    salonId: 'salon-1',
    sessionId: 'tx-123',
    orderId: 123,
    amount: 29900,
  })

  await (manager as any).handlePaymentSuccess({
    salonId: 'salon-1',
    sessionId: 'tx-123',
    orderId: 123,
    amount: 29900,
  })

  assert.equal(counters.invoiceInserts, 0)
  assert.equal(counters.subscriptionUpdates, 2)
  assert.equal(counters.enablePlanFeaturesCalls, 2)
})

test('handlePaymentSuccess: invoice failure blocks activation and feature enablement (failure-order safety)', async () => {
  const { manager, counters } = createHandlePaymentSuccessManager({
    existingInvoice: false,
    invoiceInsertError: { code: 'XX001', message: 'db failure' },
  })

  await assert.rejects(
    (manager as any).handlePaymentSuccess({
      salonId: 'salon-1',
      sessionId: 'tx-500',
      orderId: 500,
      amount: 29900,
    }),
    /Failed to create invoice/
  )

  assert.equal(counters.invoiceInserts, 1)
  assert.equal(counters.subscriptionUpdates, 0)
  assert.equal(counters.enablePlanFeaturesCalls, 0)
})

test('createInvoice: concurrent retries are race-safe when second insert returns 23505', async () => {
  let invoiceInsertCalls = 0

  const mockSupabase = {
    from(table: string) {
      if (table === 'invoices') {
        return {
          select() {
            return {
              eq() {
                return this
              },
              maybeSingle(): SupabaseResult<null> {
                return Promise.resolve({ data: null, error: null })
              },
            }
          },
          async insert() {
            invoiceInsertCalls += 1

            if (invoiceInsertCalls === 1) {
              await new Promise((resolve) => setTimeout(resolve, 20))
              return { data: null, error: null }
            }

            return {
              data: null,
              error: {
                code: '23505',
                message: 'duplicate key value violates unique constraint',
              },
            }
          },
        }
      }

      if (table === 'salons') {
        return {
          select() {
            return {
              eq() {
                return this
              },
              single(): SupabaseResult<Record<string, unknown>> {
                return Promise.resolve({
                  data: {
                    id: 'salon-1',
                    name: 'Salon Test',
                    owner_email: 'owner@example.com',
                    billing_email: 'billing@example.com',
                    address: 'Test Address',
                  },
                  error: null,
                })
              },
            }
          },
        }
      }

      if (table === 'subscriptions') {
        return {
          select() {
            return {
              eq() {
                return this
              },
              single(): SupabaseResult<Record<string, unknown>> {
                return Promise.resolve({
                  data: {
                    id: 'sub-1',
                    plan_type: 'professional',
                    billing_interval: 'monthly',
                  },
                  error: null,
                })
              },
            }
          },
        }
      }

      throw new Error(`Unexpected table in mock: ${table}`)
    },
  }

  const manager = Object.create(SubscriptionManager.prototype) as any
  manager.supabase = mockSupabase

  const params = {
    salonId: 'salon-1',
    subscriptionId: 'sub-1',
    amount: 29900,
    p24TransactionId: 'tx-race-1',
    p24OrderId: 'order-race-1',
  }

  await Promise.all([(manager as any).createInvoice(params), (manager as any).createInvoice(params)])

  assert.equal(invoiceInsertCalls, 2)
})

