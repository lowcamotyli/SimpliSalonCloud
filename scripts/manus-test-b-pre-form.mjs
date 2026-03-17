/**
 * Manus E2E Test — BLOK B: Formularz przed wizytą (publiczny)
 *
 * Zmienne środowiskowe:
 *   APP_URL         — np. https://simplisaloncloud.vercel.app
 *   PRE_FORM_TOKEN  — token z SMS-a (po ręcznym wywołaniu CRONa)
 *   EXPIRED_TOKEN   — (opcjonalne) token ze wstawioną wygasłą datą (do testu stanu expired)
 *
 * Przygotowanie przed uruchomieniem:
 *   1. Utwórz wizytę na JUTRO o tej samej godzinie (timing: 23-25h od teraz)
 *   2. Wywołaj CRON ręcznie:
 *      curl -sk -H "Authorization: Bearer [CRON_SECRET]" [APP_URL]/api/cron/pre-appointment-forms
 *   3. Odbierz SMS z linkiem, skopiuj token z URL
 *   4. Uruchom skrypt: PRE_FORM_TOKEN=<token> node scripts/manus-test-b-pre-form.mjs
 *
 * Opcjonalnie — test wygasłego tokenu:
 *   UPDATE pre_appointment_responses SET fill_token_exp = NOW() - INTERVAL '1 hour' WHERE fill_token = '[inny_token]';
 *   EXPIRED_TOKEN=<expired_token> node scripts/manus-test-b-pre-form.mjs
 *
 * Polling wyników:
 *   node scripts/manus-poll.mjs <taskId>
 */

import https from 'https';

const API_KEY = 'sk-nMQgGpJP02XX_6pacyELgodtqSE2FOdgxSQjr42vguSImpgQe7cy09r4OspHrM8bX15bUzBysisphWzolw_CIPYXDU7U';

const APP_URL      = process.env.APP_URL        || 'http://localhost:3000';
const TOKEN        = process.env.PRE_FORM_TOKEN || '';
const EXPIRED_TOKEN = process.env.EXPIRED_TOKEN || '';

if (!TOKEN) {
  console.error('❌ Brak PRE_FORM_TOKEN. Ustaw zmienną środowiskową i uruchom ponownie.');
  console.error('   Przykład: PRE_FORM_TOKEN=abc123 node scripts/manus-test-b-pre-form.mjs');
  process.exit(1);
}

const FORM_URL = `${APP_URL}/forms/pre/${TOKEN}`;

const prompt = `
You are a QA tester for a SaaS salon management app called SimpliSalonCloud.
Test the PRE-APPOINTMENT FORM module end-to-end. Complete every step, report PASS/FAIL.

This is a PUBLIC page — no login required.

---

## STEP 1 — Load pre-appointment form
1. Navigate to: ${FORM_URL}
2. Wait for the page to fully load
3. Check what is displayed:
   - Is there a header with the salon name?
   - Is there a client name shown?
   - Are form fields visible?
4. Take note of all form fields (their labels and types: text, radio, checkbox, date, textarea)
EXPECTED: Form loads with at least one visible field, no error page, no "Link wygasł" message
REPORT: ✅ PASS or ❌ FAIL — list all visible fields

---

## STEP 2 — Validate required fields (submit empty)
1. Without filling any fields, click the Submit button ("Wyślij", "Zapisz" or similar)
2. Check if validation errors appear for required fields
EXPECTED: Form shows validation errors, does NOT submit, stays on the same page
REPORT: ✅ PASS or ❌ FAIL — describe what happened

---

## STEP 3 — Fill all form fields
Fill every field on the form with valid test data:
- Text fields (imię, nazwisko, etc.): enter "Jan Kowalski Test"
- Email fields: enter "test@testmail.pl"
- Phone fields: enter "+48 600 000 001"
- Date fields: enter "1990-01-15" (or use the date picker to select Jan 15, 1990)
- Radio buttons: select the FIRST option available
- Checkboxes: check ALL checkboxes (all should be checked)
- Textarea / long text: enter "Brak dodatkowych uwag — test E2E automatyczny"
- Select / dropdown: choose the first available option
EXPECTED: All fields filled without errors
REPORT: ✅ PASS or ❌ FAIL — note any field that couldn't be filled

---

## STEP 4 — Submit the form
1. Click the Submit button ("Wyślij formularz", "Zapisz", "Prześlij" or similar)
2. Wait for response (up to 10 seconds)
3. Check what is displayed after submit
EXPECTED: Success message shown — should include words like:
  "Dziękujemy" / "Formularz wysłany" / "Do zobaczenia na wizycie" / "Thank you"
REPORT: ✅ PASS or ❌ FAIL — copy the exact success message shown

---

## STEP 5 — Try to submit the same form again (idempotency test)
1. Navigate AGAIN to the same URL: ${FORM_URL}
2. Wait for the page to load
3. Note what the page shows
EXPECTED: Page should show one of:
  - "Formularz już wypełniony" (Form already submitted)
  - "Link jest nieważny" (Link invalid)
  - A 409/410 error indicator
  - Redirect to an info page
  The form should NOT be fillable again.
REPORT: ✅ PASS or ❌ FAIL — copy the exact message shown

---

${EXPIRED_TOKEN ? `
## STEP 6 — Test expired token
1. Navigate to: ${APP_URL}/forms/pre/${EXPIRED_TOKEN}
2. Wait for the page to load
3. Note what is shown
EXPECTED: Page shows "Link wygasł" (Link expired) or a 410 Gone indicator
  The form should NOT be fillable
