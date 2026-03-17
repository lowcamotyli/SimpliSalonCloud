# ADR-006: Integration Boundaries and Adapter Pattern

Status: Accepted
Date: 2026-03

---

## Context

SimpliSalon integrates with multiple external systems: Booksy (booking marketplace), SMSAPI.pl (SMS delivery), Resend (email delivery), Przelewy24 (payment processing), Google/Gmail (OAuth + email access). More integrations will be added as the platform expands.

External systems are a primary source of integration failures:
- APIs change their response formats without notice
- Authentication mechanisms are updated
- Rate limits change
- Services go down

The team must decide how to structure integrations so that:
1. External API changes are isolated and do not propagate into domain logic
2. Adding a new integration does not require understanding the entire codebase
3. Integration failures are handled consistently
4. The platform can support multiple providers for the same channel (e.g. multiple SMS providers)

The current state shows signs of integration logic leaking into domain services: the Booksy processor knows too much about the internal data model, the CRM campaign processor directly calls SMSAPI, and Przelewy24 session ID naming conventions are embedded in the billing domain.

---

## Decision

**Every external system integration is wrapped in an Adapter that owns the translation between the external API's model and the platform's internal domain model.**

No code outside `lib/integrations/{provider}/` ever:
- Calls an external API directly
- Parses an external API response
- Constructs an external API request
- Handles external API authentication

All of this is the adapter's responsibility.

### Adapter Interface Contract

Every adapter exposes a stable internal interface. When the external API changes, only the adapter changes — not the domain services that call it.

Example — SMS adapter interface:

```typescript
// The stable interface the Communications domain calls:
interface SmsAdapter {
  send(params: SmsSendParams): Promise<SmsSendResult>;
  verifyWebhookSignature(rawBody: string, headers: Record<string, string>): boolean;
  parseDeliveryWebhook(rawBody: string): DeliveryStatusUpdate;
}

// Internal types — never expose external API types outside the adapter:
interface SmsSendParams {
  to: string;           // phone number
  body: string;         // message content
  salonId: string;      // for per-tenant credential resolution
  messageId: string;    // internal message ID for correlation
}

interface SmsSendResult {
  externalMessageId: string;   // SMSAPI's ID, stored for webhook correlation
  status: 'sent' | 'failed';
  failureReason?: string;
}
```

The Communications domain calls `smsAdapter.send(...)`. It never sees SMSAPI.pl's API request or response format. If SMSAPI.pl changes their API, only `lib/integrations/smsapi/adapter.ts` changes.

### Anti-Corruption Layer for Data Import

For integrations that bring data into the platform (Booksy), the adapter includes an anti-corruption layer (ACL) that translates the external model into the platform's domain model:

```
Booksy email data
    │
    ▼
lib/integrations/booksy/email-parser.ts
    │  parses raw email → ExternalBookingData (Booksy's vocabulary)
    ▼
lib/integrations/booksy/acl.ts
    │  translates ExternalBookingData → BookingImportRequest (platform vocabulary)
    │  - maps external client name → tries to find Client or creates ClientCreateRequest
    │  - maps external service name → tries to find matching Service by name/duration
    │  - maps external employee name → tries to find matching Employee
    ▼
Scheduling domain: create/update booking
```

Domain services never see Booksy's data model. The ACL is where the translation happens. If Booksy changes their format, only the parser and the ACL change.

### Webhook Verification Is Non-Negotiable

Every inbound webhook handler must verify the webhook's authenticity before processing the payload. This verification is the adapter's responsibility:

```typescript
// The route handler does this:
const isValid = adapter.verifyWebhookSignature(rawBody, headers);
if (!isValid) return NextResponse.json({}, { status: 401 });

// The adapter implements the provider-specific verification:
// - Przelewy24: HMAC-SHA256 with CRC key
// - SMSAPI.pl: token header validation
// - Booksy: (future) HMAC-SHA256 with webhook secret
```

This cannot be skipped for convenience. A forged payment webhook that changes subscription status is a critical security vulnerability.

