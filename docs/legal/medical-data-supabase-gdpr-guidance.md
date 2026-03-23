# Medical Data On Supabase - GDPR Guidance

This document is an operational compliance guide for SimpliSalonCloud.
It is not a substitute for advice from a qualified lawyer reviewing the final deployment, contracts, and factual setup.

## Executive Summary

Using Supabase for treatment cards and health questionnaires can be lawful, but only if:

- the salon is clearly identified as the data controller,
- SimpliSalonCloud acts as a processor under a data processing agreement,
- Supabase is treated as a subprocessor,
- explicit consent for health data is actually collected and provable,
- access to answers is limited to a strict need-to-know group,
- retention and deletion rules are defined and enforced,
- international transfer wording matches the real vendor stack.

Today, the main legal risk is not "Supabase itself" but mismatch between:

- the consent/information text shown to the client,
- the real technical flow,
- the audit trail proving explicit health-data consent.

## Current State Observed In Repo

### What is already good

- `client_forms` stores answers encrypted at application level with AES-256-GCM style payload split into `answers`, `answers_iv`, and `answers_tag`.
- `client_forms` access was later tightened so only owner/manager should read form answers.
- the data model already distinguishes `general`, `health`, and `sensitive_health`.
- a `health_consent_at` column exists for provable explicit consent.

### What is still misaligned

- the public form page currently validates only `gdpr_consent`, not a distinct health-data consent checkbox;
- the submit endpoint does not populate `health_consent_at`;
- the short GDPR text is too generic for special-category health data;
- any statement that data is processed only in the EEA/EOG is unsafe unless verified for the full vendor chain.

## Roles And Contract Model

Recommended default model for salon deployments:

- Salon: controller of client personal data and health data.
- SimpliSalonCloud: processor acting on the salon's documented instructions.
- Supabase: subprocessor used by SimpliSalonCloud.
- Other infrastructure vendors: subprocessors or independent recipients depending on service and contract structure.

This should be reflected consistently in:

- customer-facing privacy notice shown by the salon,
- SimpliSalonCloud Terms/DPA with salon customers,
- SimpliSalonCloud vendor register and subprocessor list,
- internal records of processing activities.

## Practical GDPR Position

### Legal basis

Recommended split:

- ordinary client/contact/booking data: Art. 6(1)(b) GDPR where needed to perform the service or pre-contract steps;
- legal/accounting/consumer obligations: Art. 6(1)(c);
- health data needed for safe treatment: explicit consent under Art. 9(2)(a);
- post-service storage of health answers strictly for claims defense, incident handling, or legal defense: consider Art. 9(2)(f), but only if documented narrowly and reflected in retention logic.

Do not rely on a single mixed sentence for all purposes.
Separate:

- information clause,
- explicit health-data consent,
- treatment/procedure consent if used,
- optional marketing consent if ever added.

### Data minimization

Only ask questions needed for:

- contraindications,
- treatment safety,
- immediate treatment qualification,
- post-treatment recommendations where justified.

Questions that are broad, diagnostic, or "nice to have" should be removed.

### Need-to-know access

For health answers, the safe default is:

- owner and manager can read full answers,
- employee access should be exceptional and role-based,
- front-desk/reception should not browse raw health answers,
- operational status such as "form submitted" should be stored separately from content access.

## Recommended Client-Facing Text

Use two separate elements:

1. information clause under Art. 13 GDPR;
2. explicit consent checkbox for health data under Art. 9(2)(a).

Do not merge them into one checkbox sentence.

### A. Information Clause Template

Replace placeholders before use.

