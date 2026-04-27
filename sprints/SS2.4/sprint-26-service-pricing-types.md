# Sprint SS2.4-26 — Typy cen usługi (DB + API + UI)

## Cel
(P0) Rozbudowa modelu cenowego usług o 5 typów: stała, zmienna, zaczynająca się od, ukryta, darmowa.
Aktualnie usługa ma tylko jedno pole `price` (liczba). Nowy model dodaje `price_type` enum
który zmienia jak cena jest wyświetlana klientom i w systemie.

## Architektura — dokumenty referencyjne

```bash
DAD_PROMPT='Read /mnt/d/SimpliSalonCLoud/docs/architecture/data-architecture.md. List ALL constraints for the services table, price fields, and any places where price is displayed to clients (public booking). FORMAT: Bulleted list. Do NOT summarize away exceptions.' bash ~/.claude/scripts/dad-exec.sh
```

| Dokument | Dlaczego |
|----------|----------|
| `docs/architecture/data-architecture.md` | Schemat tabeli `services`, powiązania z `bookings` |
| `docs/architecture/multi-tenant-architecture.md` | RLS na services — salon_id |

**Kluczowe constraints:**
- Tabela `services` ma RLS — każda migracja musi zachować istniejące policies
- Cena w `bookings` — sprawdzić czy `bookings.price` kopiuje wartość z usługi czy jest live link
- Public booking: ukryta cena → nie zwracać wartości `price` w publicznym API
- Darmowa: `price = 0` + `price_type = 'free'` — dwa pola muszą być spójne

## Typy cen — specyfikacja

| Typ | Wartość DB | Wyświetlanie klientowi | Wyświetlanie w panelu |
|-----|-----------|----------------------|----------------------|
| `fixed` | stała liczba | "50 zł" | "50 zł" |
| `variable` | opcjonalna liczba (dolna granica) | "Cena zmienna" | "od X zł (zmienna)" |
| `from` | liczba | "od 50 zł" | "od 50 zł" |
| `hidden` | dowolna liczba | "Cena do ustalenia" | wartość widoczna w panelu |
| `free` | 0 | "Bezpłatna" | "Bezpłatna" |

## Zakres

### DB (codex-dad)
- [ ] Migracja: dodaj kolumnę `price_type` na tabeli `services`
  - Typ: `TEXT` z CHECK constraint: `('fixed','variable','from','hidden','free')`
  - Default: `'fixed'` — backward compatible
  - Nullable: NIE (z defaultem wszystkie istniejące rekordy dostaną 'fixed')
- [ ] Migracja: zaktualizuj lub dodaj indeks jeśli potrzebny

### API (codex-main)
- [ ] `app/api/services/route.ts` — dodaj `price_type` do POST/PATCH body + walidacja
- [ ] `app/api/services/[id]/route.ts` — obsługa `price_type` w GET (zwracaj pole) + PATCH
- [ ] Publiczne API (public booking) — `hidden` → nie zwracaj wartości price, zwróć tylko `price_type`

### UI — Admin panel (codex-dad)
- [ ] `components/services/service-form.tsx` (lub analogiczny) — dodaj selector typów ceny
  - Radio group lub select: 5 opcji
  - Pole `price` widoczne/wymagane zależnie od typu (`free` → ukryte, `hidden` → opcjonalne)
  - Label przy cenie zmienia się wg typu ("Cena", "Cena od", "Cena minimalna")
- [ ] Lista usług — wyświetlaj cenę zgodnie z typem (nie zawsze surowa liczba)

### UI — Public booking (codex-main)
- [ ] Strona publiczna rezerwacji — wyświetlaj cenę wg `price_type`

## Work packages

- ID: pkg-db | Type: migration | Worker: codex-dad | Outputs: `supabase/migrations/[ts]_service_price_type.sql`
- ID: pkg-api | Type: implementation | Worker: codex-main | Inputs: pkg-db (gen types po migracji) | Outputs: API routes
- ID: pkg-ui-admin | Type: implementation | Worker: codex-dad | Inputs: pkg-api | Outputs: service-form
- ID: pkg-ui-public | Type: implementation | Worker: codex-main | Inputs: pkg-api | Outputs: public booking view

## Verification

```bash
supabase db push
supabase gen types typescript --linked > types/supabase.ts
npx tsc --noEmit
# Ręcznie: utwórz usługę z typem 'hidden' — sprawdź czy cena nie jest widoczna publicznie
# Ręcznie: utwórz usługę 'free' — sprawdź czy price=0 i wyświetla "Bezpłatna"
```

## Acceptance criteria

- [ ] Wszystkie 5 typów cen dostępne w formularzu usługi
- [ ] Zapis i odczyt `price_type` przez API
- [ ] Publiczny widok rezerwacji nie pokazuje wartości ceny dla `hidden`
- [ ] Istniejące usługi (bez `price_type`) działają normalnie (default `fixed`)
- [ ] `npx tsc --noEmit` → clean po gen types
