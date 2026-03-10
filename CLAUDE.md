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
