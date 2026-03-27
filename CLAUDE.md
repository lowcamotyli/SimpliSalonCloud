## Czytanie i interpretacja plików — ZAWSZE Gemini powyżej progu

Claude NIE czyta plików > 50 linii przez Read tool — każda linia to token kontekstu.

```bash
# 1 plik:
cat d:/SimpliSalonCLoud/[ścieżka] \
  | gemini -p "TASK: [co wyjaśnić/sprawdzić]. FORMAT: Bulleted list. LIMIT: Max 20 lines." \
  --output-format text 2>/dev/null | grep -v "^Loaded"

# 2–3 pliki:
cat d:/SimpliSalonCLoud/[p1] d:/SimpliSalonCLoud/[p2] \
  | gemini -p "Two files piped: [p1] ([opis]), [p2] ([opis]). TASK: [...]. FORMAT: Bullets. LIMIT: Max 20 lines/file." \
  --output-format text 2>/dev/null | grep -v "^Loaded"
```

> `@ścieżka` działa TYLKO w trybie interaktywnym (REPL) — w headless `-p` zawsze używaj `cat plik |`.
> Windows bash: `{...}` compound commands nie działają — używaj `cat plik1 plik2 |`.

**Kiedy co:**
| Sytuacja | Narzędzie |
|---|---|
| Plik < 50 linii | Read (cały) |
| Plik > 50 linii — rozumienie, "jak działa X" | Gemini reader |
| Edycja z konkretnym numerem linii (z błędu tsc) | Read z view_range |
| Multi-section edit bez numeru linii | Gemini reader → potem Edit |

---

## Docs architektury — mapa referencyjna

Nigdy nie czytaj tych plików przez Read — hook zablokuje. Zawsze używaj Gemini (stdin pipe, bez limitu linii):
```bash
cat d:/SimpliSalonCLoud/docs/architecture/[plik].md \
  | gemini -p "TASK: List ALL constraints, exceptions, and rules relevant to [zadanie]. FORMAT: Bulleted list. Do NOT summarize away exceptions or edge cases." \
  --output-format text 2>/dev/null | grep -v "^Loaded"
```

> **Ważne:** Brak limitu linii — każdy wyjątek w arch doc może być krytyczny. "Max 20 lines" stosuj tylko do zwykłych plików kodu.

| Kiedy | Plik |
|-------|------|
| Multi-tenant query, cross-tenant bug, RLS design | `multi-tenant-architecture.md` |
| Nowa tabela, schemat danych, relacje | `data-architecture.md` |
| Nowa integracja zewnętrzna (API, webhook) | `integration-architecture.md` |
| Nowy event/kolejka/async flow | `event-architecture.md` |
| Nowy serwis/moduł, granice bounded context | `bounded-contexts.md` + `service-architecture.md` |
| Decyzja odbiegająca od architektury | `adr/` — napisz nowy ADR przed implementacją |
| Infrastruktura, deployment, skalowanie | `infra-architecture.md` + `scalability-strategy.md` |
| Bezpieczeństwo, auth, RLS policy | `security-model.md` |

---

## Zasady generowania kodu - OBOWIĄZKOWE

Projekt-specyficzne zasady. Globalne zasady orkiestracji → `~/.claude/CLAUDE.md` (nadrzędne).

### Podział pracy (token-optimal):

| Zadanie | Kto | Dlaczego |
|---------|-----|----------|
| SQL / migracje | Gemini CLI | Deterministyczny output, brak TS errors |
| `'use client'` pages/komponenty > 200 linii z shadcn/ui | Gemini CLI | Poprawna składnia UI, zero śmieci |
| Duże handlery > 150 linii bez UI (webhooks, CRON, business logic) | Gemini CLI | Oszczędność tokenów |
| Nowe pliki TS/TSX 20–150 linii (route handlers, komponenty, hooki) | Codex CLI | Czyta projekt lokalnie, zna App Router |
| Edycje istniejących plików (< 50 linii zmian) | Claude bezpośrednio | Edit tool tańszy niż delegacja |
| Nowe pliki < 20 linii | Claude bezpośrednio | Codex overhead > zysk |
| Fixy / snippety < 10 linii | Claude bezpośrednio | Zawsze |

### Codex CLI — jedyna działająca flaga zapisu na Windows:
```bash
codex exec --dangerously-bypass-approvals-and-sandbox "..."
# NIE używaj: --full-auto, -s workspace-write (nie działają na Windows)
# Do review/analizy (read-only): --ephemeral
```
**Ważne:** zawsze dodaj `Do NOT use Gemini — write directly.` w prompcie.

### Gemini CLI — jedyna dopuszczalna składnia:
```bash
gemini -p "..." --output-format text 2>/dev/null | grep -v "^Loaded cached" > plik.ts
```
**NIGDY:** `gemini -p "..." > plik.ts` bez filtrów — wchodzi w tryb agentyczny i korumpuje pliki.

**Ważne dla UI:** wklej w prompt sygnatury lokalnych hooks/utils — Gemini nie czyta projektu lokalnie.

### Weryfikacja po każdej generacji:
```bash
# Po Codex:
ls [ścieżka]            # czy plik powstał
npx tsc --noEmit        # błędy TypeScript

# Po Gemini (nowe pliki):
head -5 plik            # usuń prefix opisu jeśli jest
npx tsc --noEmit        # błędy TypeScript

# Po migracji SQL:
supabase db push
supabase gen types typescript --linked > types/supabase.ts
npx tsc --noEmit
```

### Twoja rola (Claude):
- Architektura i planowanie
- Wszystkie edycje istniejących plików
- Code review Codex/Gemini output
- Nowe pliki < 20 linii
- SQL bezpośrednio jeśli < 30 linii

### Bezpieczeństwo — review generowanego kodu (project-specific):
- **IDOR**: Codex/Gemini generują `WHERE id = $1` bez `AND salon_id = $2` — każde zapytanie do tabeli tenant-scoped MUSI filtrować po `salon_id`
- Wyjątek: zapytania przez `getAuthContext()` + RLS (salon_id wymuszony przez DB) — ale tylko gdy service role NIE jest użyty
