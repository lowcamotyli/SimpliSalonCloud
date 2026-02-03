# Plan Implementacji User-Based Security (RBAC)

**Data:** 2026-02-03
**Status:** DRAFT
**Cel:** Wdrożenie kompleksowego systemu zarządzania rolami i uprawnieniami w SimpliSalonCloud.

---

## 1. Definicje Ról i Uprawnień

W systemie zdefiniowane będą trzy główne role. Uprawnienia będą weryfikowane na dwóch poziomach:
1.  **Frontend (UI/UX):** Ukrywanie elementów interfejsu.
2.  **Backend (RLS/API):** Twarda walidacja w bazie danych (już wdrożona mechanika Custom Claims).

### Macierz Uprawnień (Permission Matrix)

| Funkcjonalność | Owner | Manager | Employee |
| :--- | :---: | :---: | :---: |
| **Dostęp do Salonu** | ✅ | ✅ | ✅ |
| **Kalendarz (Własne wizyty)** | ✅ | ✅ | ✅ |
| **Kalendarz (Wizyty innych)** | ✅ | ✅ | 👁️ (Podgląd) |
| **Klienci (Baza danych)** | ✅ | ✅ | ✅ |
| **Zarządzanie Pracownikami** | ✅ | ✅ (Bez edycji Ownera) | ❌ |
| **Usługi (Cennik)** | ✅ | ✅ | ❌ |
| **Raporty Finansowe** | ✅ | ❌ | ❌ |
| **Ustawienia Salonu** | ✅ | ❌ | ❌ |
| **Integracje (Booksy itp.)** | ✅ | ❌ | ❌ |
| **Payroll (Wypłaty)** | ✅ | ❌ | ❌ |

---

## 2. Architektura Techniczna

### A. Baza Danych (Supabase)
Wykorzystamy istniejącą kolumnę `role` w tabeli `public.profiles`.
Mechanizm **Custom Claims** (wdrożony w poprzednim etapie) automatycznie propaguje rolę do tokena JWT, co pozwala na błyskawiczną weryfikację po stronie serwera bez dodatkowych zapytań SQL.

### B. Frontend (Next.js)
Brak dedykowanej tabeli `permissions`. Uprawnienia będą mapowane w kodzie aplikacji (plik stałych), co ułatwia zarządzanie i TypeScript typing.

**Plik: `lib/rbac/permissions.ts`**
```typescript
export const ROLE_PERMISSIONS = {
  owner: ['*'], // Super admin
  manager: ['manage_employees', 'manage_services', 'view_all_bookings'],
  employee: ['create_booking', 'view_own_bookings']
} as const;
```

---

## 3. Plan Implementacji UI

### Widok: Zarządzanie Pracownikami (`/settings/employees`)
Obecnie brakuje interfejsu do zmiany ról.

**Komponenty do stworzenia:**
1.  **`EmployeeList`**: Tabela wyświetlająca awatar, imię, email i **aktualną rolę**.
2.  **`RoleSelect`**: Dropdown pozwalający zmienić rolę (np. z Employee na Manager).
    *   *Zabezpieczenie:* Tylko Owner może widzieć i używać tego dropdowna.
3.  **`InviteEmployeeModal`**: Formularz wysyłający zaproszenie email (Supabase Invite) z predefiniowaną rolą.

### Komponenty Ochronne (Guards)

**Hook: `usePermission`**
```typescript
const { can } = usePermission();
if (can('manage_finance')) { ... }
```

**Komponent: `<PermissionGuard>`**
```tsx
<PermissionGuard permission="manage_services">
  <Button>Edytuj Cennik</Button>
</PermissionGuard>
```

---

## 4. Harmonogram Wdrożenia (Code Mode)

1.  **Backend Hardening (ZAKOŃCZONE):**
    *   ✅ Wdrożono migrację `20250203000004_rbac_implementation.sql`.
    *   ✅ Zaktualizowano `sync_user_claims` o mapowanie ról na uprawnienia.
    *   ✅ Dodano Policy RLS umożliwiające Ownerowi/Managerowi edycję ról innych użytkowników.

2.  **Frontend Logic (ZAKOŃCZONE):**
    *   ✅ Stworzono hook `useUser` (React Query) do pobierania metadanych.
    *   ✅ Stworzono hook `usePermission` do weryfikacji uprawnień.
    *   ✅ Stworzono komponent `<PermissionGuard>`.
    *   ✅ Zaktualizowano `middleware.ts` o ochronę ścieżek.

3.  **UI Implementation (DO ZROBIENIA):**
    *   Budowa widoku `app/(dashboard)/[slug]/employees/page.tsx`.
    *   Implementacja akcji serwerowej `updateEmployeeRole(id, newRole)`.

4.  **Testing:**
    *   Weryfikacja: Manager nie może wejść w `/settings/billing`.
    *   Weryfikacja: Employee nie widzi przycisku "Usuń pracownika".

---

## 5. Uwagi do bezpieczeństwa
*   Zmiana roli użytkownika wymaga odświeżenia jego sesji (wylogowanie/zalogowanie lub `refreshSession`), aby nowe Claims weszły w życie. Należy o tym poinformować użytkownika w UI ("Rola zmieniona. Użytkownik musi się przelogować").
