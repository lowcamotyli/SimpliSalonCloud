$apiKey = "sk-nMQgGpJP02XX_6pacyELgodtqSE2FOdgxSQjr42vguSImpgQe7cy09r4OspHrM8bX15bUzBysisphWzolw_CIPYXDU7U"
$apiUrl = "https://api.manus.ai/v1/tasks"

# UWAGA: Manus AI jako agent chmurowy nie ma dostepu do Twojego localhost.
# Musisz wystawic aplikacje na zewnatrz uzywajac np. ngrok (ngrok http 3000)
# i wpisac tutaj wygenerowany publiczny adres URL.
$appUrl = "https://simplisaloncloud.vercel.app"
$testEmail = "bartosz.rogala@yahoo.pl"
$testPass = "Tmp!rTC8-OLa"

if ($appUrl -match "localhost") {
    Write-Host "BLAD: Zmien `$appUrl na publiczny adres z ngrok. Manus nie odczyta localhost!" -ForegroundColor Red
    exit 1
}

$prompt = @"
Zaloguj sie do SimpliSalonCloud pod adresem $appUrl/login uzywajac email '$testEmail' i hasla '$testPass'.

CEL: wykonaj test integracji Booksy uruchamiany WYlACZNIE przez maile (symulowane maile Booksy), bez recznego tworzenia wizyt.

KRYTYCZNA ZASADA WYKONANIA:
- NIE debuguj Supabase bezposrednio.
- NIE instaluj bibliotek SMTP.
- NIE szukaj losowych endpointow.
- Uzyj tylko ponizszej kontrolowanej sciezki testowej opartej o endpoint:
  POST $appUrl/api/webhooks/booksy/test

Dlaczego tak:
- ten endpoint jest w aplikacji i wymaga tylko zalogowanej sesji,
- pozwala podac wlasne maile testowe (subject/body/id),
- uruchamia ten sam procesor Booksy co sync.

Kroki techniczne:
1) Zaloguj sie do aplikacji.
2) Otworz DevTools Console na stronie aplikacji i wywoluj fetch z credentials: 'include'.
3) Przed testami zapisz baseline:
   - kalendarz (screenshot),
   - GET $appUrl/api/integrations/booksy/logs
4) Po kazdym tescie sprawdz:
   - odpowiedz endpointu testowego,
   - kalendarz,
   - GET $appUrl/api/integrations/booksy/logs,
   - GET $appUrl/api/integrations/booksy/pending?status=all

PAYLOAD A (NOWA REZERWACJA - musi przejsc):
{
  "emails": [
    {
      "id": "evt-booksy-new-001",
      "subject": "Anna Kowalska: nowa rezerwacja",
      "body": "Anna Kowalska\n123456789\nanna@example.com\n\nStrzyzenie damskie wl. srednie\n250,00 zl\n\n27 pazdziernika 2026, 16:00 - 17:00\n\nPracownik: Kasia\n\nZarzadzaj swoimi rezerwacjami w aplikacji Booksy"
    }
  ]
}

PAYLOAD B (ZMIANA REZERWACJI - test mail-triggered update):
{
  "emails": [
    {
      "id": "evt-booksy-change-001",
      "subject": "Anna Kowalska: zmienil rezerwacje",
      "body": "Anna Kowalska\n123456789\nanna@example.com\n\nStrzyzenie damskie wl. srednie\n250,00 zl\n\nz dnia 27 pazdziernika 2026 16:00\nna 28 pazdziernika 2026, 14:00 - 15:00\n\nPracownik: Kasia\n\nZarzadzaj swoimi rezerwacjami w aplikacji Booksy"
    }
  ]
}

PAYLOAD C (ANULOWANIE - test mail-triggered cancel):
{
  "emails": [
    {
      "id": "evt-booksy-cancel-001",
      "subject": "Anna Kowalska: odwolala wizyte",
      "body": "Anna Kowalska\n123456789\nanna@example.com\n\nStrzyzenie damskie wl. srednie\n250,00 zl\n\n28 pazdziernika 2026, 14:00 - 15:00\n\nPracownik: Kasia\n\nKlient odwolal wizyte w aplikacji Booksy"
    }
  ]
}

