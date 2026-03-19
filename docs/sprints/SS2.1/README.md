# Sprinty v2.1 - Indeks

Zrodlo: Analiza i wytyczne dla SimpliSalon (sesja badawcza 17.03.2026)
Track: **v1.x parallel** - ulepszenia kalendarza, zarzadzania uslugami, voucherow i flow rezerwacji dla fryzjerstwa/beauty.
Nie blokuje v2.0 (treatment records) - mozna realizowac rownolegle.

---

## Priorytety wg ROI (uzytecznosc sprzedazowa / trudnosc wdrozenia)

| # | Funkcja | Diff | Sales | ROI |
|---|---------|------|-------|-----|
| 1 | Zwijane Listy Uslug (Akordeony) | 2/10 | 7/10 | **3.5** |
| 2 | Globalny Kalendarz Miesieczny | 3/10 | 8/10 | **2.67** |
| 3 | Kategoryzacja Formularzy w Profilu | 4/10 | 8/10 | **2.0** |
| 4 | Dynamiczne Dodatki do Uslug | 5/10 | 9/10 | **1.8** |
| 5 | Zarzadzanie Voucherami | 6/10 | 9/10 | **1.5** |
| 6 | Grupowe Przypisywanie Sprzetu | 4/10 | 6/10 | **1.5** |
| 7 | Multi-rezerwacje (koszyk uslug) | 7/10 | 10/10 | **1.43** |

---

## Podzial na sprinty

```text
[Sprint S1 - Quick UX Wins]
Globalny Kalendarz + Akordeony + Formularze w profilu
Ryzyko: NISKIE - brak zmian DB
         |
[Sprint S2 - Dodatki + Sprzet]
Dynamiczne dodatki do uslug + grupowe przypisywanie sprzetu
Ryzyko: SREDNIE - nowe tabele DB (service_addons)
         |
[Sprint S3 - Vouchery]
Zarzadzanie voucherami
Ryzyko: WYSOKIE - ACID transactions, saldo voucherow
         |
[Sprint S4 - Multi-booking]   <- osobna galaz feature/multi-booking
Multi-rezerwacje (Visit_Group)
Ryzyko: KRYTYCZNE - przeprojektowanie fundamentow rezerwacji
```

**Bramka:** `npx tsc --noEmit` zielony ZANIM zaczyna sie nastepny sprint.

---

## Status sprintow

| Sprint | Plik | Status | Zaleznosci |
|--------|------|--------|------------|
| **S1** | [S1_quick-ux-wins.md](S1_quick-ux-wins.md) | NEXT | - |
| **S2** | [S2_service-addons-equipment.md](S2_service-addons-equipment.md) | TODO | S1 tsc clean |
| **S3** | [S3_vouchers.md](S3_vouchers.md) | TODO | S2 tsc clean |
| **S4** | [S4_multi-booking.md](S4_multi-booking.md) | TODO | S3 + nowa galaz |

---

## Zasady prowadzenia sprintow

### Na poczatku kazdej sesji
1. Przeczytaj plik sprintu.
2. Przeczytaj TYLKO pliki kontekstowe wymienione w sprincie.
3. Sprawdz stan (`ls`, `head -3 plik`) zanim zaczniesz - moze czesc jest juz zrobiona.

### W trakcie sesji
- Deleguj wg tabeli: SQL -> Gemini, nowe pliki 20-150 linii -> Codex, edycje < 50 linii -> Claude.
- Po kazdym Codex/Gemini: `head -5 plik` + `npx tsc --noEmit`.
- Po kazdej migracji SQL: `supabase db push` -> `supabase gen types typescript --linked > types/supabase.ts`.

### Na koncu sesji
- `/compact` przed nowa sesja.
- Zaktualizuj status w tej tabeli.

---

## Reguly cross-cutting (obowiazkowe)

- **Tenant isolation**: kazda nowa tabela ma `salon_id NOT NULL REFERENCES salons(id) ON DELETE CASCADE` + RLS (ADR-004).
- **Thin route handlers**: logika biznesowa w `lib/<domain>/`, nie inline w route (`service-architecture.md`).
- **Feature flags**: kazda nowa funkcjonalnosc za `lib/features.ts` powiazanym z planem (`hasFeature()`).
- **IDOR guard**: kazde zapytanie do tabeli tenant-scoped filtruje po `salon_id` (nie tylko po `id`).
- **Mark-before-send**: kazdy CRON ustawia flage PRZED wyslaniem (idempotency).
