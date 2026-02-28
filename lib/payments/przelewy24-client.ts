import { createHash, timingSafeEqual } from 'crypto'

/**
 * Przelewy24 Client
 *
 * Integracja z polskim payment gateway Przelewy24
 * Dokumentacja API: https://docs.przelewy24.pl/
 */

interface P24Config {
  merchantId: string
  posId: string
  crc: string      // CRC key — do generowania podpisów SHA384
  apiKey: string   // API key — do HTTP Basic Auth (może być inny niż CRC)
  apiUrl: string
}

interface P24TransactionParams {
  sessionId: string
  amount: number // w groszach (29900 = 299 PLN)
  description: string
  email: string
  client?: string // Nazwa klienta
  address?: string // Adres
  zip?: string // Kod pocztowy
  city?: string // Miasto
  country?: string // Kraj (domyślnie PL)
  phone?: string // Telefon
  returnUrl: string
  statusUrl?: string
}

interface P24TransactionResponse {
  token: string
  paymentUrl: string
}

interface P24VerificationParams {
  sessionId: string
  orderId: number
  amount: number
  currency: string
  originAmount?: number
}

interface P24NotificationData {
  merchantId: number
  posId: number
  sessionId: string
  amount: number
  originAmount: number
  currency: string
  orderId: number
  methodId: number
  statement: string
  sign: string
}

/**
 * Przelewy24 Error Class
 */
export class Przelewy24Error extends Error {
  constructor(
    message: string,
    public code?: string,
    public details?: any
  ) {
    super(message)
    this.name = 'Przelewy24Error'
  }
}

/**
 * Przelewy24 Client Class
 */
export class Przelewy24Client {
  private config: P24Config

  constructor() {
    // Waliduj environment variables
    const merchantId = process.env.P24_MERCHANT_ID
    const posId = process.env.P24_POS_ID
    const crc = process.env.P24_CRC
    // P24_API_KEY jest używany do HTTP Basic Auth; fallback na P24_CRC dla starszych kont
    const apiKey = process.env.P24_API_KEY || process.env.P24_CRC
    const apiUrl = process.env.P24_API_URL

    if (!merchantId || !posId || !crc || !apiUrl) {
      throw new Przelewy24Error(
        'Missing Przelewy24 configuration. Set P24_MERCHANT_ID, P24_POS_ID, P24_CRC, and P24_API_URL environment variables.',
        'CONFIG_MISSING'
      )
    }

    this.config = {
      merchantId,
      posId,
      crc,
      apiKey: apiKey!,
      apiUrl,
    }
  }

  /**
   * Rejestruje nową transakcję w Przelewy24
   *
   * @param params - Parametry transakcji
   * @returns Token i URL do płatności
   */
  async createTransaction(
    params: P24TransactionParams
  ): Promise<P24TransactionResponse> {
    try {
      // Przygotuj payload
      const payload = {
        merchantId: parseInt(this.config.merchantId),
        posId: parseInt(this.config.posId),
        sessionId: params.sessionId,
        amount: params.amount,
        currency: 'PLN',
        description: params.description,
        email: params.email,
        client: params.client,
        address: params.address,
        zip: params.zip,
        city: params.city,
        country: params.country || 'PL',
        phone: params.phone,
        language: 'pl',
        urlReturn: params.returnUrl,
        urlStatus: params.statusUrl || `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/przelewy24`,
        timeLimit: 15, // 15 minut na dokonanie płatności
        waitForResult: false, // Asynchroniczne powiadomienie (webhook)
        regulationAccept: true, // Akceptacja regulaminu (wymagane)
        shipping: 0, // Bez kosztów wysyłki
        sign: this.generateTransactionSign({
          sessionId: params.sessionId,
          merchantId: this.config.merchantId,
          amount: params.amount,
          currency: 'PLN',
          crc: this.config.crc,
        }),
      }

      // Wywołaj API
      const response = await fetch(`${this.config.apiUrl}/api/v1/transaction/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: this.getBasicAuthHeader(),
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Przelewy24Error(
          `P24 API error: ${response.statusText}`,
          errorData.code || 'API_ERROR',
          errorData
        )
      }

      const data = await response.json()

      if (!data.data || !data.data.token) {
        throw new Przelewy24Error(
          'Invalid response from P24 API - missing token',
          'INVALID_RESPONSE',
          data
        )
      }

      return {
        token: data.data.token,
        paymentUrl: `${this.config.apiUrl}/trnRequest/${data.data.token}`,
      }
    } catch (error) {
      if (error instanceof Przelewy24Error) {
        throw error
      }

      throw new Przelewy24Error(
        `Failed to create P24 transaction: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'CREATE_TRANSACTION_FAILED',
        error
      )
    }
  }

  /**
   * Weryfikuje transakcję po otrzymaniu notyfikacji z Przelewy24
   *
   * @param params - Parametry weryfikacji
   * @returns true jeśli transakcja jest poprawna
   */
  async verifyTransaction(params: P24VerificationParams): Promise<boolean> {
    try {
      const payload = {
        merchantId: parseInt(this.config.merchantId),
        posId: parseInt(this.config.posId),
        sessionId: params.sessionId,
        amount: params.amount,
        currency: params.currency,
        orderId: params.orderId,
        sign: this.generateVerificationSign({
          sessionId: params.sessionId,
          orderId: params.orderId,
          amount: params.amount,
          currency: params.currency,
          crc: this.config.crc,
        }),
      }

      const response = await fetch(`${this.config.apiUrl}/api/v1/transaction/verify`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: this.getBasicAuthHeader(),
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        console.error('[P24] Verification failed:', errorData)
        return false
      }

      const data = await response.json()
      return data.data && data.data.status === 'success'
    } catch (error) {
      console.error('[P24] Verification error:', error)
      return false
    }
  }

