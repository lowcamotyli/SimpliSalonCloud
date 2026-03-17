# SimpliSalon — Integration Architecture

Version: 2.0
Status: Target Architecture

---

## 1. Integration Philosophy

Integrations connect SimpliSalon to external systems. The integration architecture is designed around one principle: **the platform must be insulated from the instability of external systems**.

External APIs change their formats, go down, throttle requests, and send malformed data. The integration layer absorbs this variability and presents a clean, stable interface to the rest of the platform.

---

## 2. Integration Layer Structure

Each external system has a dedicated **adapter** in `lib/integrations/{provider}/`. An adapter contains:

1. **Outbound client** — sends requests to the external API
2. **Inbound parser** — transforms external data into the platform's internal domain model
3. **Anti-corruption layer** — translates the external vocabulary into the platform's ubiquitous language
4. **Error handler** — classifies external errors into platform-understandable types
5. **Webhook verifier** — validates the authenticity of inbound webhooks

No code outside `lib/integrations/` ever directly calls an external API or processes an external API response.

---

## 3. Current Integrations

### 3.1 Booksy

**Type:** Booking marketplace integration

**Direction:** Inbound (Booksy → SimpliSalon)

**Current mechanism:** Email-based sync via Gmail API
- Booksy sends booking confirmation emails to the salon's Gmail account
- The platform reads emails via the Gmail API and parses booking data
- Parsed bookings are imported into SimpliSalon's scheduling domain

**Components:**
- `lib/integrations/booksy/email-parser.ts` — parses Booksy email format into structured booking data
- `lib/integrations/booksy/processor.ts` — maps parsed data to internal domain models, resolves or creates client/service/employee references
- `lib/integrations/booksy/sync.ts` — manages the sync cycle, handles `booksy_pending_emails` queue
- `app/api/webhooks/booksy/route.ts` — future direct webhook receiver

**Known fragility:** The email parser is brittle. It depends on Booksy's email format remaining stable. A format change breaks the integration silently until someone notices missing bookings. Mitigations:
- All emails that fail parsing are saved to `booksy_pending_emails` for manual review
- Integration health dashboard shows failed parse count
- Target: migrate to direct Booksy API integration when available

**Data flow:**
```
Gmail (Booksy emails)
    │ Gmail API
    ▼
Email Parser → structured booking data
    │
    ▼
Processor → resolves Client, Service, Employee
         → maps to internal Booking model
         → creates/updates booking via Scheduling domain service
    │
    ▼
booksy_sync_logs (result recorded)
```

---

### 3.2 SMSAPI.pl

**Type:** SMS delivery provider

**Direction:** Bidirectional (outbound SMS, inbound delivery webhooks)

**Components:**
- `lib/integrations/smsapi/adapter.ts` — wraps SMSAPI REST API for outbound sends
- `app/api/webhooks/sms/route.ts` — receives delivery status callbacks

**Configuration per tenant:** Each salon configures their own SMSAPI.pl credentials. Credentials are stored encrypted in `integration_configs`.

**Error handling:**
- Transient errors (timeout, 5xx) → retry via QStash job retry
- Permanent errors (invalid number, insufficient balance) → logged, operator alerted
- Delivery failures → logged to `message_logs`, available in notification logs UI

**Rate limiting:** SMSAPI.pl has per-account rate limits. The platform uses exponential backoff on 429 responses and respects `Retry-After` headers.

---

### 3.3 Resend

**Type:** Transactional email delivery

**Direction:** Bidirectional (outbound email, inbound delivery webhooks)

**Components:**
- `lib/integrations/resend/adapter.ts` — wraps Resend SDK
- `app/api/webhooks/email/route.ts` — receives delivery status callbacks

**Shared vs tenant-specific:** Unlike SMS, email delivery uses a shared Resend account (platform-level credential) with per-salon `from` address configuration. This simplifies billing for email credits.

---

### 3.4 Przelewy24

**Type:** Payment gateway

**Direction:** Bidirectional (outbound payment initiation, inbound payment result webhooks)

**Components:**
- `lib/integrations/przelewy24/adapter.ts` — wraps Przelewy24 API
- `app/api/webhooks/p24/route.ts` — receives payment result notifications

**Security:** Every inbound webhook is verified using Przelewy24's CRC signature before any payment state is updated. The verification uses the shared CRC key, not the merchant password.

**Session ID naming convention:**
- `sub_{salonId}_{timestamp}` — subscription payment
- `sms_{salonId}_{timestamp}` — SMS wallet top-up
- `dunning_{salonId}_{timestamp}` — dunning retry payment

This naming allows the webhook handler to route payment outcomes to the correct domain processor.

---

### 3.5 Google / Gmail

**Type:** OAuth identity provider + Gmail API

**Direction:** Inbound (Google provides tokens, platform reads Gmail)

