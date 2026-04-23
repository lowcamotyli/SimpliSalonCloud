# SimpliSalonCloud - Release SS2.4

Branch: `SS2.4`
Base: `main` (post SS2.3)

## Overview

SS2.4 wprowadza rozbudowe UX zarzadzania uslugami (typy cen, tworzenie uslug, galeria, dodatki),
nowe funkcje kalendarza (nieobecnosci, rezerwacje czasu), widok listy klientow, nowe raporty
oraz rozbudowe sprzetu. Zawiera tez hotfixy zgloszone przez klientke.

---

## Sprint Plan

| # | Sprint | Temat | Priorytet | Status |
|---|--------|-------|-----------|--------|
| 25 | Hotfixy: header przychodow + artefakty UI | Bugfix | P0 | [ ] |
| 26 | Typy cen uslugi - DB + API + UI | Services | P0 | [ ] |
| 27 | Tworzenie uslugi: Dodatki, Galeria, Przypisanie pracownika | Services | P1 | [ ] |
| 28 | Pracownik <-> Uslugi: multi-select + wysuwany panel | Employee UX | P1 | [ ] |
| 29 | Nieobecnosci (zakresy dat) + Rezerwacja czasu | Scheduling | P1 | [ ] |
| 30 | SMS z widoku edycji wizyty | Booking | P1 | [ ] |
| 31 | Klienci: widok listy | Clients | P2 | [ ] |
| 32 | Raporty: Metody platnosci + Godziny przepracowane | Reports | P2 | [ ] |
| 33 | Sprzet: widok lista/kafelki + przypisanie do uslugi | Equipment | P2 | [ ] |
| 34 | Typy cen uslug: spojnosc API + booking publiczny | Services Hardening | P0 | [ ] |
| 35 | Kalendarz i dostepnosc: timezone + RBAC + flow nieobecnosci | Scheduling Hardening | P0 | [ ] |
| 36 | Klienci i raporty: domkniecie acceptance criteria | UX / Reports Hardening | P1 | [ ] |
| 37 | Sprzet: security i domkniecie przypisan do uslug | Equipment Hardening | P1 | [ ] |

---

## Zrodlo wymagan

Feedback klientki (kwiecien 2026). Oryginalne punkty zmapowane na sprinty:

| Feedback | Sprint |
|----------|--------|
| Przychod wg pracownikow - header pokazuje zawsze 7 dni | 25 |
| Zmiany - artefakty, bledy w pisowni | 25 |
| Cena: stala / zmienna / od / ukryta / darmowa | 26 |
| Przy dodawaniu uslugi - Dodatki i Obrazki | 27 |
| Przypisanie pracownika po dodaniu uslugi | 27 |
| Szablony dodatkow do pojedynczych uslug | 27 |
| Wiele uslug naraz w oknie edycji pracownika | 28 |
| Pracownik / uslugi - przewijanie, wysuwany panel | 28 |
| Urlopy - zakresy od-do | 29 |
| Rezerwacja czasu (usluga wewnetrzna) | 29 |
| Kalendarz: Rezerwacja czasu, Nieobecnosc | 29 |
| Zapisz konfliktujace wizyty po potwierdzeniu | SS2.3-13 |
| Edycja wizyty - wysylka SMS z szablonu | 30 |
| Widok listy klientow | 31 |
| Raport: sposoby zakonczenia transakcji | 32 |
| Godziny przepracowane przez pracownika | 32 |
| Sprzet - lista / kafelki | 33 |
| Tworzenie sprzetu - przypisanie do uslugi | 33 |

---

## Follow-up po review wdrozenia

Dodatkowe sprinty 34-37 domykaja luki wykryte podczas pelnego review SS2.4:

| Obszar | Sprint |
|--------|--------|
| `price_type` nie wraca z glownego API services i rozjezdza edycje/listy | 34 |
| Public booking zapisuje `base_price` bez semantyki `price_type` | 34 |
| Rezerwacje czasu i availability maja ryzyko przesuniecia przez timezone | 35 |
| RLS dla nieobecnosci / rezerwacji czasu jest zbyt szeroki wzgledem specyfikacji | 35 |
| Menu kalendarza nie otwiera flow nieobecnosci zgodnie ze sprintem | 35 |
| Widok listy klientow nie zapisuje sortowania w URL | 36 |
| Raporty nie domykaja bucketingu / filtrow z acceptance criteria | 36 |
| Endpoint przypisania sprzetu do uslug nie waliduje salon_id dla serviceIds | 37 |
| Post-create / list view sprzetu wymaga domkniecia security i UX | 37 |
