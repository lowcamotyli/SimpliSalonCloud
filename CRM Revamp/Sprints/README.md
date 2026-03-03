# CRM Revamp – Indeks Sprintów

> Pliki wygenerowane na podstawie `../Plan.md` (Raport Architektoniczno-Strategiczny).  
> Każdy sprint jest samodzielnym dokumentem zoptymalizowanym pod kątem okna kontekstowego Gemini.

---

## Kolejność wdrożenia

| # | Plik | Co wdraża | Blokuje | Czas |
|---|---|---|---|---|
| 00 | [Sprint-00-Fundamenty-i-Srodowisko.md](./Sprint-00-Fundamenty-i-Srodowisko.md) | Setup: ENV, btree_gist, feature flags, CRON guard, RLS pattern | Wszystkie | 2–3 dni |
| 01 | [Sprint-01-Billing-Przelewy24.md](./Sprint-01-Billing-Przelewy24.md) | Subskrypcje, faktury, portmonetka SMS, dunning | Sprint 06 (SMS), Sprint 05 (linki) | 2–3 tyg. |
| 02 | [Sprint-02-Equipment-DB.md](./Sprint-02-Equipment-DB.md) | Schema DB sprzętu, EXCLUDE constraint, funkcja SQL | Sprint 03 | 3–5 dni |
| 03 | [Sprint-03-Equipment-Backend-Frontend.md](./Sprint-03-Equipment-Backend-Frontend.md) | API + UI sprzętu, walidacja kolizji, drag & drop | – | 2–3 tyg. |
| 04 | [Sprint-04-Medical-Forms-DB.md](./Sprint-04-Medical-Forms-DB.md) | Schema DB formularzy, szyfrowanie AES-256-GCM, JWT tokens | Sprint 05 | 1 tydzień |
| 05 | [Sprint-05-Medical-Forms-Frontend.md](./Sprint-05-Medical-Forms-Frontend.md) | Form Builder UI, publiczny flow, CRM widok, Beauty Plany | – | 2–3 tyg. |
| 06 | [Sprint-06-SMS-Chat-Reminders.md](./Sprint-06-SMS-Chat-Reminders.md) | Adapter SMS, czat Realtime, CRON przypomnienia, kampanie | Sprint 07 (SMS w blacklist) | 2–3 tyg. |
| 07 | [Sprint-07-Blacklist-CRM.md](./Sprint-07-Blacklist-CRM.md) | Scoring no-show, CRON blokady, CRM badge, blokada online | Sprint 08 (survey_sent) | 1 tydzień |
| 08 | [Sprint-08-Surveys-Reports.md](./Sprint-08-Surveys-Reports.md) | Ankiety NPS, publiczna strona, dashboard raportów, CSV | – | 1–2 tyg. |

---

## Diagram zależności

```
Sprint-00 (Fundamenty)
    │
    ├──→ Sprint-01 (Billing + portmonetka SMS)
    │         └──→ Sprint-06 (SMS) zależy od sms_wallet
    │
    ├──→ Sprint-02 (Equipment DB)
    │         └──→ Sprint-03 (Equipment Backend + Frontend)
    │
    ├──→ Sprint-04 (Medical Forms DB + Encryption)
    │         └──→ Sprint-05 (Medical Forms Frontend + Beauty Plans)
    │
    └──→ Sprint-06 (SMS Chat + Reminders)
              └──→ Sprint-07 (Blacklist CRM)
                        └──→ Sprint-08 (Surveys + Reports)
```

---

## Co jest wykluczone (Kategoria C wg Plan.md)

| Funkcja | Powód odrzucenia |
|---|---|
| ❌ Voicebot AI | 10/10 trudności, ROI = 0 na tym etapie |
| ❌ COGS / Mikro-kosztorysowanie | Próg UX za wysoki, moduł pozostałby pusty |
| ❌ Automatyzacja Facebook/Instagram | Blokady Meta API, niemożliwe dla MŚP |
| ❌ Posprzedażowe SMS e-commerce | Ryzyko spamu, degradacja kanału SMS |

---

## Zasady używania plików sprintów z Gemini

1. **Jeden sprint = jeden kontekst** – wklejaj do Gemini tylko aktualny plik sprintu + aktualnie modyfikowane pliki kodu.
2. **Zawsze dołącz Sprint-00** jako kontekst bazowy (feature flags, ENV, wzorzec RLS).
3. Przed każdym sprintem podaj Gemini listę już istniejących tabel (wynik `\dt` z psql lub Supabase Table Editor).
4. Przy bugfixie: dołącz sprint bieżący + poprzedni (zależności), nie cały plan.

---

## Całkowity szacowany czas wdrożenia

| Priorytet | Sprinty | Czas |
|---|---|---|
| 🔴 Krytyczne (A) | 00, 01, 02, 03, 04, 05 | 8–12 tygodni |
| 🟡 Retencyjne (B) | 06, 07, 08 | 4–6 tygodni |
| **Łącznie** | 9 sprintów | **12–18 tygodni** |
