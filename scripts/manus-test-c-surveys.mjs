/**
 * Manus E2E Test — BLOK C: Ankiety po wizycie (publiczny + dashboard)
 *
 * Zmienne środowiskowe:
 *   APP_URL         — np. https://simplisaloncloud.vercel.app
 *   SALON_SLUG      — slug salonu, np. "testowy-salon"
 *   EMAIL           — login właściciela (do testu dashboardu)
 *   PASSWORD        — hasło właściciela
 *   SURVEY_TOKEN    — token z SMS-a (po ręcznym wywołaniu CRONa)
 *   EXPIRED_TOKEN   — (opcjonalne) token z wygasłą datą
 *
 * Przygotowanie przed uruchomieniem:
 *   1. Ustaw wizytę testową jako zakończoną 2.5h temu:
 *      UPDATE bookings SET
 *        status = 'completed', survey_sent = false,
 *        date = CURRENT_DATE,
 *        start_time = (NOW() - INTERVAL '2.5 hours')::TIME,
 *        end_time = (NOW() - INTERVAL '2 hours')::TIME
 *      WHERE id = '[booking_id]';
 *
 *   2. Wywołaj CRON ręcznie:
 *      curl -sk -H "Authorization: Bearer [CRON_SECRET]" [APP_URL]/api/cron/surveys
 *
 *   3. Odbierz SMS, skopiuj token z URL /survey/[token]
 *
 *   4. Uruchom:
 *      APP_URL=... SALON_SLUG=... EMAIL=... PASSWORD=... SURVEY_TOKEN=... node scripts/manus-test-c-surveys.mjs
 *
 * Polling wyników:
 *   node scripts/manus-poll.mjs <taskId>
 */

import https from 'https';

const API_KEY = 'sk-nMQgGpJP02XX_6pacyELgodtqSE2FOdgxSQjr42vguSImpgQe7cy09r4OspHrM8bX15bUzBysisphWzolw_CIPYXDU7U';

const APP_URL       = process.env.APP_URL       || 'http://localhost:3000';
const SLUG          = process.env.SALON_SLUG    || 'UZUPELNIJ_SLUG';
const EMAIL         = process.env.EMAIL         || 'UZUPELNIJ_EMAIL';
const PASSWORD      = process.env.PASSWORD      || 'UZUPELNIJ_HASLO';
const SURVEY_TOKEN  = process.env.SURVEY_TOKEN  || '';
const EXPIRED_TOKEN = process.env.EXPIRED_TOKEN || '';

if (!SURVEY_TOKEN) {
  console.error('❌ Brak SURVEY_TOKEN. Wywołaj CRON, odbierz SMS i podaj token.');
  console.error('   Przykład: SURVEY_TOKEN=abc123 ... node scripts/manus-test-c-surveys.mjs');
  process.exit(1);
}

const DASHBOARD   = `${APP_URL}/${SLUG}`;
const SURVEY_URL  = `${APP_URL}/survey/${SURVEY_TOKEN}`;

