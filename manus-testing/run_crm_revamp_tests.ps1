# ============================================================
# CRM Revamp - Manus Test Suite (Sprint 01-08)
# Uruchamia 6 tasków testowych równolegle
# Wyniki zapisuje do manus-testing/wyniki_testu_*.json
# ============================================================

$apiKey  = "sk-nMQgGpJP02XX_6pacyELgodtqSE2FOdgxSQjr42vguSImpgQe7cy09r4OspHrM8bX15bUzBysisphWzolw_CIPYXDU7U"
$apiUrl  = "https://api.manus.ai/v1/tasks"
$appUrl  = "https://simplisaloncloud.vercel.app"
$email   = "bartosz.rogala@yahoo.pl"
$pass    = "Tmp!rTC8-OLa"

$headers = @{
    "API_KEY"      = $apiKey
    "Content-Type" = "application/json"
}

# ============================================================
# Definicje tasków
# ============================================================

$tasks = @(

    # ----------------------------------------------------------
    # TASK 1 — Sprint 01: Billing & SMS Wallet
    # ----------------------------------------------------------
    @{
        name   = "Sprint01_Billing"
        profile = "manus-1.6"
        prompt = @"
Log in to SimpliSalonCloud at $appUrl/login with email '$email' and password '$pass'.
Navigate to 'Subskrypcja' (Billing/Subscription) in the sidebar.

TEST 1 — Current plan display:
Verify the billing page loads and shows: current plan name (Starter / Professional / Business / Enterprise), status badge (active / trialing / past_due / canceled), and current billing period dates. All labels must be in Polish. Report any English text visible to the user.

TEST 2 — Usage bars / limits:
Verify that usage bars are displayed showing limits (e.g., number of employees, clients, SMS balance). Each bar must show a numeric value and a maximum. Check whether the bars update correctly when navigating to this page.

TEST 3 — SMS Wallet section:
Scroll the billing page and look for an SMS wallet / portmonetka SMS section. Verify it shows:
(a) Current SMS balance (numeric value, e.g. '0 SMS'),
(b) A 'Doplata' or 'Zakup SMS' button to top up,
(c) If present, click the top-up button — verify it opens a payment or purchase dialog without errors.
If the SMS wallet section is missing entirely, mark as FAIL with severity HIGH.

TEST 4 — Invoices list:
Look for a 'Faktury' (Invoices) section or tab on the billing page. Verify that either a list of invoices appears (with date, amount, status columns) or an empty state in Polish ('Brak faktur' or similar). If the section is completely absent, mark as FAIL.

TEST 5 — Upgrade / plan change:
Verify that buttons for upgrading the plan are present (e.g., 'Zmien plan', 'Ulepsz'). Click one — a modal or redirect to a payment flow should occur. Do NOT complete any real payment. Verify the flow starts correctly.

TEST 6 — Dunning banner (if plan is past_due):
If the account is in 'past_due' status, a warning banner must appear at the top of the dashboard (not just on billing page) in Polish, informing the user about a payment issue. If account is active, skip this test and note it was skipped.

Report: PASS/FAIL per test, exact UI text for any failures, severity (CRITICAL/HIGH/MED/LOW).
"@
    },

    # ----------------------------------------------------------
    # TASK 2 — Sprint 03: Equipment Management
    # ----------------------------------------------------------
    @{
        name   = "Sprint03_Equipment"
        profile = "manus-1.6"
        prompt = @"
Log in to SimpliSalonCloud at $appUrl/login with email '$email' and password '$pass'.
Navigate to Settings (Ustawienia) in the sidebar, then look for 'Sprzet' (Equipment) sub-section.

TEST 1 — Equipment settings page:
Verify the equipment settings page loads at /settings/equipment (or equivalent). If the page does not exist or returns 404, mark as CRITICAL FAIL and stop tests 2-5.

TEST 2 — Equipment list:
Verify the page shows a list of equipment items (or an empty state in Polish). Each item should show: name, type/category, status (active/inactive). Check that all labels are in Polish.

TEST 3 — Add new equipment:
Click the 'Dodaj sprzet' (Add Equipment) button. A form dialog should open with fields:
- Name (required)
- Type / category (e.g., laser, fotel, urzadzenie)
- Status toggle (active/inactive)
Fill in valid data and save. Verify the item appears in the list.

TEST 4 — Edit equipment:
Click on an existing equipment item to edit it. Change the name. Save and verify the update is reflected in the list.

TEST 5 — Assign equipment to service:
Navigate to 'Uslugi' (Services). Open a service's edit form. Look for an 'Equipment' or 'Sprzet' section where you can assign required equipment to that service. If this section exists:
(a) Assign one equipment item to the service,
(b) Save,
(c) Verify the assignment is saved.
If the section is absent, mark as HIGH FAIL (integration between service and equipment not implemented in UI).

TEST 6 — Booking collision check:
Create a new booking for a service that has equipment assigned (from Test 5). Navigate to Calendar and create a second overlapping booking for the same time slot. Verify that either:
(a) The system shows a warning about equipment conflict, OR
(b) One of the bookings shows a conflict badge.
If no collision detection is present, mark as HIGH.

Report: PASS/FAIL per test, exact error messages, severity.
"@
    },

    # ----------------------------------------------------------
    # TASK 3 — Sprint 05: Medical Forms & Beauty Plans
    # ----------------------------------------------------------
    @{
        name   = "Sprint05_MedicalForms"
        profile = "manus-1.6"
        prompt = @"
Log in to SimpliSalonCloud at $appUrl/login with email '$email' and password '$pass'.
Navigate to Settings (Ustawienia), then look for 'Formularze' (Forms) or 'Karty zabiegowe' sub-section.

TEST 1 — Form templates page:
Verify the forms settings page loads. If absent (404 or no navigation item), mark as CRITICAL FAIL.

TEST 2 — Create a form template:
Click 'Nowy formularz' (New Form). A form builder UI should appear with:
(a) Template name field,
(b) Ability to add fields (text, checkbox, select, signature),
(c) GDPR consent text option,
(d) 'Wymaga podpisu' (requires signature) toggle.
Add at least 2 fields (one text, one checkbox). Save the template. Verify it appears in the list.

TEST 3 — Assign form to service:
Navigate to 'Uslugi' (Services). Edit a service. Look for a 'Formularze' section. Assign the template created in Test 2. Save and verify.

TEST 4 — Public form link:
Go back to form templates. Find a way to generate a public link / preview for a filled form. A URL like /forms/[token] should be accessible. Open that URL in a new tab (or navigate to it). Verify the public form page loads WITHOUT being logged in context — it should show the form fields, not the dashboard.

TEST 5 — Beauty Plans:
Navigate to a client's profile page (Klienci -> click a client). Look for a 'Beauty Plan' or 'Plan zabiegowy' tab or section. Verify it either shows existing beauty plans or an 'Add plan' button. If this section is completely absent from the client profile, mark as HIGH FAIL.

TEST 6 — Client form history:
On the same client profile, look for a 'Formularze' tab showing submitted forms. Verify it loads (empty state is acceptable). If this tab is absent, mark as MED.

Report: PASS/FAIL per test, exact UI text, severity.
"@
    },

    # ----------------------------------------------------------
    # TASK 4 — Sprint 06: SMS Chat & Reminders
    # ----------------------------------------------------------
    @{
        name   = "Sprint06_SMSChat"
        profile = "manus-1.6"
        prompt = @"
Log in to SimpliSalonCloud at $appUrl/login with email '$email' and password '$pass'.
Navigate to 'Klienci' (Clients) in the sidebar.

TEST 1 — SMS Chat tab in client profile:
Click on any client row to open their profile. Look for a 'SMS' or 'Wiadomosci' tab in the client profile. Verify it loads a chat-style interface showing message history (outbound and inbound). If the tab is absent, mark as CRITICAL FAIL.

TEST 2 — Send SMS from chat:
In the SMS chat tab, find the message input field at the bottom. Type a test message: 'Test wiadomosci SMS z CRM'. Click 'Wyslij'. Verify:
(a) The button shows a loading/sending state briefly,
(b) The message appears in the chat thread as 'outbound',
(c) A success or error toast appears in Polish.
If the send fails with a balance error (insufficient SMS credits), note this as expected behavior and NOT a bug.

TEST 3 — SMS settings:
Navigate to Settings -> SMS (or Ustawienia -> SMS). Verify the SMS settings page loads with:
(a) SMS provider configuration (SMSAPI credentials),
(b) Sender name field,
(c) Reminder templates (szablon przypomnienia) — at least one default template,
(d) Reminder timing options (e.g., send 24h before, 2h before).
Report any missing sections.

TEST 4 — Booking confirmation link:
Create a new booking in the Calendar. After saving, check if there is a 'Wyslij potwierdzenie' button or if a confirmation SMS was sent. Verify the booking confirmation feature exists (button or automatic). Navigate to /api/bookings/confirm/[token] or check if such functionality is referenced in the UI.

TEST 5 — CRM campaign (Last-minute slots):
Navigate to CRM -> Kampanie (Campaigns). Look for a campaign type 'Zlote Terminy' or 'Last-minute'. Verify you can:
(a) Create a campaign targeting free slots,
(b) Set a message template,
(c) See a preview of recipients.
If this campaign type is absent, mark as MED.

Report: PASS/FAIL per test, exact messages, severity.
"@
    },

    # ----------------------------------------------------------
    # TASK 5 — Sprint 07: Blacklist CRM & No-Show Scoring
    # ----------------------------------------------------------
    @{
        name   = "Sprint07_Blacklist"
        profile = "manus-1.6"
        prompt = @"
Log in to SimpliSalonCloud at $appUrl/login with email '$email' and password '$pass'.

TEST 1 — Blacklist status badge in client list:
Navigate to 'Klienci' (Clients). Scan the client list for any visual indicator (badge, icon, color row) showing blacklist status. If any client has blacklist_status = 'warned' or 'blacklisted', verify the badge is visible and labeled in Polish. If no clients are blacklisted (empty state), this test passes as N/A.

TEST 2 — Client violations history:
Open any client's profile. Look for a 'Naruszenia' (Violations) or 'No-show' section/tab. Verify it either shows a list of violations (date, type: no_show/late_cancel) or an empty state in Polish. If the section is completely absent, mark as HIGH FAIL.

TEST 3 — Manual blacklist action:
On a client profile, look for a 'Dodaj do czarnej listy' (Add to blacklist) button or a status change dropdown. Verify that:
(a) The button/control exists,
(b) Clicking it shows a confirmation dialog in Polish,
(c) After confirming, the client's status badge changes to 'blacklisted'.
Do NOT blacklist a client that has real bookings — use a test client or cancel immediately.

TEST 4 — Blacklist CRM settings:
Navigate to Settings (Ustawienia). Look for a 'CRM' sub-section or 'Czarna lista' settings. Verify that threshold configuration fields exist:
(a) No-show count threshold (e.g., 3 no-shows triggers warning),
(b) Warning-to-blacklist threshold,
(c) Save button.
If these settings are absent, mark as MED.

TEST 5 — No-show booking flow:
Navigate to Calendar. Find or create a booking. Change its status to 'No-show' (brak pojawienia sie). Verify:
(a) Status changes correctly,
(b) The client's no_show_count increments (visible in client profile),
(c) If the threshold was reached, check that the client's blacklist_status changed.
Note: CRON scoring runs daily, so threshold upgrade might not happen immediately — that is expected.

Report: PASS/FAIL per test, exact UI text, severity.
"@
    },

    # ----------------------------------------------------------
    # TASK 6 — Sprint 08: Surveys & Reports
    # ----------------------------------------------------------
    @{
        name   = "Sprint08_SurveysReports"
        profile = "manus-1.6"
        prompt = @"
Log in to SimpliSalonCloud at $appUrl/login with email '$email' and password '$pass'.

TEST 1 — Reports dashboard:
Navigate to 'Raporty' (Reports) in the sidebar. Verify the page loads and shows (or empty-state for each):
(a) NPS score chart / gauge,
(b) Revenue over time chart,
(c) Top services ranking table,
(d) Month/date range picker to filter data.
All labels must be in Polish. Report any English text.

TEST 2 — Revenue report:
On the reports page, find the revenue report section. Verify:
(a) A chart or table shows revenue per period,
(b) A 'Pobierz CSV' (Download CSV) button exists,
(c) Clicking the CSV button triggers a file download (browser download dialog or file appears).
If the CSV export is absent, mark as MED.

TEST 3 — NPS report:
Verify the NPS section shows:
(a) NPS score (a number between -100 and 100),
(b) Breakdown: Promoters / Passives / Detractors counts or percentages,
(c) Recent survey comments (if any submitted).

TEST 4 — Top services report:
Verify a table or bar chart shows services ranked by revenue or booking count. Each row should show: service name, bookings count, total revenue in PLN.

TEST 5 — Public survey page:
Navigate directly to $appUrl/survey/test-token-that-does-not-exist. Verify the page:
(a) Loads (does not show 500 error),
(b) Shows an appropriate error in Polish ('Ankieta nie istnieje', 'Nieprawidlowy link', or similar).
This tests that the public survey page route exists even if the token is invalid.

TEST 6 — Survey sent after booking completion:
Create a booking in Calendar. Mark it as 'Zakonczone' (Completed). Navigate to the client's profile. Look for a 'Ankieta' (Survey) indicator showing that a survey was scheduled or sent. Note: actual sending happens via CRON 2h after completion, so immediate visible feedback may be limited — check if a 'survey_scheduled' badge or timestamp is shown.

Report: PASS/FAIL per test, exact values/text observed, severity. Include screenshots descriptions of charts where relevant.
"@
    }
)

