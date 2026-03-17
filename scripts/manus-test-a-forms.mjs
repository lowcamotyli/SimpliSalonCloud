/**
 * Manus E2E Test — BLOK A: Formularze (dashboard + publiczny)
 *
 * Zmienne środowiskowe:
 *   APP_URL      — np. https://simplisaloncloud.vercel.app
 *   SALON_SLUG   — slug salonu, np. "testowy-salon"
 *   EMAIL        — login właściciela
 *   PASSWORD     — hasło właściciela
 *   FORM_TOKEN   — (opcjonalne) token do testu publicznego formularza
 *                  utwórz ręcznie: INSERT INTO client_forms (client_id, form_template_id, salon_id, fill_token) VALUES (...)
 *
 * Uruchomienie:
 *   APP_URL=https://... SALON_SLUG=... EMAIL=... PASSWORD=... node scripts/manus-test-a-forms.mjs
 *
 * Polling wyników:
 *   node scripts/manus-poll.mjs <taskId>
 */

import https from 'https';

const API_KEY = 'sk-nMQgGpJP02XX_6pacyELgodtqSE2FOdgxSQjr42vguSImpgQe7cy09r4OspHrM8bX15bUzBysisphWzolw_CIPYXDU7U';

const APP_URL   = process.env.APP_URL   || 'http://localhost:3000';
const SLUG      = process.env.SALON_SLUG || 'UZUPELNIJ_SLUG';
const EMAIL     = process.env.EMAIL      || 'UZUPELNIJ_EMAIL';
const PASSWORD  = process.env.PASSWORD   || 'UZUPELNIJ_HASLO';
const FORM_TOKEN = process.env.FORM_TOKEN || '';

const DASHBOARD = `${APP_URL}/${SLUG}`;

const prompt = `
You are a QA tester for a SaaS salon management app called SimpliSalonCloud.
Test the FORMS module end-to-end. Complete every step, report PASS/FAIL for each.

## CREDENTIALS
- App URL: ${APP_URL}
- Login page: ${APP_URL}/login
- Email: ${EMAIL}
- Password: ${PASSWORD}
- Salon dashboard base: ${DASHBOARD}

---

## STEP 1 — Login
1. Navigate to ${APP_URL}/login
2. Enter email: ${EMAIL}
3. Enter password: ${PASSWORD}
4. Click the login/submit button
5. Wait for redirect to dashboard (URL should contain "/${SLUG}/")
EXPECTED: Successfully logged in, dashboard visible
REPORT: ✅ PASS or ❌ FAIL with error message

---

## STEP 2 — Navigate to Forms Templates
1. Navigate to ${DASHBOARD}/forms/templates
2. Wait for the page to load
3. Note whether any existing templates are listed
EXPECTED: Page loads without error, shows template list (may be empty)
REPORT: ✅ PASS or ❌ FAIL

---

## STEP 3 — Create a new form template
1. Click the button to create a new template (look for "Nowy szablon", "Dodaj", "+" or similar)
2. Fill in the form name: "TEST_FORM_E2E_${Date.now()}"
3. Add the following fields (use "Dodaj pole" or similar button):
   a. Field type "text" (or "Tekst"), label: "Imię i nazwisko", mark as required
   b. Field type "radio" (or "Jednokrotny wybór"), label: "Czy masz alergie?", options: "Tak", "Nie", mark as required
   c. Field type "textarea" (or "Długi tekst"), label: "Dodatkowe uwagi", NOT required
   d. Field type "checkbox" (or "Pole wyboru"), label: "Wyrażam zgodę na przetwarzanie danych", mark as required
4. Enable "Wymaga podpisu" (Requires signature) toggle if visible
5. Click Save / Zapisz
EXPECTED: Template saved, appears in the list with name "TEST_FORM_E2E_..."
REPORT: ✅ PASS or ❌ FAIL — describe what happened

---

## STEP 4 — Preview the created template
1. Find the template "TEST_FORM_E2E_..." in the list
2. Click the Preview button (look for "Podgląd", eye icon, or preview action)
3. Verify the preview shows:
   - The form name
   - All 4 fields with correct labels
   - A signature section (if enabled)
4. Close the preview dialog
EXPECTED: Preview dialog shows correct fields
REPORT: ✅ PASS or ❌ FAIL — list which fields were visible

---

## STEP 5 — Edit the template
1. Open the template for editing (look for "Edytuj", pencil icon, or edit action)
2. Add one more field: type "date" (or "Data"), label: "Data urodzenia"
3. Save the template
4. Verify the template now shows 5 fields in the list or preview
EXPECTED: Template updated with new field
REPORT: ✅ PASS or ❌ FAIL

---

## STEP 6 — View submissions page
1. Navigate to ${DASHBOARD}/forms/submissions
2. Wait for the page to load
3. Note: list may be empty if no forms were submitted yet
4. Verify: page loads, shows table headers, no crash
EXPECTED: Submissions page loads without error
REPORT: ✅ PASS or ❌ FAIL

---

${FORM_TOKEN ? `
## STEP 7 — Fill public form (client-side) — TOKEN PROVIDED
A test token has been provided: ${FORM_TOKEN}

