## Czytanie i interpretacja plików — codex-dad powyżej progu

Claude NIE czyta plików > 50 linii przez Read tool — każda linia to token kontekstu.

```bash
# 1 plik:
DAD_PROMPT="Read /mnt/d/SimpliSalonCLoud/[ścieżka]. TASK: [co wyjaśnić/sprawdzić]. FORMAT: Bulleted list. LIMIT: Max 20 lines." bash ~/.claude/scripts/dad-exec.sh

# 2–3 pliki:
DAD_PROMPT="Read /mnt/d/SimpliSalonCLoud/[p1] and /mnt/d/SimpliSalonCLoud/[p2]. TASK: [zadanie]. FORMAT: Bullets. LIMIT: Max 20 lines/file." bash ~/.claude/scripts/dad-exec.sh
```

**Kiedy co:**
| Sytuacja | Narzędzie |
|---|---|
| Plik < 50 linii | Read (cały) |
| Plik > 50 linii — rozumienie, "jak działa X" | codex-dad reader |
| Edycja z konkretnym numerem linii (z błędu tsc) | Read z view_range |
| Multi-section edit bez numeru linii | codex-dad reader → potem Edit |

---

## Docs architektury — mapa referencyjna

Nigdy nie czytaj tych plików przez Read — hook zablokuje. Zawsze używaj codex-dad (bez limitu linii):
```bash
DAD_PROMPT="Read /mnt/d/SimpliSalonCLoud/docs/architecture/[plik].md. List ALL constraints, exceptions, and rules relevant to [zadanie]. FORMAT: Bulleted list. Do NOT summarize away exceptions or edge cases." bash ~/.claude/scripts/dad-exec.sh
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
| SQL / migracje | **codex-dad** | Zna schemat DB przez AGENTS.md |
| `'use client'` pages/komponenty > 200 linii z shadcn/ui | **codex-dad** | Zna stack i komponenty przez AGENTS.md |
| Duże handlery > 150 linii bez UI (webhooks, CRON, business logic) | **codex-dad** | Zna projekt lokalnie |
| Nowe pliki TS/TSX 20–150 linii (route handlers, komponenty, hooki) | codex-main | Czyta projekt lokalnie, zna App Router |
| Edycje istniejących plików (< 50 linii zmian) | Claude bezpośrednio | Edit tool tańszy niż delegacja |
| Nowe pliki < 20 linii | Claude bezpośrednio | Codex overhead > zysk |
| Fixy / snippety < 10 linii | Claude bezpośrednio | Zawsze |

### Codex CLI — jedyna działająca flaga zapisu na Windows:
```bash
codex exec --dangerously-bypass-approvals-and-sandbox "..."
# NIE używaj: --full-auto, -s workspace-write (nie działają na Windows)
# Do review/analizy (read-only): --ephemeral
```
### Weryfikacja po każdej generacji:
```bash
# Po Codex/dad:
ls [ścieżka]            # czy plik powstał
npx tsc --noEmit        # błędy TypeScript

# Po migracji SQL:
supabase db push
supabase gen types typescript --linked > types/supabase.ts
npx tsc --noEmit
```

### Twoja rola (Claude):
- Architektura i planowanie
- Wszystkie edycje istniejących plików
- Code review codex output
- Nowe pliki < 20 linii
- SQL bezpośrednio jeśli < 30 linii

### Bezpieczeństwo — review generowanego kodu (project-specific):
- **IDOR**: Codex generuje `WHERE id = $1` bez `AND salon_id = $2` — każde zapytanie do tabeli tenant-scoped MUSI filtrować po `salon_id`
- Wyjątek: zapytania przez `getAuthContext()` + RLS (salon_id wymuszony przez DB) — ale tylko gdy service role NIE jest użyty
