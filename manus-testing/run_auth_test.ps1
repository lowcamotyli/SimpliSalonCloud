$apiKey = "sk-nMQgGpJP02XX_6pacyELgodtqSE2FOdgxSQjr42vguSImpgQe7cy09r4OspHrM8bX15bUzBysisphWzolw_CIPYXDU7U"
$apiUrl = "https://api.manus.ai/v1/tasks"

# UWAGA: Manus AI jako agent chmurowy nie ma dostępu do Twojego "localhost:3000".
# Musisz wystawić aplikację na zewnątrz uzywając np. ngrok (ngrok http 3000)
# i wpisać tutaj wygenerowany publiczny adres URL.
$appUrl = "http://twoj-adres-ngrok.ngrok.app" 

if ($appUrl -match "localhost") {
    Write-Host "BŁĄD: Zmień `$appUrl na publiczny adres z ngrok. Manus nie odczyta localhost!" -ForegroundColor Red
    exit 1
}

$prompt = "Go to the SimpliSalonCloud registration page at $appUrl/register. Fill out the sign-up form with a test email and secure password. Submit the form and verify if the account is created successfully (e.g., successful redirect to onboarding or dashboard). Then log out, navigate to the login page at $appUrl/login, and sign in with the newly created credentials. Check if the dashboard loads correctly. Report any validation errors or UI glitches."

$body = @{
    prompt = $prompt
    agentProfile = "manus-1.6"
} | ConvertTo-Json

$headers = @{
    "API_KEY" = $apiKey
    "Content-Type" = "application/json"
}

Write-Host "Wysyłanie zadania testowego do Manus API..." -ForegroundColor Cyan

try {
    $response = Invoke-RestMethod -Uri $apiUrl -Method Post -Headers $headers -Body $body
    Write-Host "Zadanie utworzone pomyślnie!" -ForegroundColor Green
    Write-Host "ID Zadania: $($response.task_id)"
    Write-Host "Tytuł: $($response.task_title)"
    Write-Host "URL do śledzenia: $($response.task_url)"
} catch {
    Write-Host "Wystąpił błąd podczas komunikacji z Manus API:" -ForegroundColor Red
    Write-Host $_.Exception.Message
}
