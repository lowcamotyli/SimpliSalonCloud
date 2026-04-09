# Sprint B2-00 — Cleanup Dead Code

## Cel

Usunac martwy kod przed rozpoczeciem Phase 1 i zostawic jeden kanoniczny plik procesora Booksy bez zmiany logiki biznesowej.

## Faza + Wave

- Faza: Pre
- Wave: 0
- Worker: Claude bezposrednio

## Zakres

- [ ] Usunac `app/api/webhooks/booksy/booksy-webhook-route.ts` jako dead code bez auth, zastepowany przez `handler.ts`
- [ ] Zachowac `lib/booksy/processor.ts` jako jedyny kanoniczny procesor
- [ ] Przeanalizowac `lib/booksy/booksy-processor.ts`
- [ ] Jezeli `lib/booksy/booksy-processor.ts` jest duplikatem lub stara wersja, usunac plik
- [ ] Jezeli `lib/booksy/booksy-processor.ts` ma unikalne metody, przeniesc je do `lib/booksy/processor.ts` i potem usunac plik
- [ ] Nie zmieniac logiki procesora, tylko skonsolidowac strukture

## Pliki

| Plik | Akcja | Worker |
|------|-------|--------|
| `app/api/webhooks/booksy/booksy-webhook-route.ts` | DELETE | Claude |
| `lib/booksy/processor.ts` | KEEP / ewentualny merge metod | Claude |
| `lib/booksy/booksy-processor.ts` | REVIEW -> DELETE albo merge+DELETE | Claude |

## Zaleznosci

- Wymaga: brak
- Blokuje: B2-01
- Parallel z: brak

## Kroki wykonania

- Otworz `app/api/webhooks/booksy/booksy-webhook-route.ts`, `lib/booksy/processor.ts` i `lib/booksy/booksy-processor.ts`
- Potwierdz, czy `booksy-webhook-route.ts` nie jest nigdzie realnie uzywany i usun plik
- Porownaj oba procesory linia po linii pod katem unikalnych metod lub eksportow
- Jezeli potrzebne, scal brakujace fragmenty do `lib/booksy/processor.ts` bez zmiany zachowania
- Usun `lib/booksy/booksy-processor.ts`, jesli po scaleniu nie jest juz potrzebny
- Uruchom `npx tsc --noEmit`

## Done when

- `npx tsc --noEmit` przechodzi clean
- W repo pozostaje jeden plik procesora Booksy
- Nie ma martwych plikow webhook/processora po starej sciezce