WYWOlANIE (w konsoli):
await fetch('$appUrl/api/webhooks/booksy/test', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify(PAYLOAD_X)
}).then(r => r.json())

KRYTERIA OCENY:
Test A - CREATE:
- Endpoint zwraca success=true i wynik przetwarzania maila.
- Wizyta pojawia sie jako source=booksy.
- Brak duplikatu po ponownym wyslaniu dokladnie tego samego event id.

Test B - CHANGE:
- Sprawdz czy mail typu zmiana aktualizuje istniejaca wizyte.
- Jesli nie aktualizuje, oznacz jako FAIL i bug krytyczny dla flow mailowego Booksy.

Test C - CANCEL:
- Sprawdz czy mail typu anulacja ustawia status anulowana.
- Jesli nie ustawia, oznacz jako FAIL i bug krytyczny dla flow mailowego Booksy.

Test D - IDEMPOTENCJA:
- Wyslij ponownie PAYLOAD A z tym samym id (evt-booksy-new-001).
- Oczekiwane: brak nowej wizyty (deduplikacja).

Raport koncowy:
1) PASS/FAIL dla A/B/C/D.
2) Dla kazdego FAIL: kroki, payload, odpowiedz endpointu, obserwacja w kalendarzu i logs.
3) Lista bugow z priorytetem:
   - Krytyczny: brak obslugi create/change/cancel z maila, duplikacja, zly status.
   - Wysoki: rozjazd miedzy endpoint response a UI/logs.
4) Rekomendacja Go/No-Go na jutro.

Wynik ma byc techniczny, konkretny, oparty tylko o zaobserwowane fakty.
"@

$body = @{
    prompt       = $prompt
    agentProfile = "manus-1.6"
} | ConvertTo-Json

$headers = @{
    "API_KEY"      = $apiKey
    "Content-Type" = "application/json"
}

Write-Host "Wysylanie zadania testowego do Manus API..." -ForegroundColor Cyan

try {
    $response = Invoke-RestMethod -Uri $apiUrl -Method Post -Headers $headers -Body $body
    Write-Host "Zadanie utworzone pomyslnie!" -ForegroundColor Green

    $taskId = $response.task_id
    Write-Host "ID Zadania: $taskId"
    Write-Host "Tytul: $($response.task_title)"
    Write-Host "URL do sledzenia: $($response.task_url)"

    Write-Host "`nOczekiwanie na zakonczenie testu (moze to potrwac kilka minut)..." -ForegroundColor Yellow

    $isFinished = $false
    $taskStatusUrl = "$apiUrl/$taskId"

    while (-not $isFinished) {
        Start-Sleep -Seconds 15
        $statusResponse = Invoke-RestMethod -Uri $taskStatusUrl -Method Get -Headers $headers

        $currentStatus = $statusResponse.status
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Aktualny status: $currentStatus"

        # Manus API typowo zwraca statusy: running, success, failed, error, completed, done
        if ($currentStatus -match 'success|failed|error|completed|done') {
            $isFinished = $true

            if ($currentStatus -match 'success|completed|done') {
                Write-Host "`nTest zakonczony POMYSLNIE (status: $currentStatus)" -ForegroundColor Green
            }
            else {
                Write-Host "`nTest zakonczony BLEDEM (status: $currentStatus)" -ForegroundColor Red
            }

            # Zapis wynikow do pliku
            $resultsFile = "d:\SimpliSalonCLoud\manus-testing\wyniki_testu_$taskId.json"
            $statusResponse | ConvertTo-Json -Depth 10 | Out-File -FilePath $resultsFile -Encoding UTF8

            Write-Host "Pelne wyniki zostaly automatycznie zapisane do pliku: $resultsFile" -ForegroundColor Cyan

            if ($statusResponse.result -and $statusResponse.result.summary) {
                Write-Host "`nPodsumowanie Manusa:" -ForegroundColor Magenta
                Write-Host $statusResponse.result.summary
            }
        }
    }
}
catch {
    Write-Host "Wystapil blad podczas komunikacji z Manus API:" -ForegroundColor Red
    Write-Host $_.Exception.Message
}
