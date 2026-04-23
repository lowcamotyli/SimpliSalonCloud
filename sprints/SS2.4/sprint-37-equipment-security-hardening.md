# Sprint SS2.4-37 - Sprzet: Security i domkniecie przypisan do uslug

## Cel
(P1) Domkniecie sprintu 33 po review wdrozenia. Widok lista/kafelki dziala, ale endpoint przypisania
sprzetu do uslug nie waliduje tenant scope dla `serviceIds`, a flow post-create wymaga dopiecia
kontraktu i zabezpieczen.

## Architektura - dokumenty referencyjne

```bash
DAD_PROMPT='Read /mnt/d/SimpliSalonCLoud/docs/architecture/data-architecture.md and /mnt/d/SimpliSalonCLoud/docs/architecture/multi-tenant-architecture.md. List all constraints for equipment, service_equipment, and salon_id validation. FORMAT: Bulleted list.' bash ~/.claude/scripts/dad-exec.sh
```

| Dokument | Dlaczego |
|----------|----------|
| `docs/architecture/data-architecture.md` | equipment <-> services relation |
| `docs/architecture/multi-tenant-architecture.md` | tenant isolation / salon_id rules |

## Zdiagnozowane problemy

- [ ] `GET/PUT /api/equipment/[id]/services` sprawdza `equipment` tylko po `id`
- [ ] brak walidacji, czy kazde `serviceId` nalezy do tego samego salonu
- [ ] front opiera badge liczby uslug o zagniezdzony shape bez twardego kontraktu
- [ ] post-create modal zapisuje przypisania, ale bez dodatkowych guardow domenowych

## Zakres

### A - Endpoint hardening (codex-dad)
- [ ] `app/api/equipment/[id]/services/route.ts`
  - [ ] walidacja equipment w kontekscie aktualnego salonu
  - [ ] walidacja kazdego `serviceId` w kontekscie salonu
  - [ ] jawny blad 4xx dla cross-tenant ids
  - [ ] atomowy replace assignments lub bezpieczny odpowiednik
- [ ] `app/api/equipment/route.ts`
  - [ ] upewnij sie, ze shape GET jest stabilny dla listy / badge count

### B - UI contract cleanup (codex-main)
- [ ] `app/(dashboard)/[slug]/equipment/page.tsx`
  - [ ] dostosuj flow do zahardeningowanego endpointu
  - [ ] doprecyzuj empty / loading / error states dla modalu przypisania
- [ ] `components/equipment/equipment-list-view.tsx`
  - [ ] liczba przypisanych uslug opiera sie na stabilnym payloadzie
  - [ ] zachowaj toggle lista / kafelki bez regresji

### C - Regression coverage (codex-main)
- [ ] test dla odrzucenia `serviceId` z innego salonu
- [ ] test dla poprawnego zapisu wielu przypisan
- [ ] test dla post-create modal "Pomin" / "Przypisz"

## Work packages

- ID: pkg-api-security | Type: implementation | Worker: codex-dad | Outputs: secure equipment services endpoint
- ID: pkg-ui-contract | Type: implementation | Worker: codex-main | Inputs: pkg-api-security | Outputs: equipment UI alignment
- ID: pkg-tests | Type: review | Worker: codex-main | Inputs: pkg-api-security, pkg-ui-contract | Outputs: regression tests

## Verification

```bash
npx tsc --noEmit
# Test: cross-tenant serviceId -> endpoint odrzuca request
# Test: nowy sprzet -> modal przypisania -> zapis 2 uslug -> badge pokazuje 2
# Test: "Pomin" nie blokuje zapisu sprzetu
```

## Acceptance criteria

- [ ] Endpoint przypisania sprzetu waliduje salon scope dla equipment i serviceIds
- [ ] Lista i kafelki pokazuja poprawna liczbe przypisanych uslug
- [ ] Post-create modal sprzetu dziala stabilnie po hardeningu API
- [ ] `npx tsc --noEmit` -> clean
