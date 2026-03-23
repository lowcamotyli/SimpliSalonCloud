# SimpliSalon — Automation Engine

Version: 2.0
Status: Target Architecture

---

## 1. Purpose

The Automation Engine is the lifecycle automation backbone of the SimpliSalon platform. It evaluates trigger conditions and executes workflow steps that connect the salon's operational events to client communications and platform actions. The engine makes SimpliSalon an active participant in the client relationship — not just a passive record-keeping system.

---

## 2. Design Goals

- **Tenant-configurable:** Each tenant configures their own automation rules. The engine executes rules in the context of the tenant that owns them.
- **Kill-switch controlled:** Every automation category has a kill switch. If the kill switch is off for a tenant, no automation in that category executes — regardless of trigger conditions.
- **Idempotent:** Executing an automation rule twice for the same trigger event produces the same outcome as executing it once.
- **Non-blocking:** Automation execution does not block the triggering operation (booking creation, form submission, etc.). Automation is always async relative to the triggering request.
- **Auditable:** Every automation execution — including skipped executions — is logged with enough context to understand why it did or did not run.

---

## 3. Engine Components

```
┌─────────────────────────────────────────────────────────────────────┐
│                      AUTOMATION ENGINE                              │
│                                                                     │
│  ┌─────────────┐    ┌──────────────┐    ┌─────────────────────┐   │
│  │   Trigger   │───►│  Rule        │───►│  Workflow           │   │
│  │   Registry  │    │  Evaluator   │    │  Executor           │   │
│  └─────────────┘    └──────────────┘    └─────────────────────┘   │
│         │                  │                      │                 │
│         │                  │                      │                 │
│  Domain Events      Per-tenant rules      Step execution:          │
│  CRON triggers      + conditions          - send message           │
│  Time-based         + kill switches       - dispatch form          │
│  triggers                                 - update state           │
│                                           - enqueue to QStash      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. Trigger Types

The engine responds to two categories of triggers:

### 4.1 Event Triggers

Fired when a domain event occurs. The engine evaluates all enabled automation rules for the tenant that are subscribed to the event type.

| Trigger | Source Event | Example Use |
|---|---|---|
| `booking.created` | Scheduling | Send booking confirmation SMS |
| `booking.completed` | Scheduling | Dispatch satisfaction survey |
| `booking.cancelled` | Scheduling | Send cancellation confirmation |
| `booking.no_show` | Scheduling | Increment no-show counter, alert manager |
| `booking.rescheduled` | Scheduling | Send reschedule confirmation |
| `form.submitted` | Documents & Forms | Send thank-you message, update client notes |
| `treatment.completed` | Treatment Records | Send post-treatment care instructions |
| `treatment_plan.milestone_reached` | Treatment Records | Send milestone notification |
| `treatment_plan.completed` | Treatment Records | Suggest next treatment plan booking |
| `client.inactive` | Client & CRM | Trigger reactivation campaign |
| `subscription.past_due` | Billing | Send payment failure notification to owner |
| `sms_wallet.low_balance` | Billing | Alert owner to top up |

### 4.2 Time-Based (CRON) Triggers

Evaluated on a schedule, not in response to a specific event. The engine queries for records that match the trigger criteria and processes them.

| Trigger | Schedule | Example Use |
|---|---|---|
| `pre_appointment_window` | Daily 08:00 | Find bookings in 24h window → dispatch pre-appointment form |
| `appointment_reminder` | Daily 09:00 | Find bookings in reminder window → send reminder SMS |
| `post_visit_survey_window` | Every 30 min | Find completed bookings past delay threshold → send survey |
| `client_inactivity_check` | Daily 02:00 | Find clients inactive for N days → emit `client.inactive` |
| `treatment_session_reminder` | Daily 08:30 | Find upcoming sessions in treatment plans → send reminder |
| `campaign_scheduled` | Every 30 min | Find campaigns with `scheduled_at` in the past → trigger campaign processor |

---

## 5. Rule Structure

An automation rule is a tenant-owned configuration object:

```typescript
interface AutomationRule {
  id: string;
  salonId: string;
  name: string;
  triggerType: TriggerType;            // 'booking.completed', 'pre_appointment_window', etc.
  conditions: AutomationCondition[];    // all must be true for rule to execute
  steps: AutomationStep[];             // executed in order
  enabled: boolean;                    // rule-level kill switch
  category: AutomationCategory;        // 'reminders' | 'surveys' | 'crm' | 'forms'
  delayMinutes?: number;               // optional delay before execution
  cooldownHours?: number;              // minimum time between triggers for same entity
}

interface AutomationCondition {
  field: string;                        // e.g. 'booking.service.category'
  operator: 'eq' | 'neq' | 'in' | 'not_in' | 'gte' | 'lte';
  value: unknown;
}