```text
Administratorem Twoich danych osobowych jest [NAZWA SALONU] z siedziba w [ADRES], e-mail: [EMAIL], tel.: [TELEFON] ("Administrator").

W sprawach dotyczacych ochrony danych osobowych mozesz skontaktowac sie z Administratorem pod adresem: [EMAIL KONTAKTOWY]. Jezeli Administrator wyznaczyl inspektora ochrony danych, dane kontaktowe IOD: [DANE IOD].

Twoje dane osobowe, w tym dane dotyczace zdrowia zawarte w karcie zabiegowej lub formularzu przedzabiegowym, sa przetwarzane w nastepujacych celach:

1. Umowienie wizyty, przygotowanie i wykonanie uslugi lub podjecie dzialan przed zawarciem umowy - na podstawie art. 6 ust. 1 lit. b RODO.
2. Realizacja obowiazkow wynikajacych z przepisow prawa, w szczegolnosci podatkowych, rachunkowych oraz zwiazanych z obsluga reklamacji - na podstawie art. 6 ust. 1 lit. c RODO.
3. Ocena przeciwskazan, bezpieczne przeprowadzenie zabiegu oraz udokumentowanie informacji o stanie zdrowia niezbednych do wykonania uslugi - w zakresie danych dotyczacych zdrowia na podstawie Twojej wyraznej zgody, tj. art. 9 ust. 2 lit. a RODO.
4. Ustalenie, dochodzenie lub obrona przed roszczeniami zwiazanymi z wykonana usluga - odpowiednio na podstawie art. 6 ust. 1 lit. f RODO, a w zakresie danych dotyczacych zdrowia takze art. 9 ust. 2 lit. f RODO, jezeli i w zakresie, w jakim dalsze przechowywanie tych danych jest niezbedne do tego celu.

Podanie danych zwyklych jest dobrowolne, ale niezbedne do rezerwacji i wykonania uslugi. Podanie danych dotyczacych zdrowia jest dobrowolne, jednak ich niepodanie moze uniemozliwic bezpieczne wykonanie niektorych zabiegow.

Odbiorcami Twoich danych moga byc podmioty swiadczace na rzecz Administratora uslugi IT, hostingowe, komunikacyjne, ksiegowe, prawne oraz podmioty wspierajace obsluge rezerwacji i dokumentacji klienta - wylacznie na podstawie odpowiednich umow i zgodnie z poleceniami Administratora.

Twoje dane sa co do zasady przechowywane w infrastrukturze zlokalizowanej na terenie Europejskiego Obszaru Gospodarczego. W zwiazku z korzystaniem przez Administratora lub jego dostawcow z uslug technologicznych moze dochodzic do przekazywania danych poza EOG. W takim przypadku przekazanie odbywa sie z zastosowaniem odpowiednich zabezpieczen wymaganych przez RODO, w szczegolnosci standardowych klauzul umownych lub innego zgodnego z prawem mechanizmu transferowego.

Twoje dane beda przechowywane:
- przez okres niezbedny do wykonania uslugi i obslugi wizyty,
- przez okres wymagany przepisami prawa, jezeli taki obowiazek wynika z przepisow,
- przez okres przedawnienia roszczen lub do czasu zakonczenia sporu - w zakresie danych potrzebnych do obrony przed roszczeniami,
- do czasu wycofania zgody - jezeli jedyna podstawa przetwarzania jest zgoda, przy czym wycofanie zgody nie wplywa na zgodnosc z prawem przetwarzania dokonanego przed jej wycofaniem.

Przysluguje Ci prawo dostepu do danych, ich sprostowania, usuniecia, ograniczenia przetwarzania, przenoszenia danych, wycofania zgody oraz wniesienia sprzeciwu - w przypadkach przewidzianych prawem. Masz takze prawo wniesienia skargi do Prezesa Urzedu Ochrony Danych Osobowych.
```

### B. Explicit Health-Data Consent Template

This should be shown as a separate required checkbox when the template category is `health` or `sensitive_health`.

