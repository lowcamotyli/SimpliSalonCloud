# Task 00 - Canonical Data Shape

## Objective
Ustalic lepszy, bogatszy format kanoniczny dla importu kart, wykorzystujacy to, ze pliki w `karty_zabiegowe/do_wysylki_klientom/` sa juz wstepnie sformatowane.

## Why This Changes The Plan
Nie warto parsowac od razu do plaskiego `FormTemplate`. Lepsze zrodlo i lepszy format posredni dadza:
- mniejsza liczbe heurystyk
- latwiejsze review
- mozliwosc reimportu bez utraty danych z ekstrakcji
- prostsze debugowanie kart problematycznych

## Preferred Source Order
1. `karty_zabiegowe/do_wysylki_klientom/*.md`
2. `karty_zabiegowe/*.md` jako fallback

## Proposed Canonical Format
Kazda karta powinna byc zapisana jako jeden artefakt JSON:

```json
{
  "version": 1,
  "source": {
    "preferredFile": "karty_zabiegowe/do_wysylki_klientom/FRYZJERSTWO_keratynowe_prostowanie_(karta_ogolna).md",
    "fallbackFile": "karty_zabiegowe/FRYZJERSTWO_keratynowe_prostowanie_(karta_ogolna).md",
    "language": "pl",
    "category": "FRYZJERSTWO",
    "serviceName": "keratynowe prostowanie (karta ogolna)"
  },
  "extraction": {
    "title": "FRYZJERSTWO: keratynowe prostowanie (karta ogolna)",
    "intro": "Zweryfikuj zawartosc...",
    "questionBlocks": [],
    "legalBlocks": [],
    "warnings": []
  },
  "structure": {
    "sections": [],
    "consents": [],
    "signatureRequired": true
  },
  "compliance": {
    "dataCategory": "general",
    "healthFieldCount": 0,
    "sensitiveFieldCount": 0,
    "requiresHealthConsent": false,
    "reviewRequired": false,
    "reviewNotes": []
  },
  "templateDraft": {
    "name": "FRYZJERSTWO: keratynowe prostowanie (karta ogolna)",
    "description": "Zaimportowane z biblioteki kart zabiegowych",
    "data_category": "general",
    "requires_signature": true,
    "gdpr_consent_text": "Wyrazam zgode...",
    "fields": []
  },
  "mapping": {
    "serviceMatchers": [],
    "confidence": 0.0,
    "needsManualReview": true
  }
}
```

## Why This Shape Is Better
- `source` trzyma pochodzenie i pozwala wracac do pliku zrodlowego.
- `extraction` przechowuje surowy wynik ekstrakcji przed finalnym mapowaniem.
- `structure` trzyma semantyke formularza: sekcje, zgody, podpis.
- `templateDraft` jest bezposrednio mapowalny do runtime SimpliSalon.
- `mapping` trzyma informacje potrzebne do przypiecia do uslug i review.

## Practical Consequence For Parser
Parser nie musi od razu idealnie budowac finalnego `fields[]`.
Najpierw moze stabilnie rozpoznac:
- tytul
- jezyk
- kategorie
- bloki pytan
- bloki prawne
- potencjalne pytania zalezne

## Source-Specific Notes
- `do_wysylki_klientom` ma czesciej rozbite pytania na osobne linie, wiec powinien byc parserem glownym.
- Surowe pliki z katalogu glownego nadal sa przydatne jako fallback i zrodlo porownawcze.
- Naglowek `## Klauzula informacyjna RODO` jest dobrym markerem granicy pytan i legal text.

## Data Category Rules
Klasyfikacja `dataCategory` w `compliance` bazuje na kategorii zrodlowej i zawartosci pol:
- `general` - FRYZJERSTWO, PIELEGNACJA_DLONI_I_STOP, OPAWA_OKA (stylizacja, laminacja), OPALANIE_NATRYSKOWE, MAKIJAZ podstawowy
- `health` - KOSMETOLOGIA, MASAZE, PODOLOGIA, TRYCHOLOGIA, zabiegi z pytaniami o leki/alergie/ciaze
- `sensitive_health` - MEDYCYNA_ESTETYCZNA, HI-TECH, TATUAZ_PIERCING, dr_n_med_*, zabiegi z pytaniami o choroby przewlekle/nowotwory/rozrusznik

Progi automatyczne (parser ustawia, task 05 weryfikuje):
- `healthFieldCount > 0` i kategoria KOSMETOLOGIA+ → `health`
- `sensitiveFieldCount > 2` lub kategoria MEDYCYNA_ESTETYCZNA/HI-TECH → `sensitive_health`
- `reviewRequired: true` gdy confidence < 0.7 lub `sensitiveFieldCount > 0`

## Acceptance Criteria
- Format kanoniczny nie gubi danych potrzebnych do review i reimportu.
- Da sie z niego wygenerowac finalny `FormTemplate`.
- Da sie porownac `preferredFile` z `fallbackFile`, gdy parser ma niska pewnosc.

## Suggested Agent
- Codex direct

## Resume Prompt
Read `docs/backlog/treatment-cards-import/00-canonical-data-shape.md`, `docs/backlog/treatment-cards-import/README.md`, and sample files from `karty_zabiegowe/do_wysylki_klientom/`.
Do NOT use Gemini.
Adjust the treatment-card import plan and shared types around the canonical artifact format that preserves source, extraction, structure, runtime draft, and mapping metadata.
Write directly.
