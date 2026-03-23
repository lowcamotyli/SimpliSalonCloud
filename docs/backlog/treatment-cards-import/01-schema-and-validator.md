# Task 01 - Schema And Validator

## Objective
Zdefiniowac kanoniczny format importowy i wspolny walidator, tak aby parser, review i zapis do DB korzystaly z jednego kontraktu opartego na bogatszym artefakcie, a nie tylko plaskim `FormTemplate`.

## Why First
Bez jednego schematu kolejne etapy beda produkowaly rozne struktury i review stanie sie niestabilne.

## Read Only Context
- `docs/backlog/treatment-cards-import/00-canonical-data-shape.md`
- `types/forms.ts`
- `app/api/forms/templates/route.ts`
- `lib/forms/builtin-templates.ts`

## Output Files
- `lib/forms/import-types.ts`
- `lib/forms/import-validator.ts`
- `docs/backlog/treatment-cards-import/import-json-example.json`

## Required Decisions
- Jak wyglada format posredni poza runtime `FormTemplate`
- Jak odwzorowac `source`, `extraction`, `structure`, `compliance`, `templateDraft`, `mapping`
- Jak zapisujemy `meta`, `warnings`, `confidence`, `sourceFile`
- Ktore pola sa wymagane na etapie draft, a ktore dopiero przy approved import

## New Types Required
W `lib/forms/import-types.ts` zdefiniowac:
- `DataCategory = 'general' | 'health' | 'sensitive_health'`
- `ComplianceInfo { dataCategory, healthFieldCount, sensitiveFieldCount, requiresHealthConsent, reviewRequired, reviewNotes }`
- Rozszerzony `BuiltinFormTemplate` z `data_category: DataCategory` (cel zapisu w task 06)
- `ImportArtifact` - pelny kanoniczny artefakt per karta

Uwaga: `types/forms.ts` `FormTemplate` dostanie `data_category` po migracji #1.
Na etapie importu wystarczy ze `BuiltinFormTemplate` ma `data_category`.

## Scope
- Wydzielic Zod schema dla:
  - `FormField`
  - `ImportFormTemplate` (z `data_category`)
  - `ComplianceInfo`
  - pelnego `ImportArtifact` (source + extraction + compliance + templateDraft + mapping)
- Ustalic enum statusow importu: `draft`, `review_required`, `approved`, `rejected`
- Przygotowac przyklad JSON dla jednej karty (np. KOSMETOLOGIA_BB_Glow)

## Acceptance Criteria
- Jeden validator moze sprawdzic kazdy wygenerowany plik JSON
- Schemat jest zgodny z obecnym runtime formularzy i zawiera `data_category`
- Format przewiduje warningi i confidence bez rozszerzania DB
- Format zachowuje surowa ekstrakcje i draft runtime w jednym artefakcie
- `ComplianceInfo` jest walidowany i nie moze byc pusty

## Suggested Agent
- Codex direct

## Resume Prompt
Read `docs/backlog/treatment-cards-import/00-canonical-data-shape.md`, `docs/backlog/treatment-cards-import/01-schema-and-validator.md`, `types/forms.ts`, `app/api/forms/templates/route.ts`, and `lib/forms/builtin-templates.ts`.
Do NOT use Gemini.
Create shared import types and Zod validators for treatment-card import artifacts.
Write directly.