REPORT: ✅ PASS or ❌ FAIL — copy the exact message shown
` : `
## STEP 6 — Expired token test (SKIPPED — no EXPIRED_TOKEN provided)
To test: set fill_token_exp to past date in DB for a DIFFERENT token, then provide EXPIRED_TOKEN env var.
  UPDATE pre_appointment_responses SET fill_token_exp = NOW() - INTERVAL '1 hour' WHERE fill_token = '[other_token]';
REPORT: ⏭ SKIPPED
`}

---

## STEP 7 — Test completely invalid token
1. Navigate to: ${APP_URL}/forms/pre/invalid-token-that-does-not-exist-xyz123
2. Wait for the page to load
3. Note what is shown
EXPECTED: Error page — "Nie znaleziono formularza" / "Invalid link" / 404 indicator
  Should NOT show a blank form
REPORT: ✅ PASS or ❌ FAIL — copy the exact message shown

---

## FINAL REPORT
Output a summary table:

| Step | Description | Result | Notes |
|------|-------------|--------|-------|
| 1 | Form loads correctly | ✅/❌ | list fields found |
| 2 | Required field validation works | ✅/❌ | |
| 3 | All fields fillable | ✅/❌ | |
| 4 | Form submits successfully | ✅/❌ | copy success msg |
| 5 | Double-submit blocked | ✅/❌ | copy shown message |
| 6 | Expired token handled | ✅/❌/⏭ | |
| 7 | Invalid token handled | ✅/❌ | |

OVERALL: X/Y tests passed

Also note:
- Number of form fields found: N
- Field types encountered: (list them)
- Any UI issues observed: (describe)
`;

function post(body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request({
      hostname: 'api.manus.ai',
      path: '/v1/tasks',
      method: 'POST',
      headers: {
        'API_KEY': API_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
      rejectUnauthorized: false,
    }, (res) => {
      let out = '';
      res.on('data', c => out += c);
      res.on('end', () => resolve({ status: res.statusCode, body: out }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

const { status, body } = await post({
  prompt,
  agentProfile: 'manus-1.6',
  taskMode: 'agent',
});

const parsed = JSON.parse(body);
const taskId = parsed.task_id || parsed.id || parsed.taskId;

console.log(`\n=== Manus Task Created ===`);
console.log(`Status HTTP: ${status}`);
console.log(`Task ID: ${taskId}`);
console.log(`\nTested URL: ${FORM_URL}`);
console.log(`\nPoll for results:`);
console.log(`  node scripts/manus-poll.mjs ${taskId}`);
console.log(`\nFull response:`, JSON.stringify(parsed, null, 2));
