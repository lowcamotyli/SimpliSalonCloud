# AppForge — Sprint Reference Index

Każdy sprint powinien czytać tylko dokumenty relevantne do swojego zakresu.
Brak limitów linii dla tych plików — czytaj w całości.

## Lookup: typ zadania → dokument

| Zadanie w sprincie | Czytaj |
|--------------------|--------|
| Nowa migracja SQL, tabela, indeks | `DB-SCHEMA.md` |
| API route / server action / getAuthContext | `SECURITY.md` |
| RLS policy, uprawnienia, role | `SECURITY.md` |
| Nowy moduł (manifest, lifecycle, slots) | `MODULE-SYSTEM.md` |
| Komunikacja między modułami (events, public API) | `EVENTS.md` |
| Komponenty UI, useComponents(), theme | `THEME-SYSTEM.md` |
| app-config.ts, moduleConfigs, wizard output | `APP-CONFIG.md` |
| Architektura ogólna, warstwy, katalogi | `OVERVIEW.md` |

## Typowe kombinacje per sprint

```
Sprint: nowy moduł domenowy
→ MODULE-SYSTEM.md + DB-SCHEMA.md + SECURITY.md

Sprint: UI dla istniejącego modułu
→ THEME-SYSTEM.md + SECURITY.md

Sprint: komunikacja między modułami
→ EVENTS.md + MODULE-SYSTEM.md

Sprint: migracja DB + gen types
→ DB-SCHEMA.md

Sprint: konfiguracja nowej aplikacji
→ APP-CONFIG.md + OVERVIEW.md
```

## Pełny design doc

Źródło prawdy (nie ładuj w sprintach):
`docs/architecture/platform-design-doc.md`
