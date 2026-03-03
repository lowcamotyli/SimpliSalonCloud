# SimpliSalonCloud Booksy Integration Test Report

**Date:** 2026-03-01
**Tester:** Manus AI
**Environment:** Production (https://simplisaloncloud.vercel.app)
**Account:** bartosz.rogala@yahoo.pl (Owner)

## 1. Executive Summary

This report details the results of a comprehensive test suite executed on the Booksy integration module within the SimpliSalonCloud platform. The tests covered connection status, Gmail integration management, synchronization statistics, manual sync functionality, sync options persistence, email notifications, data consistency in the bookings table, and data integrity between the calendar, client list, and synced data.

While the core synchronization functionality appears to be working, several **critical and major bugs** were identified. The most severe issues relate to the **failure of settings to persist** after being saved and a **broken disconnection workflow**. Data integrity issues were also noted, including incorrect visit counts for clients and the presence of test data in the production environment. These issues significantly impact the usability and reliability of the integration.

## 2. Test Results Overview

| Test Case | Result | Priority | Summary of Findings |
| :--- | :--- | :--- | :--- |
| **Test 1: Connection Status** | **PASS** | - | The 'Połączono' (Connected) status badge was correctly displayed. |
| **Test 2: Connect to Gmail** | **N/A** | - | Skipped, as the integration was already in a connected state. |
| **Test 3: Disconnect Gmail** | **FAIL** | **Critical** | The confirmation dialog for disconnecting the integration is missing. The button does nothing. |
| **Test 4: Sync Statistics** | **PASS** | - | All 5 statistic tiles were displayed correctly with appropriate data and colors. |
| **Test 5: Manual Sync** | **PASS** | - | Manual sync works, showing a loading state and a success toast notification. |
| **Test 6: Sync Options** | **FAIL** | **Critical** | Settings (e.g., sender email) are not persisted after saving, despite a success toast. |
| **Test 7: Email Notifications** | **FAIL** | **Critical** | Notification settings are not persisted after saving, reverting to their default state. |
| **Test 8: Bookings Table** | **FAIL** | **Major** | The date format in the 'Data wizyty' column is incorrect (ISO instead of Polish format). |
| **Test 9: Calendar & Client Data** | **FAIL** | **Major** | Incorrect visit count for a client, presence of test/garbage data, and 'Unknown client' bookings. |
| **Test 10: 'How it Works' Section** | **PASS** | - | The informational section is correctly displayed with all four required steps. |

## 3. Detailed Bug Reports

### 3.1. CRITICAL: Settings Do Not Persist After Save (Tests 6 & 7)

- **Description:** Changes made in the 'Opcje synchronizacji' and 'Powiadomienia e-mail' sections are not saved to the backend. After clicking the 'Zapisz ustawienia' button, a success toast ('Ustawienia zapisane') is displayed, but the UI immediately reverts to the previous state. This affects the sender email address, sync interval, and all notification toggles.
- **Steps to Reproduce:**
    1. Navigate to the Booksy integration settings.
    2. Change the 'Adres e-mail nadawcy (Booksy)' from 'noreply@booksy.com' to a different value.
    3. Click 'Zapisz ustawienia'.
    4. Observe the success toast, but notice the input field value reverts to 'noreply@booksy.com'.
- **Impact:** High. Users cannot configure the integration, rendering features like custom sender addresses and email notifications unusable.

### 3.2. CRITICAL: Disconnect Confirmation Dialog is Missing (Test 3)

- **Description:** Clicking the 'Odłącz integrację' button does not trigger the expected confirmation dialog. The button is unresponsive, and there is no way for the user to disconnect their Gmail account through the UI.
- **Steps to Reproduce:**
    1. Navigate to the Booksy integration settings.
    2. Ensure a Gmail account is connected.
    3. Click the red 'Odłącz integrację' button.
    4. Observe that no dialog or action occurs.
- **Impact:** High. Users are unable to manage their integration settings or revoke access, which is a significant control and security issue.

### 3.3. MAJOR: Incorrect Date Format in Bookings Table (Test 8)

- **Description:** The 'Data wizyty' column in the 'Ostatnie rezerwacje z Booksy' table displays dates in the `YYYY-MM-DD HH:MM:SS` format. The expected format for a Polish-language UI is `DD.MM.YYYY GG:MM`.
- **Impact:** Medium. While the data is technically correct, it is not user-friendly and inconsistent with the application's locale.

### 3.4. MAJOR: Data Integrity Issues in Calendar and Client List (Test 9)

- **Description:** Several data inconsistencies were found after synchronization:
    - **Incorrect Visit Count:** The client 'Tomasz Rogala' is listed with 'WIZYTY: 0' in the client list, but the Booksy sync table shows two bookings associated with his phone number.
    - **Test/Garbage Data:** A client named 'cadsad' exists in the system with associated bookings. This is clearly not a valid client name and indicates that test data has not been cleaned from the production environment.
    - **Unknown Clients:** A booking appeared on the calendar for 'Nieznany klient' (Unknown client), indicating a failure in the client matching or creation logic during the sync process.
- **Impact:** Medium. These issues erode trust in the data's accuracy and can lead to confusion for salon staff.

## 4. Recommendations

It is strongly recommended that the development team address the **critical** bugs as a top priority. The inability to save settings or disconnect the integration renders the feature incomplete and unreliable. The **major** data integrity and formatting issues should be addressed subsequently to ensure a polished and trustworthy user experience.

- **Priority 1 (Critical):**
    - Fix the settings persistence issue for both sync options and notifications.
    - Implement the missing confirmation dialog for the disconnect functionality.
- **Priority 2 (Major):**
    - Correct the date format in the bookings table to match the Polish locale.
    - Investigate and fix the logic for calculating client visit counts.
    - Remove all test and garbage data (e.g., client 'cadsad') from the production database.
    - Improve the client matching logic to prevent the creation of 'Nieznany klient' bookings.