const prompt = `
You are a QA tester for a SaaS salon management app called SimpliSalonCloud.
Test the SURVEYS module end-to-end: public survey page AND dashboard settings/reports.
Complete every step, report PASS/FAIL.

## CREDENTIALS (for dashboard sections)
- App URL: ${APP_URL}
- Login page: ${APP_URL}/login
- Email: ${EMAIL}
- Password: ${PASSWORD}
- Salon dashboard: ${DASHBOARD}
- Survey URL: ${SURVEY_URL}

---

## PART 1 — Public Survey (no login needed)

### STEP 1 — Load the survey page
1. Navigate to: ${SURVEY_URL}
2. Wait for the page to fully load (up to 10 seconds)
3. Check what is displayed:
   - Is the page title or salon name visible?
   - Is a 5-star rating widget visible?
   - Is a 0–10 NPS scale visible?
   - Is a comment/textarea visible?
EXPECTED: Survey form loads with star rating, NPS scale (0–10), comment field
REPORT: ✅ PASS or ❌ FAIL — describe exactly what elements are visible

---

### STEP 2 — Validate NPS color coding
1. Look at the NPS scale (numbers 0 through 10)
2. Check visual styling:
   - Numbers 0–6: should appear RED or orange (detractors)
   - Numbers 7–8: should appear YELLOW (passives)
   - Numbers 9–10: should appear GREEN (promoters)
EXPECTED: Color coding is applied (red/yellow/green gradient)
REPORT: ✅ PASS or ❌ FAIL — note the actual colors observed

---

### STEP 3 — Submit survey with maximum positive scores
1. Click the 5-star rating (highest rating)
2. Click "9" or "10" on the NPS scale (promoter range, green)
3. In the comment field, type: "Doskonała obsługa — test E2E automatyczny, bardzo polecam"
4. Click the Submit button ("Wyślij", "Oceń nas", "Zapisz" or similar)
5. Wait for response
EXPECTED: Success message shown — should contain "Dziękujemy" / "Twoja opinia" / "Thank you"
REPORT: ✅ PASS or ❌ FAIL — copy the exact success message

---

### STEP 4 — Try to submit again (idempotency)
1. Navigate AGAIN to: ${SURVEY_URL}
2. Wait for the page to load
3. Note what is shown
EXPECTED: "Ankieta już wypełniona" / "already filled" / form NOT editable again
REPORT: ✅ PASS or ❌ FAIL — copy the exact message shown

---

### STEP 5 — Invalid token test
1. Navigate to: ${APP_URL}/survey/invalid-token-xyz-does-not-exist
2. Wait for the page to load
EXPECTED: Error message — "Nieprawidłowy link" / "Nie znaleziono ankiety" / 404 indicator
REPORT: ✅ PASS or ❌ FAIL

---

${EXPIRED_TOKEN ? `
### STEP 6 — Expired token test
1. Navigate to: ${APP_URL}/survey/${EXPIRED_TOKEN}
2. Wait for the page to load
EXPECTED: "Link wygasł" / "Ankieta wygasła" / 410 indicator
REPORT: ✅ PASS or ❌ FAIL — copy exact message
` : `
### STEP 6 — Expired token test (SKIPPED — no EXPIRED_TOKEN provided)
To test: UPDATE satisfaction_surveys SET fill_token_exp = NOW() - INTERVAL '1 hour' WHERE fill_token = '[other_token]';
REPORT: ⏭ SKIPPED
`}

---

## PART 2 — Dashboard (requires login)

### STEP 7 — Login
1. Navigate to ${APP_URL}/login
2. Enter email: ${EMAIL}, password: ${PASSWORD}
3. Click login
EXPECTED: Redirected to dashboard
REPORT: ✅ PASS or ❌ FAIL

---

### STEP 8 — Survey settings per service
1. Navigate to ${DASHBOARD}/settings/surveys
2. Wait for the page to load
3. Check that the page shows:
   - A list of services grouped by category
   - Each service has a toggle for enabling/disabling surveys
   - Each service has a custom message text field (optional)
4. Find any one service and:
   a. DISABLE its survey toggle (turn it OFF)
   b. Wait for save confirmation (auto-save or click Save)
   c. Reload the page
   d. Verify the toggle is still OFF
5. Re-enable the toggle (turn it back ON)
   a. Wait for save confirmation
   b. Reload to verify it's ON again
EXPECTED: Toggle state persists across page reload
REPORT: ✅ PASS or ❌ FAIL — note the service name used for testing

---

### STEP 9 — Custom survey message
1. Still on ${DASHBOARD}/settings/surveys
2. Find any service and expand/click its custom message field
3. Enter a custom message: "Oceń naszą usługę! {{url}}"
   (Note: {{url}} is a placeholder that gets replaced with the survey link)
4. Save (auto-save or click Save button)
5. Reload the page
6. Verify the custom message persists
EXPECTED: Custom message saved and visible after reload
REPORT: ✅ PASS or ❌ FAIL

---

### STEP 10 — NPS reports page
1. Navigate to ${DASHBOARD}/reports
2. Look for an NPS tab, section, or link — click it if available
3. Check what is displayed:
   - Overall NPS score (number between -100 and +100)
   - Chart or breakdown by date
   - Total number of responses
4. Verify the data appears (should include the response from STEP 3)
5. If there are date filters, try: set "from" to 7 days ago, "to" to today → apply
6. Verify filtered results still show data
EXPECTED: Reports page loads with NPS data, recent submission visible
REPORT: ✅ PASS or ❌ FAIL — note the NPS score and response count shown

---

## FINAL REPORT
Output a summary table:

| Step | Description | Result | Notes |
|------|-------------|--------|-------|
| 1 | Survey page loads | ✅/❌ | list elements found |
| 2 | NPS color coding | ✅/❌ | colors observed |
| 3 | Survey submits (5★, NPS=9) | ✅/❌ | copy success msg |
| 4 | Double-submit blocked | ✅/❌ | copy message |
| 5 | Invalid token handled | ✅/❌ | |
| 6 | Expired token handled | ✅/❌/⏭ | |
| 7 | Dashboard login | ✅/❌ | |
| 8 | Survey toggle per service | ✅/❌ | service name used |
| 9 | Custom message persists | ✅/❌ | |
| 10 | NPS reports show data | ✅/❌ | score + count |

OVERALL: X/Y tests passed

Also note any UI bugs, slow loads (>3s), or unexpected behaviors.
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
console.log(`\nTested survey URL: ${SURVEY_URL}`);
console.log(`\nPoll for results:`);
console.log(`  node scripts/manus-poll.mjs ${taskId}`);
console.log(`\nFull response:`, JSON.stringify(parsed, null, 2));
