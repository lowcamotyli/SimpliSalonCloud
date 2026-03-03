# Sprint 03 – Rezerwacja Sprzętu – Backend i Frontend

> **Typ:** Backend (API) + Frontend (UI)  
> **Wymaga:** Sprint 02 ukończony (tabele `equipment`, `equipment_bookings`, funkcja SQL)  
> **Szacowany czas:** 2–3 tygodnie  
> **Trudność:** 7/10  
> **Priorytet:** 🔴 Fundament – przed kampaniami sprzedażowymi

---

## 📎 Pliki do kontekstu Gemini

> Plik sprintu + Sprint-00 + Sprint-02 (schemat DB) + poniższe pliki.

**Istniejące pliki do MODYFIKACJI:**
- `app/api/bookings/route.ts` – **kluczowy plik**, tu wstrzykujesz logikę walidacji sprzętu (sekcja POST i PUT)
- `app/api/bookings/[id]/route.ts` – edycja i anulowanie pojedynczego bookingu
- `app/(dashboard)/[slug]/calendar/page.tsx` – widok kalendarza (36 KB); tu dodajesz oznaczenia sprzętu i drag & drop
- `app/(dashboard)/[slug]/calendar/booking-dialog.tsx` – dialog tworzenia bookingu (18 KB); tu dodajesz wybór sprzętu
- `app/api/services/route.ts` – lista usług
- `app/api/services/[id]/route.ts` – CRUD pojedynczej usługi

**Nie istnieją jeszcze – stworzysz je w tym sprincie:**
- `app/api/equipment/route.ts` ← GET lista + POST dodaj
- `app/api/equipment/[id]/route.ts` ← PUT edycja + DELETE dezaktywacja
- `app/api/services/[id]/equipment/route.ts` ← przypisanie sprzętu do usługi
- `lib/equipment/availability.ts` ← logika sprawdzania dostępności
- `app/(dashboard)/[slug]/settings/equipment/page.tsx` ← panel CRUD sprzętu

**Wzorce do przeczytania (nie modyfikuj):**
- `lib/supabase/server.ts` – wzorzec klienta serwerowego
- `types/` – sprawdź istniejące typy przed dodaniem nowych

---

## Cel sprintu

Integracja nowego modelu danych sprzętu z logiką bookingów: walidacja dostępności po stronie backendu, panel zarządzania sprzętem, podgląd w kalendarzu i drag-and-drop. Po tym sprincie salon może przypisać sprzęt do usług i system automatycznie blokuje konflikty.

---

## 3.1 TypeScript – typy i interfejsy

> Plik: `src/types/equipment.ts`

```typescript
export interface Equipment {
  id: string;
  salon_id: string;
  name: string;
  type: 'laser' | 'fotel' | 'stol_manicure' | 'fotopolimeryzator' | 'inne' | 'other';
  description?: string;
  is_active: boolean;
  created_at: string;
}

export interface EquipmentBooking {
  id: string;
  booking_id: string;
  equipment_id: string;
  starts_at: string;
  ends_at: string;
}

export interface AvailabilityResult {
  equipment_id: string;
  is_available: boolean;
  conflict_booking_id?: string;
}
```

---

## 3.2 Biblioteka – walidacja dostępności

> Plik: `src/lib/equipment/availability.ts`

```typescript
import { createClient } from '@/lib/supabase/server';

export async function checkEquipmentAvailability(
  equipmentIds: string[],
  startsAt: Date,
  endsAt: Date,
  excludeBookingId?: string
): Promise<AvailabilityResult[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('check_equipment_availability', {
    p_equipment_ids: equipmentIds,
    p_starts_at: startsAt.toISOString(),
    p_ends_at: endsAt.toISOString(),
    p_exclude_booking_id: excludeBookingId ?? null,
  });
  if (error) throw new Error(`Equipment availability check failed: ${error.message}`);
  return data as AvailabilityResult[];
}

export async function getRequiredEquipmentForService(
  serviceId: string
): Promise<string[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from('service_equipment')
    .select('equipment_id')
    .eq('service_id', serviceId);
  return data?.map(r => r.equipment_id) ?? [];
}
```

---