```text
Wyrazam wyrazna zgode na przetwarzanie podanych przeze mnie danych dotyczacych zdrowia zawartych w karcie zabiegowej / formularzu przedzabiegowym w celu oceny przeciwskazan oraz bezpiecznego wykonania wybranej uslugi przez [NAZWA SALONU].
Przyjmuje do wiadomosci, ze zgoda jest dobrowolna, lecz jej brak moze uniemozliwic wykonanie zabiegu. Wiem, ze moge wycofac zgode przed wykonaniem uslugi, przy czym wycofanie zgody nie wplywa na zgodnosc z prawem przetwarzania dokonanego przed jej wycofaniem.
```

### C. Important Wording Notes

Do not state:

- "all data is processed only in the EEA" unless fully verified;
- "consent is the basis for all processing";
- "data is stored as long as necessary" without any criteria;
- that employees generally need access to health answers if your model does not require it.

## Required Documents And Decisions

### Must-have

1. DPA between SimpliSalonCloud and each salon customer.
2. subprocessor list covering Supabase and other material vendors.
3. internal retention schedule for:
   - ordinary booking data,
   - signed forms,
   - health questionnaires,
   - signature images,
   - logs and backups.
4. record of processing activities.
5. incident and breach response procedure.

### Strongly recommended

1. DPIA for treatment-card and health-questionnaire processing.
2. transfer assessment note for vendor stack.
3. access-control matrix documenting who can view:
   - raw answers,
   - consent status,
   - signature files,
   - audit history.
4. documented deletion workflow for salon offboarding and data-subject requests.

## Required Product And Engineering Changes

These changes are needed so the factual setup matches the recommended legal wording.

### High priority

1. Add a separate required health-consent checkbox on the public form for `health` and `sensitive_health` templates.
2. Persist `health_consent_at = NOW()` when that checkbox is checked for health-category templates.
3. Validate server-side that health-category forms cannot be submitted without explicit health consent.
4. Return enough template metadata to the public form to know whether health consent is mandatory.
5. Confirm production RLS matches the restrictive `owner` / `manager` read policy for `client_forms`.

### Medium priority

1. Store an immutable audit record of:
   - template version,
   - consent text shown,
   - consent timestamp,
   - submit timestamp,
   - actor or token used.
2. Separate "form submitted" status from "form content readable".
3. Add a retention job or review process for expired health-form records and signature assets.
4. Define whether signed URL storage for signatures is acceptable for the intended retention model; long-term evidence usually needs stable controlled access, not short-lived read links only.

### Nice to have

1. Add compliance warnings in the form-template editor when `data_category` is `health` or `sensitive_health`.
2. Add a report for forms missing `health_consent_at`.
3. Add an admin checklist before enabling imported sensitive-health templates.

## Implementation Notes For This Repo

Relevant files:

- `app/forms/fill/[token]/page.tsx`
- `app/api/forms/public/[token]/route.ts`
- `app/api/forms/submit/[token]/route.ts`
- `supabase/migrations/20260310000000_medical_forms.sql`
- `supabase/migrations/20260401000002_restrict_client_forms_select.sql`
- `supabase/migrations/20260401000003_health_consent_at.sql`

Observed gap:

- the migration says `health_consent_at` must be set during submit for health templates;
- the current submit route only loads `fields` and never loads `data_category`;
- the current submit route updates encrypted answers and timestamps, but not `health_consent_at`;
- the current public form page renders only one generic GDPR checkbox.

## Ship / No-Ship Recommendation

For general, non-health forms: can ship with ordinary GDPR text once controller/processor wording is aligned.

For `health` and `sensitive_health` forms: no-ship for broad rollout until all of the following are true:

1. explicit health consent is separate and auditable;
2. production RLS is verified;
3. retention is defined;
4. transfer wording is corrected;
5. controller/processor documents are in place.

## Source Notes

This guidance was prepared against the repository state and current official/primary references, including:

- GDPR Art. 9 and Art. 13,
- GDPR Art. 35 for DPIA,
- UODO guidance on health data,
- Supabase official regions, DPA, and transfer assessment materials.