  /**
   * Weryfikuje sygnaturę notyfikacji webhook od Przelewy24
   *
   * @param notification - Dane z notyfikacji
   * @returns true jeśli sygnatura jest poprawna
   */
  verifyNotificationSignature(notification: P24NotificationData): boolean {
    const expectedSign = this.generateNotificationSign({
      sessionId: notification.sessionId,
      orderId: notification.orderId,
      amount: notification.amount,
      currency: notification.currency,
      crc: this.config.crc,
    })

    const a = Buffer.from(expectedSign)
    const b = Buffer.from(notification.sign)
    return a.length === b.length && timingSafeEqual(a, b)
  }

  /**
   * Pobiera status transakcji z Przelewy24
   *
   * @param sessionId - ID sesji transakcji
   * @returns Status transakcji
   */
  async getTransactionStatus(sessionId: string): Promise<{
    status: string
    amount?: number
    currency?: string
  }> {
    try {
      const response = await fetch(
        `${this.config.apiUrl}/api/v1/transaction/by/sessionId/${sessionId}`,
        {
          method: 'GET',
          headers: {
            Authorization: this.getBasicAuthHeader(),
          },
        }
      )

      if (!response.ok) {
        throw new Przelewy24Error(
          `Failed to get transaction status: ${response.statusText}`,
          'GET_STATUS_FAILED'
        )
      }

      const data = await response.json()
      return {
        status: data.data.status || 'unknown',
        amount: data.data.amount,
        currency: data.data.currency,
      }
    } catch (error) {
      throw new Przelewy24Error(
        `Failed to get transaction status: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'GET_STATUS_FAILED',
        error
      )
    }
  }

  /**
   * Zwraca płatność (refund)
   *
   * @param orderId - ID zamówienia w P24
   * @param sessionId - ID sesji
   * @param amount - Kwota do zwrotu (w groszach) - jeśli nie podano, zwraca całość
   * @returns true jeśli refund się powiódł
   */
  async refundTransaction(
    orderId: number,
    sessionId: string,
    amount?: number
  ): Promise<boolean> {
    try {
      const payload = {
        requestId: `${sessionId}-refund-${Date.now()}`,
        refunds: [
          {
            orderId,
            sessionId,
            amount,
          },
        ],
      }

      const response = await fetch(`${this.config.apiUrl}/api/v1/transaction/refund`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: this.getBasicAuthHeader(),
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Przelewy24Error(
          `Refund failed: ${response.statusText}`,
          'REFUND_FAILED',
          errorData
        )
      }

      return true
    } catch (error) {
      console.error('[P24] Refund error:', error)
      return false
    }
  }

  /**
   * Generuje sygnaturę dla rejestracji transakcji
   */
  private generateTransactionSign(params: {
    sessionId: string
    merchantId: string
    amount: number
    currency: string
    crc: string
  }): string {
    const str = JSON.stringify({
      sessionId: params.sessionId,
      merchantId: parseInt(params.merchantId),
      amount: params.amount,
      currency: params.currency,
      crc: params.crc,
    })

    return createHash('sha384').update(str).digest('hex')
  }

  /**
   * Generuje sygnaturę dla weryfikacji transakcji
   */
  private generateVerificationSign(params: {
    sessionId: string
    orderId: number
    amount: number
    currency: string
    crc: string
  }): string {
    const str = JSON.stringify({
      sessionId: params.sessionId,
      orderId: params.orderId,
      amount: params.amount,
      currency: params.currency,
      crc: params.crc,
    })

    return createHash('sha384').update(str).digest('hex')
  }

  /**
   * Generuje sygnaturę dla notyfikacji webhook
   */
  private generateNotificationSign(params: {
    sessionId: string
    orderId: number
    amount: number
    currency: string
    crc: string
  }): string {
    const str = JSON.stringify({
      sessionId: params.sessionId,
      orderId: params.orderId,
      amount: params.amount,
      currency: params.currency,
      crc: params.crc,
    })

    return createHash('sha384').update(str).digest('hex')
  }

  /**
   * Generuje header dla HTTP Basic Authentication
   */
  private getBasicAuthHeader(): string {
    // P24 REST API v1: Basic Auth używa posId jako login i apiKey jako hasło
    const credentials = Buffer.from(`${this.config.posId}:${this.config.apiKey}`).toString('base64')
    return `Basic ${credentials}`
  }

  /**
   * Test connection - sprawdza czy credentials są poprawne
   */
  async testConnection(): Promise<boolean> {
    try {
      // Próba pobrania listy metod płatności (nie wymaga transakcji)
      const response = await fetch(`${this.config.apiUrl}/api/v1/payment/methods/${this.config.merchantId}`, {
        method: 'GET',
        headers: {
          Authorization: this.getBasicAuthHeader(),
        },
      })

      return response.ok
    } catch (error) {
      console.error('[P24] Connection test failed:', error)
      return false
    }
  }
}

/**
 * Helper function - tworzy instancję P24 Client
 */
export function createPrzelewy24Client(): Przelewy24Client {
  return new Przelewy24Client()
}