## 3.3 Zmiana w logice tworzenia bookingu

> Plik: `src/app/api/bookings/route.ts` – sekcja POST

Przed zapisaniem rezerwacji dodać krok walidacji sprzętu:

```typescript
// Krok 1: Pobierz wymagany sprzęt dla wybranej usługi
const requiredEquipment = await getRequiredEquipmentForService(serviceId);

// Krok 2: Jeśli usługa wymaga sprzętu, sprawdź dostępność
if (requiredEquipment.length > 0) {
  const availability = await checkEquipmentAvailability(
    requiredEquipment, 
    new Date(startsAt), 
    new Date(endsAt)
  );
  
  const conflicts = availability.filter(a => !a.is_available);
  if (conflicts.length > 0) {
    return NextResponse.json({
      error: 'EQUIPMENT_CONFLICT',
      message: 'Wybrany termin jest niedostępny – sprzęt jest już zajęty.',
      conflictingEquipment: conflicts.map(c => c.equipment_id),
    }, { status: 409 });
  }
}

// Krok 3: Zapisz booking
const { data: booking } = await supabase.from('bookings').insert({...}).select().single();

// Krok 4: Utwórz blokady sprzętu
if (requiredEquipment.length > 0) {
  await supabase.from('equipment_bookings').insert(
    requiredEquipment.map(eqId => ({
      booking_id: booking.id,
      equipment_id: eqId,
      starts_at: startsAt,
      ends_at: endsAt,
    }))
  );
}
```

> ⚠️ Krok 3 i 4 powinny być w transakcji. Użyj RPC Supabase lub `supabase.rpc('create_booking_with_equipment', {...})` jeśli Supabase nie obsługuje transakcji po stronie klienta.

---

## 3.4 Zmiana w logice edycji i anulowania bookingu

### Edycja (`PUT /api/bookings/[id]`)

```typescript
// Przy zmianie godziny:
// 1. Re-check dostępności sprzętu z excludeBookingId = id
// 2. Jeśli OK: UPDATE bookings + UPDATE equipment_bookings (starts_at, ends_at)
// 3. Jeśli konflikt: 409 z opisem
```

### Anulowanie (`DELETE /api/bookings/[id]` lub `PATCH` ze statusem)

```typescript
// equipment_bookings są kasowane automatycznie przez ON DELETE CASCADE na booking_id
```

---

## 3.5 API Routes – zarządzanie sprzętem

| Endpoint | Metoda | Auth | Opis |
|---|---|---|---|
| `/api/equipment` | GET | employee | Lista sprzętu salonu |
| `/api/equipment` | POST | owner/manager | Dodaj sprzęt |
| `/api/equipment/[id]` | PUT | owner/manager | Edytuj sprzęt |
| `/api/equipment/[id]` | DELETE | owner/manager | Usuń (soft-delete: `is_active = false`) |
| `/api/equipment/[id]/schedule` | GET | employee | Harmonogram sprzętu (dzień/tydzień) |
| `/api/services/[id]/equipment` | GET | employee | Sprzęt wymagany przez usługę |
| `/api/services/[id]/equipment` | PUT | owner/manager | Przypisz sprzęt do usługi |

---

## 3.6 Frontend – Panel `/settings/equipment`

**Układ strony:**
```
/settings/equipment
├── Lista kart sprzętu (nazwa, typ, status active/inactive)
├── Przycisk "Dodaj sprzęt" → drawer/modal z formularzem
└── Każda karta: [Edytuj] [Dezaktywuj]
```

**Komponent `<EquipmentCard>`:**
```typescript
interface EquipmentCardProps {
  equipment: Equipment;
  onEdit: (id: string) => void;
  onToggleActive: (id: string, current: boolean) => void;
}
```

**Komponent `<EquipmentForm>`** (drawer):
- Pola: Nazwa (text), Typ (select), Opis (textarea)
- Walidacja: nazwa wymagana, min 2 znaki

---

## 3.7 Frontend – Przypisanie sprzętu do usług

W istniejącym formularzu edycji usługi (`/settings/services/[id]`) dodać sekcję:

```typescript
// Sekcja "Wymagany sprzęt"
<EquipmentMultiSelect
  serviceId={service.id}
  availableEquipment={equipment}
  selectedEquipmentIds={serviceEquipment}
  onChange={handleEquipmentChange}
/>
```

Komponent `<EquipmentMultiSelect>` – lista checkboxów ze sprzętem salonu.

---

## 3.8 Frontend – Widok kalendarza (rozszerzenie)

W istniejącym kalendarzu dodać:

1. **Tooltips na zajętych slotach**: po najechaniu na slot pokaż „Fotel laser – zajęty".
2. **Filtr sprzętu**: dropdown pozwalający filtrować widok kalendarza wg urządzenia.
3. **Kolor bloku** zależny od dostępności sprzętu (np. pasek boczny innego koloru jeśli slot ma przypisany sprzęt).

> Nie przebudowywać kalendarza w tym sprincie – tylko rozszerzyć istniejący komponent.

**Drag & drop (jeśli biblioteka to obsługuje):**
- Po upuszczeniu bloku w nowe miejsce: wywołaj `PUT /api/bookings/[id]` z nowymi godzinami
- Jeśli 409 (konflikt sprzętu) → cofnij drag, pokaż toast z błędem

---

## 3.9 Testowanie

### Jednostkowe

```typescript
// src/lib/equipment/__tests__/availability.test.ts
describe('checkEquipmentAvailability', () => {
  it('returns available=true when no conflicts')
  it('returns available=false when time overlaps')
  it('ignores excludeBookingId when checking (edit scenario)')
  it('handles multiple equipment IDs correctly')
})
```

### E2E (Playwright)

```typescript
// tests/equipment.spec.ts
test('Dodaj sprzęt i przypisz do usługi', async ({ page }) => {
  // 1. Przejdź do /settings/equipment
  // 2. Kliknij "Dodaj sprzęt", wypełnij formularz
  // 3. Sprawdź że karta sprzętu pojawia się na liście
  // 4. Przejdź do /settings/services/[id]
  // 5. Zaznacz checkbox sprzętu
  // 6. Zapisz
  // 7. Sprawdź że API /api/services/[id]/equipment zwraca sprzęt
});

test('Booking blokuje duplikaty sprzętu', async ({ page }) => {
  // 1. Stwórz booking A na sprzęt X: 10:00–11:00
  // 2. Spróbuj stworzyć booking B na sprzęt X: 10:30–11:30
  // 3. Oczekuj error toast "sprzęt jest już zajęty"
});

test('Drag & drop zmiana godziny z konfliktem', async ({ page }) => {
  // 1. Stwórz dva konflikujące sloty
  // 2. Drag-and-drop jednego na zajęty slot
  // 3. Sprawdź rollback i error message
});
```

### Regresja

```bash
# Uruchom pełny suite po zakończeniu sprintu
npx playwright test --reporter=html

# Kluczowe scenariusze do weryfikacji regresji:
# [ ] Booking bez sprzętu (stara ścieżka) nadal działa
# [ ] Anulowanie bookingu kasuje equipment_bookings (CASCADE)
# [ ] Kalendarze pracowników nadal wyświetlają się poprawnie
```

---

## Checklist weryfikacyjna

- [ ] `POST /api/bookings` – rejestuje equipment_bookings przy sukcesie
- [ ] `POST /api/bookings` – zwraca 409 przy konflikcie sprzętu z opisem
- [ ] `PUT /api/bookings/[id]` – re-waliduje sprzęt, obsługuje `excludeBookingId`
- [ ] Panel `/settings/equipment` – CRUD działa (dodaj, edytuj, dezaktywuj)
- [ ] Przypisanie sprzętu do usługi zapisuje się w `service_equipment`
- [ ] Drag & drop w kalendarzu rollbackuje przy konflikcie
- [ ] Testy regresji booking flow zdane
- [ ] `npm run build` bez ostrzeżeń TypeScript

---

## Poprzedni / Następny sprint

⬅️ [Sprint 02 – Equipment DB](./Sprint-02-Equipment-DB.md)  
➡️ [Sprint 04 – Medyczne Karty – Schemat DB i Form Builder](./Sprint-04-Medical-Forms-DB.md)
