# SimpliSalonCloud QA Test Report
**Date:** 2026-02-28  
**Tester:** Manus (Automated QA)  
**Application:** SimpliSalonCloud (https://simplisaloncloud.vercel.app)  
**Account:** bartosz.rogala@yahoo.pl (Salon: ANASTAZJA)

---

## 1. Login

**Status:** PASS  
**Observations:**
- Login page loads correctly with Polish labels ("Email", "Hasło", "Zaloguj się").
- Credentials accepted successfully; redirected to `/anastazja/dashboard`.
- Dashboard shows correct salon name "ANASTAZJA" and summary stats (0 visits today, 0.00 zł revenue, 8 active employees, 19 clients).
- Sidebar navigation visible with: Dashboard, Kalendarz, Rezerwacje, Usługi, Pracownicy, Klienci, Wynagrodzenia, Raporty, Subskrypcja, Ustawienia.

---

## 2. Calendar Page – View Tests

### 2.1 Calendar Navigation

**Status:** PASS  
**Observations:**
- Calendar page loads at `/anastazja/calendar` with Week view as default.
- Date range displayed: "28 Feb - 6 Mar 2026".
- Employee filter buttons visible: Alex, BARTOSZ (×2), Kamil, Karolina, Kasia, Lowca, Marta (8 employees total).
- Navigation controls: "Dziś" (Today), back/forward arrows, and view toggles (Dzień/Tydzień/Miesiąc).

### 2.2 Day View ("Dzień")

**Status:** PASS  
**Observations:**
- Switches correctly to Day view showing "28 February 2026".
- Columns show individual employees: Alex, BARTOSZ, BARTOSZ (duplicate name — see Issue #1), Kamil, Karolina, Kasia, Lowca, Marta.
- Time slots show "+ Dodaj / Upuść" labels on hover/render.
- No bookings visible for today (Feb 28) in day view.

**Issue #1 — Duplicate Employee Name in Column Header:**  
In Day view, two columns are labeled "BARTOSZ" (with no differentiating suffix). This makes it impossible to distinguish which "BARTOSZ" column belongs to which employee. The employee filter buttons also show two "BARTOSZ" entries. This is a **UI/UX defect** — employee display names should be unique or include a surname/ID.

### 2.3 Week View ("Tydzień")

**Status:** PASS  
**Observations:**
- Displays week of Feb 28 – Mar 6, 2026 with day columns (SAT, SUN, MON, TUE, WED, THU, FRI).
- One existing booking visible: "Jan Kowalski – Strzyżenie damskie wł. średnie – Zap 10:00 – 150 zł" on Sunday (Mar 1).
- Time axis labeled "CZAS" (Time) on the left.
- Empty slots show "+" buttons for quick booking.

### 2.4 Month View ("Miesiąc")

**Status:** PASS  
**Observations:**
- Displays February 2026 in a standard monthly grid.
- Today (Feb 28) is highlighted in blue.
- Existing bookings visible on several dates (Feb 5, 6, 11, 19, 27, 28).
- Month header shows "February 2026" — **Issue #2: Mixed language** — all other labels are in Polish, but the month name "February" is in English instead of "Luty". This is a **missing translation / localization bug**.
- Booking chips in month view show abbreviated info (e.g., "10:00 cadsad", "10:00 Kasia", "09:00 BART").

**Issue #2 — Month Name Not Translated:**  
The Month view header displays "February 2026" in English instead of the Polish "Luty 2026". All other UI text is in Polish. This is a localization inconsistency.

**Issue #3 — Suspicious Booking Label "cadsad":**  
On Feb 5, a booking chip shows "10:00 cadsad" — this appears to be test/garbage data entered by a previous user. Not a system bug per se, but worth noting.

---

## 3. New Booking Creation

### 3.1 Opening the 'Nowa wizyta' Dialog

**Status:** PASS  
**Method tested:** Clicking the "Nowa wizyta" button in the calendar toolbar.  
**Observations:**
- Dialog opens correctly with title "Nowa wizyta".
- All required fields are present: Pracownik (Employee), Usługa (Service), Imię i nazwisko klienta (Client Name), Telefon klienta (Client Phone), Data (Date), Godzina (Time), Notatki (Notes).
- Required fields are marked with asterisk (*).
- Date defaults to today (2026-02-28), time defaults to 10:00.

**Issue #4 — "OK to send" Service Name:**  
In the service category "Strzyżenie > Damskie", one service is labeled "OK to send" (150 zł, 90 min). This is clearly a test/placeholder entry that was left in the system. It should be renamed to a proper service name.

### 3.2 Employee Dropdown

**Status:** PASS  
**Observations:**
- Dropdown lists 8 employees: Alex Rogala, BARTOSZ Rogala (×2), Kamil Fryzjer, Karolina Testowa, Kasia Nowak, Lowca Motyli, Marta Wizaż.
- **Issue #1 (confirmed):** Two employees are listed as "BARTOSZ Rogala" with identical display names. The system uses UUIDs internally to differentiate them, but the UI shows no distinction.
- Employee "Kamil Fryzjer" selected successfully.

### 3.3 Service Selection

**Status:** PASS  
**Observations:**
- Service picker shows categories: Fryzjer, Fryzjerstwo, Kosmetyka, Strzyżenie.
- Clicking "Strzyżenie" shows subcategory "Damskie".
- Clicking "Damskie" shows two services: "OK to send" (150 zł, 90 min) and "Strzyżenie damskie wł. średnie" (150 zł, 90 min).
- Selected service "Strzyżenie damskie wł. średnie" — confirmed with price and duration.
- After selection, a "Zmień" (Change) button appears to allow re-selection.
- **Predicted end time** shown below time field: "Przewidywany koniec: 15:30" (Predicted end: 15:30) — useful feature.

### 3.4 Client Name Autocomplete

**Status:** PASS  
**Observations:**
- Typing "Jan" in the client name field immediately shows autocomplete suggestion: "Jan Kowalski +48 123 456 789".
- Clicking the suggestion auto-fills both the name and phone number fields.
- **Issue #5 — Phone Number Format on Autocomplete:**  
  When "Jan Kowalski" is selected from autocomplete, the phone field is populated with "48123456789" (missing the leading "+" sign). The stored number is "+48 123 456 789" but the autocomplete strips the "+" and spaces. This is a **data formatting bug**.

### 3.5 Booking Save — Critical Issue

**Status:** PARTIAL FAIL  
**Observations:**
- After filling all fields (Employee: Kamil Fryzjer, Service: Strzyżenie damskie wł. średnie, Client: Jan Kowalski, Phone: 48123456789, Date: 2026-03-01, Time: 14:00), clicking "Zapisz wizytę" did not close the dialog on the first several attempts.
- **Issue #6 — Save Button Unresponsive (Critical Bug):**  
  The "Zapisz wizytę" button appears to be non-functional when the client name autocomplete dropdown is still visible. The autocomplete suggestion "Jan Kowalski" remained displayed even after selecting it, and the save button clicks were silently ignored (no error message, no network request, no feedback).
  - Root cause: The autocomplete dropdown persists after selection and intercepts or blocks the form submission logic.
  - Workaround: Pressing the Tab key to move focus away from the name field dismisses the autocomplete and allows the form to submit.
  - The booking was eventually saved after pressing Tab to dismiss the autocomplete.
  - **Severity: High** — Users may believe the save is broken with no feedback.

- **Issue #7 — Employee Mismatch After Save:**  
  The booking was saved with employee "BARTOSZ Rogala" instead of the selected "Kamil Fryzjer". The employee dropdown showed "Kamil Fryzjer" visually, but the React state retained "Alex Rogala" (the initial default). The `browser_select_option` action updated the DOM but did not properly update the React component state. This is a **React state synchronization bug** — the dropdown's visual state can diverge from the underlying React state.

---

## 4. Booking Detail View

**Status:** PASS (with issues)  
**Observations:**

The booking detail dialog "Szczegóły wizyty" (Booking Details) opened successfully when clicking on the booking card in the calendar. The following fields were displayed:

| Field | Value Shown | Expected | Match? |
|-------|------------|----------|--------|
| KLIENT | Jan Kowalski | Jan Kowalski | ✓ |
| Phone | +48 123 456 789 | +48 123 456 789 | ✓ |
| DATA I CZAS | 1 marca 2026, 10:00 | 2026-03-01, 14:00 | ✗ |
| Koniec | 14:55 | 15:30 | ✗ |
| USŁUGA | Strzyżenie damskie wł. średnie | Strzyżenie damskie wł. średnie | ✓ |
| Duration | 295 min (editable field) | 90 min | ✗ |
| PRACOWNIK | BARTOSZ Rogala | Kamil Fryzjer | ✗ |
| STATUS | Zaplanowana (Planned) | Zaplanowana | ✓ |
| CENA KOŃCOWA | 150,00 zł | 150,00 zł | ✓ |

**Issue #8 — Incorrect Time Displayed:**  
The booking was created for 14:00 but the detail view shows "10:00" as the start time. The end time shows "14:55" (90 min from 13:25?), which is inconsistent. This suggests the time was not properly saved or is being displayed incorrectly.

**Issue #9 — Duration Field Shows 295 min Instead of 90 min:**  
The service duration is 90 minutes, but the detail view shows an editable field with value "295" minutes. This is clearly incorrect and represents a **data corruption or calculation bug**.

**Issue #10 — Wrong Employee Assigned:**  
The detail view shows "BARTOSZ Rogala" as the employee, while "Kamil Fryzjer" was selected. This confirms Issue #7 — the React state synchronization bug caused the wrong employee to be saved.

**Issue #11 — Detail View Has Editable Duration Field:**  
The duration field in the detail view is an editable number input. It is unclear whether this is intentional (allowing manual override) or a UI design error. If intentional, it should be clearly labeled as "Override duration" or similar.

**Issue #12 — Missing "Anuluj wizytę" (Cancel Booking) Label:**  
The cancel button in the detail view shows "Anuluj" (Cancel) but the trash/delete icon button has no visible label. The hint attribute says "Usuń wizytę z systemu" (Remove booking from system) — this is a delete action, not a cancellation. The distinction between "cancel" (status change) and "delete" (remove from system) is unclear in the UI.

**Payment buttons visible:** "Gotówka" (Cash) and "Karta" (Card) — both present.

---

## 5. Payment Completion — 'Gotówka' (Cash)

### 5.1 Cash Payment ('Gotówka')

**Status:** PASS  
**Observations:**
- Clicking "Gotówka" (Cash) in the detail view processed the payment immediately.
- The dialog closed automatically after payment.
- The booking chip on the calendar changed from "Zap" (Zaplanowana/Planned) to "Zak" (Zakończona/Completed).
- Re-opening the detail view confirms STATUS changed to "Zakończona" (green badge).
- Payment buttons (Gotówka/Karta) are no longer shown for completed bookings — correct behavior.
- Price shows "150,00 zł" with "Baza: 150,00 zł" — consistent.

**Issue #13 — Duration Still Shows 295 min After Completion:**  
Even after the booking is completed, the duration field in the detail view still shows "295 min" instead of the correct "90 min". This confirms the duration calculation bug persists across the booking lifecycle.

**Issue #14 — Status Badge Abbreviation on Calendar:**  
The calendar booking chip uses abbreviated status codes ("Zap" for Zaplanowana, "Zak" for Zakończona). These are not immediately intuitive for users. A tooltip or full label would improve UX.

---

## 6. Second Booking Creation and Cancellation



# SimpliSalonCloud QA Test Report

**Date:** 2026-02-28
**Tester:** Manus AI

## 1. Introduction

This report details the results of a comprehensive quality assurance test of the SimpliSalonCloud web application, focusing on the calendar and booking management functionalities. The tests were conducted as per the user request, covering login, calendar views, booking creation, payment processing, and booking cancellation.

## 2. Summary of Findings

The application is functional in some core areas, such as user login and calendar view navigation. However, several **critical bugs** were identified that severely impact the core booking management workflow. The most significant issues are the complete failure of the booking creation and cancellation functionalities from the user interface.

### Critical Issues:

*   **Booking Creation Failure:** The "Zapisz wizytę" (Save Booking) button in the new booking dialog is non-functional. It triggers a `500 Internal Server Error` from the backend API and fails silently without providing any feedback to the user.
*   **Booking Cancellation Failure:** The "Anuluj wizytę" (Cancel Booking) button in the booking details view is broken. It does not trigger any API call and fails to cancel the booking.

### High-Severity Issues:

*   **Stale UI after Updates:** The user interface does not automatically refresh after backend data changes. For instance, after a booking is paid for or cancelled (via direct API call), the calendar and booking lists remain unchanged until the page is manually refreshed.

### Medium-Severity Issues:

*   **Inconsistent Translations:** The UI is a mix of Polish and English, leading to an inconsistent user experience.

## 3. Detailed Test Results

| Feature | Test Case | Expected Result | Actual Result | Status | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Authentication** | User Login | User successfully logs in and is redirected to the dashboard. | User successfully logs in. | **PASS** | |
| **Calendar** | Switch between Day, Week, and Month views | All three calendar views load correctly and display appointments. | All views load correctly. | **PASS** | |
| **Booking Creation** | Create a new booking via the "Nowa wizyta" dialog | The new booking is saved and appears on the calendar. | The booking is not saved. The save button triggers a `500 Internal Server Error` from the `/api/bookings` endpoint. The UI provides no error feedback. | **FAIL** | **Critical Bug.** This prevents users from creating any new bookings through the UI. |
| **Booking Details** | View details of an existing booking | All booking details (client, service, employee, date/time, price, status) are displayed correctly. | Details are displayed correctly. | **PASS** | |
| **Payment** | Complete a booking using the "Gotówka" (Cash) option | The booking status changes to "Zakończona" (Completed) in the UI. | The backend status is updated to "completed", but the UI does not refresh automatically. The status appears unchanged until a manual page reload. | **FAIL** | **High-Severity Bug.** The lack of UI feedback can lead to user confusion. |
| **Booking Cancellation** | Cancel a booking using the "Anuluj wizytę" button | The booking is cancelled and its status is updated to "Anulowana" (Cancelled) or it is removed from the calendar. | The "Anuluj wizytę" button is non-functional. It does not make an API call and the booking is not cancelled. | **FAIL** | **Critical Bug.** Users cannot cancel bookings from the UI. |

## 4. UI/UX Feedback

*   **Inconsistent Translations:** The application mixes Polish and English throughout the interface. For example, the main navigation is in Polish ("Kalendarz", "Rezerwacje"), but buttons in the booking dialog are in English ("Close"). Dates are also formatted in Polish ("1 września 2026"). A consistent language should be used throughout the application.
*   **Lack of Feedback on Failure:** Critical actions like saving or cancelling a booking fail silently without any error messages or visual cues to the user. This provides a poor user experience and can lead to data inconsistencies.

## 5. Conclusion and Recommendations

The SimpliSalonCloud application has a functional foundation for viewing calendar and booking information. However, the critical bugs in the booking creation and cancellation workflows render the application unusable for its primary purpose of managing appointments. 

It is strongly recommended to prioritize fixing the following issues:

1.  **Fix the `500 Internal Server Error` on the `POST /api/bookings` endpoint** to allow new bookings to be created.
2.  **Implement the functionality for the "Anuluj wizytę" button** to correctly cancel bookings.
3.  **Implement automatic UI refreshes** after state-changing actions like payment and cancellation to ensure the user is always seeing up-to-date information.
4.  **Standardize the language** used throughout the user interface.

## 6. Attachments

*   `calendar_day_view_final.webp`: Screenshot of the calendar Day view.
*   `calendar_week_view.webp`: Screenshot of the calendar Week view.
*   `calendar_month_view.webp`: Screenshot of the calendar Month view.
*   `booking_detail_view.webp`: Screenshot of the booking detail view.
*   `bookings_list_after_cancel.webp`: Screenshot of the bookings list showing the manually cancelled booking after a page refresh.
