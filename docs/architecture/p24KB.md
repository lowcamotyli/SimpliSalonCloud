# SIMPLISALON – P24 INTEGRATION KNOWLEDGE BASE (AGENT VERSION)

## 1. PURPOSE

Provide a deterministic integration model for Przelewy24 (P24) payments inside SimpliSalon.

This document defines:

* required flow
* API contracts
* validation rules
* critical constraints

---

## 2. CORE TRANSACTION FLOW

```
REGISTER → REDIRECT → PAYMENT → WEBHOOK → VERIFY → SUCCESS
```

### REQUIRED ORDER

1. Register transaction
2. Redirect user to P24
3. Receive webhook (async)
4. Perform VERIFY
5. Mark transaction as PAID

### HARD RULE

Transaction is NOT valid until VERIFY is completed.



---

## 3. AUTHENTICATION

```
Type: Basic Auth
username = posId
password = secretId
```

---

## 4. ENVIRONMENTS

```
SANDBOX: https://sandbox.przelewy24.pl/api/v1
PROD:    https://secure.przelewy24.pl/api/v1
```

---

## 5. DATA MODEL (INTERNAL)

### Transaction (SimpliSalon)

```
id: string (sessionId)
status: enum [pending, paid, failed]
amount: int (grosze)
currency: string (PLN)
orderId: int (P24)
createdAt: timestamp
verifiedAt: timestamp
```

---

## 6. API CONTRACTS

### 6.1 REGISTER

```
POST /transaction/register
```

#### REQUIRED FIELDS

```
merchantId: int
posId: int
sessionId: string (unique)
amount: int (grosze)
currency: string
description: string
email: string
country: string (ISO)
language: string
urlReturn: string
urlStatus: string
sign: string
```

#### OUTPUT

```
token: string
```

---

### 6.2 REDIRECT

```
GET https://secure.przelewy24.pl/trnRequest/{TOKEN}
```

---

### 6.3 WEBHOOK (urlStatus)

#### CHARACTERISTICS

* async
* sent ONLY for successful payments
* retried multiple times

#### PAYLOAD

```
sessionId: string
orderId: int
amount: int
currency: string
```

---

### 6.4 VERIFY (CRITICAL)

```
PUT /transaction/verify
```

#### REQUIRED

```
merchantId
posId
sessionId
amount
currency
orderId
sign
```

#### RESULT

```
status = success
```

---

## 7. SIGNATURE (SIGN)

### ALGORITHM

```
SHA384(JSON)
```

### REGISTER SIGN

```
{
  sessionId,
  merchantId,
  amount,
  currency,
  crc
}
```

### VERIFY SIGN

```
{
  sessionId,
  orderId,
  amount,
  currency,
  crc
}
```

### NOTIFICATION SIGN (webhook urlStatus)

```
{
  merchantId,
  posId,
  sessionId,
  amount,
  originAmount,
  currency,
  orderId,
  methodId,
  statement,
  crc
}
```

**CRITICAL:** Field order matters. Use exactly this order.

Most online examples and unofficial docs show only 5 fields
{sessionId, orderId, amount, currency, crc} — THIS IS WRONG.
The actual P24 implementation (PHP SDK: mnastalski/przelewy24-php,
TransactionStatusNotification.php) uses all 10 fields from
the notification payload.

### CRC KEY

```
Klucz do CRC from P24 merchant panel (not Klucz do raportów)
```

### REQUIREMENTS

* JSON_UNESCAPED_UNICODE
* JSON_UNESCAPED_SLASHES

---

## 8. CRITICAL RULES

### RULE 1 – VERIFY REQUIRED

No VERIFY → no settlement.

### RULE 2 – AMOUNT FORMAT

Always in grosze (int).

### RULE 3 – IDEMPOTENCY

Webhook handling must be idempotent.

### RULE 4 – SOURCE OF TRUTH

Webhook + VERIFY result = single source of truth.

### RULE 5 – SESSION ID

Must be unique per transaction.

---

## 9. WEBHOOK RETRY SCHEDULE

P24 retries until VERIFY:

```
3m, 5m, 15m, 30m, 60m, 150m, 450m
```

---

## 10. ERROR CONDITIONS

### COMMON FAILURES

```
INVALID SIGN
WRONG AMOUNT
MISSING VERIFY
INT OVERFLOW (orderId)
INVALID AUTH
```



---

## 11. INFRA REQUIREMENTS

```
TLS >= 1.2
OpenSSL >= 1.0.1
cURL >= 7.34
64-bit environment required
```

---

## 12. STORAGE REQUIREMENTS

### orderId

```
type: BIGINT (required)
```

### amount

```
type: INT (grosze)
```

---

## 13. SECURITY

* Validate IP whitelist (optional)
* Validate SIGN for all incoming requests
* Reject unsigned payloads

---

## 14. OPTIONAL FEATURES

### SUPPORTED

* BLIK
* Card payments
* Pay-by-link
* Refunds
* One-click (alias)

### NOT REQUIRED FOR MVP

* Installments
* Split payments
* Recurring

---

## 15. REFUNDS

```
POST /transaction/refund
```

### RULE

```
sum(refunds) <= original amount
```

---

## 16. PAYMENT METHODS

```
GET /payment/methods
```

Used for dynamic UI rendering.

---

## 17. SYSTEM BEHAVIOR (SIMPLISALON)

### STATE MACHINE

```
pending → paid → completed
pending → failed
```

### TRANSITIONS

* pending → paid → after VERIFY
* pending → failed → timeout / cancel

---

## 18. IMPLEMENTATION CONTRACT

### BACKEND MUST

* store transaction before REGISTER
* handle webhook
* perform VERIFY
* update state

### FRONTEND MUST

* redirect to P24
* handle return URL

---

## 19. TESTING

### ENDPOINT

```
GET /testAccess
```

---

## 20. SINGLE MOST IMPORTANT RULE

```
VERIFY = PAYMENT CONFIRMATION
```



---
