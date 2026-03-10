# SimpliSalonCloud — Plan wdrożenia po review (Marzec 2026)

## Kontekst

Review przeprowadzony 07.03.2026. Zidentyfikowano 11 problemów pogrupowanych w 3 kategorie ryzyka.

## Struktura katalog

```
review/
  README.md              — ten plik (overview + status)
  sprint-A-security.md   — KRYTYCZNE: bezpieczeństwo (3 foxy, ~2h)
  sprint-B-reliability.md — WYSOKIE: niezawodność (5 zadań, ~4h)
  sprint-C-quality.md    — ŚREDNIE: jakość kodu (6 zadań, ~6h)
```

## Mapa problemów → sprint

| # | Problem | Severity | Sprint |
|---|---------|----------|--------|
| 1 | `/api/integrations` — brak auth | CRITICAL | A |
| 2 | `settings:manage` — złe uprawnienie w middleware | CRITICAL | A |
| 3 | `get_top_employees` — RPC nieistniejące w DB | CRITICAL | A |
| 4 | Rate limiting in-memory — nieskuteczny na Vercel | HIGH | B |
| 5 | Brak rate limitingu w większości API routes | HIGH | B |
| 6 | `console.*` zamiast structured logger | HIGH | B |
| 7 | `lib/cron/guard.ts` — dead code alias | HIGH | B |
| 8 | Security headers zdublowane (vercel.json + proxy.ts) | HIGH | B |
| 9 | `import/page.tsx` (1011 linii) + `forms/page.tsx` (719 linii) | MEDIUM | C |
| 10 | 246× `as any` — niezregenerowane typy Supabase | MEDIUM | C |
| 11 | Testowe endpointy w produkcji | MEDIUM | C |

## Status ogólny

- [ ] Sprint A — Bezpieczeństwo
- [ ] Sprint B — Niezawodność
- [ ] Sprint C — Jakość kodu
