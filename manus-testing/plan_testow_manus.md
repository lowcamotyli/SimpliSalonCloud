# Kompleksowy Plan Testowania SimpliSalonCloud z użyciem Manus AI (manus.im)

Niniejszy dokument przedstawia strategię wykorzystania autonomicznych agentów **Manus** (na podstawie dokumentacji `open.manus.ai`) do zautomatyzowanego testowania E2E i integracyjnego aplikacji SimpliSalonCloud.

## 1. Architektura Testów i Środowisko

**Manus AI** działa w oparciu o autonomiczne zadania (Tasks). Do naszego systemu będziemy integrować agenta wykorzystując:
- **Manus API (`/v1/projects`, `/v1/tasks`)** do delegowania scenariuszy testowych.
- **Webhooki (`/v1/webhooks`)** do otrzymywania asynchronicznych raportów o statusie wykonania (sukces, błąd, raport w postaci pliku).
- **Załączniki (`/v1/files`)** do dostarczania zrzutów ekranu, logów, czy konfiguracji wejściowej przed testem.

---

## 2. Scenariusze Testowe (Prompt Testing Definitions)

Wykorzystamy zdolność agentów Manus do "rozumienia" interfejsu (wizualnie oraz strukturalnie) by przetestować krytyczne sekcje aplikacji. Poniżej konkretne prompt'y zadań dla Manusa.

### Scenariusz 1: Kalendarz i Rezerwacje (Calendar & Bookings)
**Cel:** Weryfikacja refaktoryzacji widoku kalendarza (rozdzielenie przycisków "Zap" i usuwania).
**Prompt dla agenta Manus:**
> "Go to the SimpliSalonCloud Calendar view. Locate an available time slot and create a new quick booking (Zap). Verify that the 'Delete/Trash' icon is not confusingly placed right next to it or overlapping. After creation, easily locate the delete button, click it, and confirm the deletion. Report back if the UI is intuitive and if any elements overlap."

### Scenariusz 2: Konfiguracja Silnika Cenowego (Pricing Engine UX)
**Cel:** Sprawdzenie użyteczności panelu "Konfiguracja silnika cenowego" po UX refactoringu.
**Prompt dla agenta Manus:**
> "Navigate to the Settings page and open 'Konfiguracja silnika cenowego'. Verify that the settings are categorized logically and not presented as a single huge list. Try updating one of the pricing tiers, save the changes, and verify if the success state is clearly communicated in Polish. Provide screenshot evidence of the saved state."

### Scenariusz 3: Kampanie, Automatyzacje i Tłumaczenia UI
**Cel:** Upewnienie się, że elementy interfejsu są przyjazne użytkownikowi, przetłumaczone na język polski i pozbawione żargonu technicznego.
**Prompt dla agenta Manus:**
> "Navigate through the following sections: 'Kampanie', 'Automatyzacje', 'Wiadomości', 'Szablony'. Read the UI elements and check if the 'Campaign view is unlocked' feature says 'Widok kampanii jest odblokowany'. Scan the pages for any raw technical variable names (like 'feature-gate.ts' errors or English fallbacks). Report any untranslated strings."

### Scenariusz 4: Integracja Booksy
**Cel:** Pełny test przepływu (webhooks & cron).
**Prompt dla agenta Manus:**
> "Access the Booksy integration page in SimpliSalonCloud's Settings. Trigger a manual sync. Then, generate a mock Booksy incoming webhook payload to the staging environment endpoint. Verify if the internal application logs reflect a successful status update and if the appointment reflects locally. Document the latency and any error codes returned."

### Scenariusz 5: Rejestracja i Logowanie (Auth Flow)
**Cel:** Przeprowadzenie pełnej ścieżki uwierzytelniania, od założenia nowego konta po poprawne zalogowanie.
**Prompt dla agenta Manus:**
> "Go to the SimpliSalonCloud registration page. Fill out the sign-up form with a test email and secure password. Submit the form and verify if the account is created successfully (e.g., successful redirect to onboarding or dashboard). Then log out, navigate to the login page, and sign in with the newly created credentials. Check if the dashboard loads correctly. Report any validation errors or UI glitches."

### Scenariusz 6: Wiązanie konta (Account Linking)
**Cel:** Weryfikacja procesu łączenia głównego konta z zewnętrznymi integracjami lub subkontami (w zależności od specyfiki aplikacji).
**Prompt dla agenta Manus:**
> "Log in to a SimpliSalonCloud test account. Navigate to the account settings or integrations section where account linking is available. Initiate the account linking process, follow the required steps, and confirm the connection. Verify that the UI reflects the linked status correctly. Take a screenshot of the successfully linked account."

---

## 3. Przykładowa Integracja przez API Manus

Aby uruchomić test, aplikacja CI/CD lub skrypt testowy wykona zapytanie do API, np. uruchamiając **Scenariusz 1**.

```bash
curl -X POST https://api.manus.ai/v1/tasks \
  -H "API_KEY: TWÓJ_KLUCZ_API_MANUS" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Go to the SimpliSalonCloud Calendar view. Locate an available time slot and create a new quick booking (Zap). Verify that the Delete/Trash icon is not placed directly overlapping it...",
    "agentProfile": "manus-1.6"
  }'
```

## 4. Oczekiwane Artefakty i Webhook Raportowania

Zamiast ciągłego sprawdzania (`GET /v1/tasks/{task_id}`), skonfigurujemy webhook testowy.

```json
// Przykładowy payload, jaki otrzymamy z Manus po zakończeniu testu
{
  "event": "task.completed",
  "data": {
    "task_id": "task_abc123",
    "status": "success",
    "result": {
      "summary": "Pomyślnie utworzono Zap i usunięto rezerwację. Przyciski są poprawnie rozmieszczone, żaden element się nie nakłada.",
      "attachments": [
        "https://api.manus.ai/v1/files/screenshot_calendar_view.png"
      ]
    }
  }
}
```

## 5. Kroki Wdrożeniowe (Checklista)

1. [ ] Wygenerowanie i dodanie klucza API Manus do zmiennych środowiskowych `.env` aplikacji testowej.
2. [ ] Utworzenie dedykowanego projektu Manus na platformie: `POST /v1/projects`.
3. [ ] Napisanie skryptu Node.js / Python wewnątrz katalogu `manus-testing`, który:
   - Wysyła commity jako wywoływacze nowych `Tasks`.
   - Nasłuchuje odpowiedzi (lokalnie przez np. ngrok) na predefiniowanym endpointie `/api/webhook/manus-tests`.
4. [ ] Analiza testów wizualnych: Przypisanie w poleceniu manus prośby o zrobienie i dołączenie zrzutów z "Widoku kampanii" aby potwierdzić w 100% użycie języka polskiego.
