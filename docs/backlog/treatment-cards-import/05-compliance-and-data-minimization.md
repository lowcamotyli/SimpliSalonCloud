# Task 05 - Compliance And Data Minimization

## Objective
Przegladac wygenerowane artefakty JSON (task 04) i zatwierdzic klasyfikacje RODO przed zapisem do `builtin-templates.ts`.
To jest gate: nic nie idzie do kodu bez przejscia przez ten krok.

## Why This Gate Exists
- Karty zabiegowe zawieraja dane zdrowotne (Art. 9 GDPR - specjalna kategoria).
- Parser (task 03) ustawia `dataCategory` heurystycznie - wymaga weryfikacji ludzkiej.
- Pytania nadmiarowe lub niebezpieczne musza byc usuniete przed importem.
- Szablony `sensitive_health` nie moga byc aktywne bez swiadomej decyzji salonu.

## Read Only Context
- `generated/form-templates/report.json`
- `generated/form-templates/*.json` (zwlaszcza `review_required: true`)
- `docs/backlog/treatment-cards-import/00-canonical-data-shape.md` (reguly klasyfikacji)

## Scope
Dla kazdego artefaktu z `review_required: true` lub `dataCategory != 'general'`:
1. Sprawdz `compliance.reviewNotes` - czy parser mial watpliwosci
2. Sprawdz kazde pole z `_healthMarker: true` lub `_sensitiveMarker: true`
3. Zdecyduj: zostaje / usun / zmien pytanie na mniej inwazyjne
4. Potwierdz lub zmien `dataCategory`
5. Ustaw `approved: true` w artefakcie (reczna edycja JSON lub skrypt)

## Data Category Decision Rules

| Kategoria zrodlowa | Domyslna `dataCategory` | Override gdy |
|---|---|---|
| FRYZJERSTWO, PIELEGNACJA_DLONI, OPRAWA_OKA, MAKIJAZ | `general` | ma pytania o leki → `health` |
| KOSMETOLOGIA, MASAZE, PODOLOGIA, TRYCHOLOGIA | `health` | brak pytan zdrowotnych → `general` |
| MEDYCYNA_ESTETYCZNA, HI-TECH, TATUAZ_PIERCING, dr_n_med_* | `sensitive_health` | - |
| ZDROWIE (trening, fizjoterapia, pilates) | `health` | - |
| Karty wielojezyczne | odpowiada polskiemu odpowiednikowi | - |

## Output
- Zaktualizowane artefakty JSON z `approved: true` i finalnym `dataCategory`
- Ewentualne usuniete/zmodyfikowane pola
- Lista kart odrzuconych (`rejected: true`) z powodem

## Non-Goals
- Nie pisz zadnego kodu
- Nie importuj do DB
- Nie edytuj `builtin-templates.ts`

## Acceptance Criteria
- Kazdy artefakt ma `approved: true` lub `rejected: true`
- Zadna karta `sensitive_health` nie ma `approved: true` bez swiadomego potwierdzenia
- Pola z `_sensitiveMarker: true` zostaly przejrzane i zaakceptowane lub usuniete
- `requiresHealthConsent: true` dla wszystkich `health` i `sensitive_health`

## Suggested Agent
- Czlowiek (review) + Claude do edycji artefaktow

## Resume Prompt
Read `generated/form-templates/report.json` and flagged artifacts from `generated/form-templates/`.
Review compliance classification for each card with `review_required: true`.
For each: confirm or correct `dataCategory`, remove overly broad health questions, set `approved: true`.
Edit JSON files directly. Do NOT import to DB yet.