1. Navigate to ${APP_URL}/forms/fill/${FORM_TOKEN}
2. Wait for the form to load
3. Verify the form shows: salon name, client name (if available), form title, fields
4. Fill in all required fields with test data:
   - Text fields: "Jan Kowalski Test"
   - Radio: select the first option
   - Checkboxes: check all that are labeled as consent/required
   - Date fields: enter "1990-01-15"
   - Textarea: "Brak uwag — test E2E"
5. If signature field is present: draw a simple line signature
6. Click Submit / Wyślij
EXPECTED: Success message shown (e.g. "Dziękujemy" or "Formularz wypełniony")
REPORT: ✅ PASS or ❌ FAIL

## STEP 8 — Try to submit the same form again (idempotency)
1. Navigate to the same URL: ${APP_URL}/forms/fill/${FORM_TOKEN}
2. Attempt to submit again or just check what the page shows
EXPECTED: Page shows "Formularz już wypełniony" or "already submitted" or a 409/410 status indicator
REPORT: ✅ PASS or ❌ FAIL

## STEP 9 — Verify submission in dashboard
1. Navigate to ${DASHBOARD}/forms/submissions
2. Look for the recently submitted form in the list
3. Verify it shows: client name (or anonymous), form name, submission date, status
EXPECTED: Submission appears in the list
REPORT: ✅ PASS or ❌ FAIL
` : `
## STEP 7 — Public form test (SKIPPED — no FORM_TOKEN provided)
To test public form filling, provide FORM_TOKEN env variable.
Insert a test record first:
  INSERT INTO client_forms (client_id, form_template_id, salon_id, fill_token)
  VALUES ('[client_id]', '[template_id]', '[salon_id]', 'test-token-abc123');
Then re-run: FORM_TOKEN=test-token-abc123 node scripts/manus-test-a-forms.mjs
REPORT: ⏭ SKIPPED
`}

---

## FINAL REPORT
At the end, output a summary table:

| Step | Description | Result | Notes |
|------|-------------|--------|-------|
| 1 | Login | ✅/❌ | |
| 2 | Forms templates page loads | ✅/❌ | |
| 3 | Create new template with 4 fields | ✅/❌ | |
| 4 | Preview template | ✅/❌ | |
| 5 | Edit template (add date field) | ✅/❌ | |
| 6 | Submissions page loads | ✅/❌ | |
| 7 | Public form fill | ✅/❌/⏭ | |
| 8 | Double-submit blocked | ✅/❌/⏭ | |
| 9 | Submission visible in dashboard | ✅/❌/⏭ | |

OVERALL: X/Y tests passed
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
console.log(`\nPoll for results:`);
console.log(`  node scripts/manus-poll.mjs ${taskId}`);
console.log(`\nFull response:`, JSON.stringify(parsed, null, 2));
