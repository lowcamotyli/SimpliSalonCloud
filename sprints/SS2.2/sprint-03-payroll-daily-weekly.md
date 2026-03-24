# Sprint SS2.2-03 — Payroll: Daily & Weekly Reports

## Cel
Dodanie raportów płacowych w ujęciu dziennym i tygodniowym. Aktualnie dostępny jest tylko miesięczny.

## Architektura — dokumenty referencyjne

Przed dispatchem przeczytaj:
```bash
gemini -p "Read docs/architecture/bounded-contexts.md. Summarize: payroll domain ownership, what data sources payroll uses, any constraints on report generation. Max 15 lines." --output-format text 2>/dev/null | grep -v "^Loaded"
```

| Dokument | Dlaczego |
|----------|----------|
| `docs/architecture/bounded-contexts.md` | "Staff & Operations" — payroll domain, dozwolone źródła danych |
| `docs/architecture/data-architecture.md` | Struktura `payroll_entries` tabeli, relacje |

**Kluczowe constraints:**
- Payroll jest w "Staff & Operations" bounded context — dane tylko z własnego salonu (`salon_id` filtr)
- Raporty dzienne/tygodniowe nie tworzą nowych wpisów — czytają istniejące `payroll_entries` z innym `start/end` range
- `payroll_entries` ma `salon_id` — wszystkie queries muszą go filtrować

## Stan aktualny
- `lib/payroll/period.ts` — obsługuje tylko miesiąc (format `YYYY-MM`)
- `app/api/payroll/route.ts` (253 linie) — `GET ?month=YYYY-MM`, `POST { month }` — tylko monthly
- `app/(dashboard)/[slug]/payroll/page.tsx` (314 linie) — UI selector miesięcy
- `lib/payroll/access.ts` + `lib/validators/payroll.validators.ts` — brak info o daily/weekly

## Zakres tego sprintu
- [ ] Extend `lib/payroll/period.ts` — nowe typy: `daily` (`YYYY-MM-DD`) i `weekly` (`YYYY-WNN`)
- [ ] Update API: akceptuj `?period=YYYY-MM-DD&type=daily` lub `?period=YYYY-WNN&type=weekly`
- [ ] Update UI: przełącznik Dzień / Tydzień / Miesiąc + odpowiednie selectory dat

## Pliki do modyfikacji

| Plik | Akcja | Worker |
|------|-------|--------|
| `lib/payroll/period.ts` | EDIT (extend) | codex-main |
| `app/api/payroll/route.ts` | EDIT (extend) | codex-dad |
| `app/(dashboard)/[slug]/payroll/page.tsx` | EDIT (UI) | codex-dad |

## Zależności
- **Wymaga:** nic (sprint niezależny)

---

## Krok 0 — Odczyt przed dispatchem

```bash
gemini -p "Read lib/payroll/period.ts and lib/validators/payroll.validators.ts. Show the full content/exports and types used. Max 30 lines." --output-format text 2>/dev/null | grep -v "^Loaded"
```

---

## Prompt — codex-main (period.ts)

```bash
codex exec --dangerously-bypass-approvals-and-sandbox "Do NOT use Gemini — write directly.

Read lib/payroll/period.ts and lib/validators/payroll.validators.ts for current implementation.

Goal: Extend payroll period utilities to support daily and weekly periods in addition to monthly.
File: lib/payroll/period.ts

Add:
- Type: PayrollPeriodType = 'daily' | 'weekly' | 'monthly'
- Function getPeriodRange(period: string, type: PayrollPeriodType): { start: Date; end: Date; label: string }
  - daily: period='YYYY-MM-DD' → single day range, label='DD MMM YYYY' (Polish locale)
  - weekly: period='YYYY-WNN' (ISO week) → Mon-Sun range, label='Tydzień NN, YYYY (DD MMM - DD MMM)'
  - monthly: period='YYYY-MM' → existing logic
- Export PayrollPeriodType
- Keep existing exports backward-compatible (do not break monthly logic)
Done when: all three period types return correct { start, end, label }."
```

---

## Prompt — codex-dad (API + UI)

```bash
DAD_PROMPT="Read app/api/payroll/route.ts and app/(dashboard)/[slug]/payroll/page.tsx and lib/payroll/period.ts.

Goal: Extend payroll API and UI to support daily and weekly report periods.

File 1: /mnt/d/SimpliSalonCLoud/app/api/payroll/route.ts
- GET: accept query params ?period=YYYY-MM-DD&type=daily OR ?period=YYYY-WNN&type=weekly OR ?month=YYYY-MM (backward compat)
  - If type not provided, default to 'monthly', treat period/month as YYYY-MM
  - Use getPeriodRange() from lib/payroll/period.ts to get { start, end }
  - Query payroll_entries between start and end (instead of hardcoded month logic)
- POST: accept body { period: string; type: PayrollPeriodType }
  - Backward compat: if only month provided, treat as monthly

File 2: /mnt/d/SimpliSalonCLoud/app/(dashboard)/[slug]/payroll/page.tsx
- Add period type switcher: tabs or segmented control (Dzień | Tydzień | Miesiąc)
- Daily: date picker (single day)
- Weekly: week picker (show 'Tydzień N, YYYY') — can use a simple previous/next week navigation
- Monthly: existing month picker (keep as-is)
- Update API calls to pass correct period + type params
- Show period label (from getPeriodRange) in report header
- Do not break existing monthly flow

Done when: all three period types load correct payroll data." bash ~/.claude/scripts/dad-exec.sh
```

---

## Po wykonaniu

```bash
npx tsc --noEmit
```

## Done when
- `lib/payroll/period.ts` eksportuje `PayrollPeriodType` i `getPeriodRange`
- API przyjmuje i zwraca dane dla daily/weekly/monthly
- UI ma trzy tryby z odpowiednimi date selektorami
- Monthly nadal działa bez zmian (backward compat)
- `tsc --noEmit` clean