### Multi-Provider Support

The adapter pattern naturally supports multiple providers for the same channel. If the platform needs to support both SMSAPI.pl and Twilio for SMS delivery:

```typescript
// lib/communications/sms-sender.ts
function getSmsAdapter(salonId: string): SmsAdapter {
  const config = await getIntegrationConfig(salonId, 'sms');
  switch (config.provider) {
    case 'smsapi': return new SmsApiAdapter(config.credentials);
    case 'twilio': return new TwilioAdapter(config.credentials);
    default: throw new Error(`Unknown SMS provider: ${config.provider}`);
  }
}
```

Domain services call `getSmsAdapter(salonId).send(...)`. They have no awareness of which provider is being used.

---

## Alternatives Considered

### Direct API Calls in Domain Services

**What it means:** The Communications domain service calls `fetch('https://api.smsapi.pl/...')` directly. The Billing domain service directly handles Przelewy24 request construction.

**Arguments for:** No abstraction overhead; simpler for the first integration.

**Arguments against:**
- One provider's API format leaks into domain logic. Changing providers requires changes to domain logic.
- Error handling for external APIs is mixed with business logic errors
- No consistent place to add retry logic, circuit breaking, or observability
- Impossible to mock for testing without mocking the actual HTTP call
- Testability degrades because tests must stub external network calls rather than adapter interfaces

**Verdict: Rejected.** Already showing in the current codebase that integration logic leaking into domain services creates maintenance problems. The adapter pattern is a minimal investment with clear payoff.

### API Gateway Pattern

**What it means:** Introduce a separate API gateway service that proxies and normalises all external API calls. Domain services call the internal gateway, not external APIs directly.

**Arguments for:**
- Centralises retry logic, circuit breaking, and rate limiting
- Enables request/response logging in one place
- Supports multi-region routing

**Arguments against:**
- Introduces a new service with its own deployment and operational complexity
- Adds network latency to every external API call
- The benefit is the same as the adapter pattern but with significantly more infrastructure

**Verdict: Rejected.** The adapter pattern achieves the same isolation without the infrastructure overhead. If the team needs centralised retry and circuit breaking, these can be added as utility functions within the adapter base class.

### Third-Party Integration Platform (Zapier, Make, n8n)

**What it means:** Use a no-code/low-code integration platform to connect SimpliSalon to external services.

**Arguments for:** Reduces custom code for simple integrations; non-engineers can configure integrations.

**Arguments against:**
- Adds an external dependency for platform-critical integrations (SMS delivery, payment webhooks)
- Cannot implement complex anti-corruption layer logic (Booksy email parsing, webhook signature verification)
- Data privacy: sensitive client data passing through a third-party integration platform raises GDPR concerns
- Introduces latency and reliability dependency on the integration platform
- Cost scales with operation volume

**Verdict: Rejected for core integrations.** Third-party integration platforms may be appropriate for peripheral use cases (e.g. exporting data to a CRM or BI tool) but not for the core integrations that the platform depends on for operation.

---

## Consequences

### Positive
- External API changes are contained: one adapter changes, domain services are unaffected
- Consistent webhook security verification pattern applied to all providers
- Multi-provider support is natural (factory pattern on adapter selection)
- Adapters are independently testable with unit tests using mock HTTP responses
- New integrations follow a clear template; junior engineers can implement a new adapter without understanding all domain logic

### Negative / Trade-offs
- More files and abstractions: for simple integrations, the adapter pattern feels like overhead
- The ACL translation in the Booksy adapter is complex and must be maintained as Booksy's format evolves
- Per-tenant credential resolution adds a database lookup on every external API call (mitigated by caching integration configs in Redis)

### Immediate Action Items

1. Extract Przelewy24 session ID parsing logic from billing domain into the Przelewy24 adapter
2. Formalise the Booksy ACL layer to separate parsing from domain model construction
3. Define and document the standard adapter interface contract for SMS adapters
4. Add integration health checks to the `/api/health` endpoint via adapter health-check methods