# ============================================================
# Wysylanie zadań i zbieranie task_id
# ============================================================

$submitted = @()

foreach ($task in $tasks) {
    Write-Host "`n[$(Get-Date -Format 'HH:mm:ss')] Wysylanie: $($task.name)..." -ForegroundColor Cyan

    $body = @{
        prompt       = $task.prompt
        agentProfile = $task.profile
    } | ConvertTo-Json -Depth 5

    try {
        $resp = Invoke-RestMethod -Uri $apiUrl -Method Post -Headers $headers -Body $body
        Write-Host "  OK - task_id: $($resp.task_id)  url: $($resp.task_url)" -ForegroundColor Green
        $submitted += @{
            name   = $task.name
            taskId = $resp.task_id
            url    = $resp.task_url
            status = "running"
        }
    }
    catch {
        Write-Host "  BLAD wysylania $($task.name): $($_.Exception.Message)" -ForegroundColor Red
    }

    Start-Sleep -Seconds 2  # drobny throttle
}

Write-Host "`n========================================" -ForegroundColor Yellow
Write-Host "Wyslano $($submitted.Count) z $($tasks.Count) tasków." -ForegroundColor Yellow
Write-Host "Czekam na zakonczenie (polling co 30s)..." -ForegroundColor Yellow
Write-Host "========================================`n" -ForegroundColor Yellow

