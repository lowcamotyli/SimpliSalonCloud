# Sprint SS2.4-40 - Kalendarz panelu: render rezerwacji czasu w timezone salonu

## Cel
(P1) Domkniecie ostatniej luki po sprintach 29 i 35. Backend zapisuje `time_reservations` timezone-safe,
ale kalendarz panelu renderuje je wedlug timezone przegladarki. To grozi:
1. pokazaniem bloku w zlym dniu,
2. przesunieciem godzin w day/week view,
3. niespojnoscia miedzy availability a widokiem panelowym.

## Architektura - dokumenty referencyjne

```bash
DAD_PROMPT='Read /mnt/d/SimpliSalonCLoud/docs/architecture/data-architecture.md. List all constraints for calendar rendering, employee time blocks, and salon timezone display semantics. FORMAT: Bulleted list.' bash ~/.claude/scripts/dad-exec.sh
```

| Dokument | Dlaczego |
|----------|----------|
| `docs/architecture/data-architecture.md` | calendar model, booking day/time semantics |

## Zdiagnozowane problemy

- [ ] `app/(dashboard)/[slug]/calendar/page.tsx` filtruje `time_reservations` po `formatDate(new Date(start_at))`
- [ ] pozycjonowanie bloku bierze `getHours()/getMinutes()` z timezone klienta
- [ ] day/week view nie korzysta z timezone salonu mimo ze API juz je respektuje
- [ ] brak regresji dla renderu przy timezone przegladarki != timezone salonu

## Zakres

### A - Timezone-safe calendar rendering (codex-dad)
- [ ] `app/(dashboard)/[slug]/calendar/page.tsx`
  - [ ] pobierz / wylicz timezone salonu dostepny dla kalendarza
  - [ ] render `time_reservations` przez helpery zoned parts zamiast `Date#getHours`
  - [ ] day i week view maja pokazywac ten sam lokalny slot co zapis w API
- [ ] jezeli potrzeba, dopnij helper UI do mapowania `start_at/end_at -> local day/minutes`

### B - UX consistency checks (codex-dad)
- [ ] upewnij sie, ze klik na slot -> zapis -> odswiezenie pokazuje blok w tym samym miejscu
- [ ] nie wprowadzaj regresji dla zwyklych booking cards

### C - Regression coverage (codex-dad)
- [ ] test lub co najmniej jawna procedura manualna dla browser timezone != salon timezone
- [ ] test: reservation crossing midnight renderuje sie na poprawnym dniu/dniach albo jest jawnie ograniczona kontraktem

## Work packages

- ID: pkg-calendar-render-tz | Type: implementation | Worker: codex-dad | Outputs: timezone-safe render `time_reservations`
- ID: pkg-calendar-render-verification | Type: review | Worker: codex-dad | Inputs: pkg-calendar-render-tz | Outputs: regresja / procedura weryfikacyjna

## Verification

```bash
npx tsc --noEmit
# Test: przegladarka w innej timezone niz salon -> blok czasu widoczny na tej samej lokalnej godzinie salonu
# Test: dodanie rezerwacji czasu z kalendarza po refreshu zostaje w tym samym slocie
```

## Acceptance criteria

- [ ] Kalendarz panelu renderuje `time_reservations` w timezone salonu
- [ ] Day i week view pokazuja blok w poprawnym dniu i godzinie
- [ ] UI jest spojne z timezone-safe backendem z poprzednich sprintow
- [ ] `npx tsc --noEmit` -> clean