**Components:**
- `app/api/auth/callback/google/route.ts` — OAuth callback handler
- Gmail API usage within `lib/integrations/booksy/sync.ts`

**Scope minimisation:** The Gmail OAuth scope is limited to the minimum required for Booksy sync (`gmail.readonly`). It does not grant access to send, delete, or write emails.

---

## 4. Webhook Infrastructure

### 4.1 Webhook Receiver Pattern

All inbound webhooks follow the same pattern:

```typescript
// app/api/webhooks/{provider}/route.ts
export async function POST(request: Request): Promise<NextResponse> {
  // 1. Parse raw body (before any transformation)
  const rawBody = await request.text();
  const headers = Object.fromEntries(request.headers);

  // 2. Verify webhook authenticity
  const isValid = await adapter.verifyWebhookSignature(rawBody, headers);
  if (!isValid) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // 3. Parse payload
  const payload = adapter.parseWebhookPayload(rawBody);

  // 4. Idempotency check (has this webhook been processed?)
  const alreadyProcessed = await checkIdempotencyKey(payload.eventId);
  if (alreadyProcessed) {
    return NextResponse.json({ status: 'already_processed' });
  }

  // 5. Process via domain service (async if needed)
  await domainService.processWebhookEvent(payload);

  // 6. Record idempotency key
  await recordIdempotencyKey(payload.eventId);

  return NextResponse.json({ status: 'processed' });
}
```

### 4.2 Webhook Failure Handling

If webhook processing fails:
- Return 5xx to the sending system (causes retry from their side)
- Log the raw payload and error to the webhook log
- Alert via Sentry if failure count exceeds threshold

Webhook payloads that cannot be retried (no retry mechanism on sender side) are saved to a `failed_webhooks` table for manual inspection.

---

## 5. Public Booking API

The public booking API provides an embedded booking experience for salon websites and third-party widgets.

**Authentication:** API key per salon (not per user). The API key is:
- Generated as a cryptographically random 32-byte value
- Stored as a SHA-256 hash in `salons.api_key_hash`
- Provided to the salon owner in the integrations settings
- Rate limited per key (60 requests/minute)

**Endpoints:**
```
GET  /api/public/services?salonId=          # List services
GET  /api/public/employees?salonId=         # List employees
GET  /api/public/availability?salonId=...   # Available slots
POST /api/public/bookings                   # Create booking
```

**Data exposure:** Public endpoints return only the data necessary for booking — no internal IDs, employee contact details, pricing notes, or tenant configuration.

---

## 6. Outbound Webhook / Event Notification (Future)

As the platform grows, tenants and third-party developers will want to receive events from SimpliSalon:

**Target capability (L2):** Per-tenant webhook configuration
- Tenant provides an endpoint URL and shared secret
- Platform delivers domain events to the endpoint via signed HTTPS POST
- Delivery is retried with exponential backoff
- Failed deliveries are logged in the integration dashboard

This enables the platform to act as a data source for the salon's own tools — CRM systems, BI dashboards, third-party automations.

---

## 7. Integration Health Monitoring

| Integration | Health Signal | Alerting Threshold |
|---|---|---|
| Booksy sync | `booksy_pending_emails` count | > 10 pending items unprocessed for > 2 hours |
| Booksy sync | Last successful sync timestamp | > 30 minutes since last success |
| SMS delivery | Failed delivery rate | > 5% failure rate over 1 hour |
| Payment webhooks | Failed webhook count | > 2 failures in 1 hour |
| QStash queue | Dead-letter queue depth | > 0 items in dead-letter queue |

Health signals are surfaced in `/api/health` (extended view for operators) and in a future integration health dashboard.

---

## 8. Integration Security Checklist

Before enabling any new integration:

- [ ] Credentials stored encrypted in `integration_configs` (AES-256-GCM)
- [ ] Credentials are per-tenant, never shared
- [ ] OAuth scopes are minimised to what's strictly required
- [ ] Inbound webhooks verify authenticity before processing
- [ ] Webhook processing is idempotent
- [ ] Rate limiting applied to outbound calls
- [ ] Error handling does not expose credentials in logs
- [ ] Integration can be disabled per-tenant without restart

---

## 9. Future Integrations Roadmap

| Integration | Stage | Value |
|---|---|---|
| Direct Booksy API | L2 | Replace fragile email-based sync |
| Google Calendar sync | L2 | Two-way calendar for practitioners |
| WhatsApp Business | L2 | Additional messaging channel for clients |
| Accounting (iFirma / Fakturownia) | L2 | Invoice export to accounting software |
| Stripe (alternative to P24) | L2 | International payment processing |
| Before/after photo AI (proprietary) | L3 | Treatment progress visualisation |
| Regulatory data subject request APIs | L3 | Automated GDPR DSR handling |