interface AutomationStep {
  type: StepType;
  config: StepConfig;
}
```

### Step Types

| Step Type | Action | Config |
|---|---|---|
| `send_sms` | Send SMS to client | `{ templateId, channel: 'sms' }` |
| `send_email` | Send email to client | `{ templateId, channel: 'email' }` |
| `dispatch_form` | Send form link to client | `{ formTemplateId }` |
| `update_booking_flag` | Set a boolean flag on the booking | `{ field, value }` |
| `add_client_tag` | Add a tag to the client | `{ tag }` |
| `notify_staff` | Send internal notification | `{ staffRole, message }` |
| `enqueue_campaign` | Trigger a campaign | `{ campaignId }` |

---

## 6. Kill Switches

Kill switches are the safety layer of the automation engine. They operate at two levels:

### 6.1 Category-Level Kill Switch

Each automation category has a tenant-configurable kill switch in `notification_settings`:

```typescript
interface NotificationSettings {
  reminders: { enabled: boolean };
  surveys: { enabled: boolean };
  preAppointmentForms: { enabled: boolean };
  crmAutomations: { enabled: boolean };
  // future: treatmentFollowUps, milestoneNotifications, etc.
}
```

If a category's kill switch is `false`, no rules in that category execute. This is checked before any rule evaluation.

### 6.2 Rule-Level Kill Switch

Each individual automation rule has an `enabled` flag. Even if the category kill switch is on, a specific rule can be disabled independently.

### 6.3 Feature-Level Kill Switch

All automation categories require a feature flag to be active (`feature_flags` table). If the feature is not enabled for the tenant's plan, the entire automation category is inactive. This is the outermost gate.

**Kill switch evaluation order:**
```
1. Feature flag active? → No → SKIP (feature not available on plan)
2. Category kill switch on? → No → SKIP (tenant has disabled category)
3. Rule enabled? → No → SKIP (specific rule disabled)
4. Conditions met? → No → SKIP (conditions not satisfied)
5. Cooldown elapsed? → No → SKIP (too soon after last execution)
6. Execute steps
```

---

## 7. Execution Flow

### 7.1 Event-Triggered Execution

```
Domain Event emitted (e.g. booking.completed)
    │
    ▼
In-process event bus → Automation Engine receives event
    │
    ▼
Engine queries: SELECT active rules WHERE trigger_type = 'booking.completed'
               AND salon_id = event.tenantId
    │
    ▼
For each rule:
    ├── Check feature flag
    ├── Check category kill switch
    ├── Check rule.enabled
    ├── Evaluate conditions against event payload
    ├── Check cooldown (last execution timestamp)
    │
    └── If all pass:
        ├── If delayMinutes > 0: Enqueue to QStash with delay
        └── If delayMinutes = 0: Enqueue to QStash immediately
                │
                ▼
        QStash delivers to /api/queue/automation
                │
                ▼
        WorkflowExecutor executes steps in order
        └── Logs each step to automation_logs
```

### 7.2 CRON-Triggered Execution

```
Vercel Cron fires → /api/cron/{trigger-name}
    │
    ▼
CRON handler queries database for qualifying records
(e.g. bookings tomorrow that have not had pre_form_sent = true)
    │
    ▼
For each qualifying record:
    ├── Resolve tenant's notification_settings
    ├── Check feature flag and kill switch
    │
    └── If passes:
        └── Enqueue automation job to QStash
            OR execute directly if low volume
    │
    ▼
Mark record as processed (e.g. set pre_form_sent = true BEFORE sending)
└── Prevents duplicate sends if CRON runs twice
```

---

## 8. Pre-Appointment Form Automation (Concrete Example)

This is one of the most complete automation flows in the current system, used as a reference implementation:

```
CRON: daily 08:00
    │
    ▼
Query: bookings WHERE date = tomorrow
       AND pre_form_sent = false
       AND status IN ('confirmed', 'pending')
    │
    ▼
For each booking:
    1. Resolve tenant notification_settings
    2. Check preAppointmentForms.enabled = true
    3. Check feature flag 'pre_appointment_forms'
    4. Resolve service's assigned form template
    5. Generate form token (UUID + HMAC, store hash)
    6. Create pre_appointment_response record
    7. Set booking.pre_form_sent = true     ← BEFORE sending
    8. Send SMS with form link
    9. Log to audit_logs
```

Setting `pre_form_sent = true` before sending is intentional: if the SMS send fails, the record is already marked. This prevents an infinite loop of re-sends. The tradeoff is that a send failure silently skips the form. For the next iteration, the CRON should write a `failed` status rather than simply not sending on failure.

---

## 9. Built-In Automation Rules (Non-Configurable)

Some automation behaviours are built into the system and cannot be disabled by the tenant:

| Rule | Trigger | Reason |
|---|---|---|
| Booking confirmation | `booking.created` | Core operational message; always sent |
| Cancellation confirmation | `booking.cancelled` | Required for customer experience |
| Payment failure notice to owner | `payment.failed` | Operational necessity |

These are implemented as system automation steps, not configurable rules.

---

## 10. Future Automation Capabilities (L2/L3)

| Capability | Stage | Description |
|---|---|---|
| Treatment plan reminders | L2 | Automated reminders N days before next session in a multi-session plan |
| Post-treatment care instructions | L2 | Send condition-specific aftercare instructions based on treatment type |
| Protocol deviation alerts | L3 | Alert practitioner when a session deviates from protocol parameters |
| Client inactivity AI scoring | L3 | ML-based churn prediction triggering personalised reactivation campaigns |
| Regulatory compliance reminders | L3 | Alert when consent records are approaching expiry |
