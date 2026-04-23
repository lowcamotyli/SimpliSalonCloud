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

### OBOWIĄZKOWE: Skills w każdym prompcie Codexa

**Każdy prompt do codex-main i codex-dad MUSI zaczynać się od:**
```
Read .workflow/skills/[nazwa].md and follow it.
```

| Task | Skill |
|------|-------|
| Implementacja TS/TSX | `scoped-implementation` |
| SQL / migracje | `sql-migration-safe` |
| Naprawa TS errors | `typescript-repair` |
| Review diff | `review-ready-diff` |
| Odczyt/streszczenie pliku > 50 linii (znana ścieżka) | `targeted-file-read` |
| Duży kontekst przed planowaniem (nieznane ścieżki) | `large-context-analysis` |
| Security / auth / billing | `safe-sensitive-change` |
| Sprint planning, multi-worker | `parallel-work-split` |

**ZAKAZY:**
- NIE używaj `Skill("generate")` / `Skill("review")` do generowania kodu — to meta-skills do planowania
- NIE używaj `Agent(codex-generate)` / `Agent(codex-review)` — Claude-powered agenty, trafiają na limit
- ZAWSZE: Bash → `codex exec` lub `dad-exec.sh` z skills na początku

### Codex CLI — jedyna działająca flaga zapisu na Windows:
```bash
codex exec --dangerously-bypass-approvals-and-sandbox "..."
# NIE używaj: --full-auto, -s workspace-write (nie działają na Windows)
# Do review/analizy (read-only): --ephemeral
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