# ============================================================
# Polling az wszystkie skonczone
# ============================================================

$finished = @{}

while ($finished.Count -lt $submitted.Count) {

    Start-Sleep -Seconds 30

    foreach ($t in $submitted) {
        if ($finished.ContainsKey($t.taskId)) { continue }

        $statusUrl = "$apiUrl/$($t.taskId)"
        try {
            $sr = Invoke-RestMethod -Uri $statusUrl -Method Get -Headers $headers
            $st = $sr.status

            $color = if ($st -match 'success|completed|done') { 'Green' } elseif ($st -match 'failed|error') { 'Red' } else { 'Gray' }
            Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $($t.name): $st" -ForegroundColor $color

            if ($st -match 'success|completed|done|failed|error') {
                $finished[$t.taskId] = $true

                $outFile = "d:\SimpliSalonCLoud\manus-testing\wyniki_crm_$($t.name)_$($t.taskId).json"
                $sr | ConvertTo-Json -Depth 10 | Out-File -FilePath $outFile -Encoding UTF8
                Write-Host "  => Zapisano: $outFile" -ForegroundColor Cyan

                if ($sr.result -and $sr.result.summary) {
                    Write-Host "`n  SUMMARY ($($t.name)):" -ForegroundColor Magenta
                    Write-Host $sr.result.summary
                }
            }
        }
        catch {
            Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $($t.name): blad pollingu - $($_.Exception.Message)" -ForegroundColor DarkRed
        }
    }
}

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "Wszystkie testy zakonczone!" -ForegroundColor Green
Write-Host "Wyniki w: d:\SimpliSalonCLoud\manus-testing\" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
