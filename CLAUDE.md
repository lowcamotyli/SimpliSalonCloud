## Zasady generowania kodu - OBOWIĄZKOWE

### Podział pracy (token-optimal):

| Zadanie | Kto | Dlaczego |
|---------|-----|----------|
| SQL / migracje | Gemini CLI | Deterministyczny output, brak TS errors |
| TS/TSX > 150 linii | Gemini CLI | Oszczędność generacji |
| TS/TSX < 150 linii | Claude bezpośrednio | Gemini overhead > oszczędność |
| Edycje istniejących plików | Claude bezpośrednio | Edit tool tańszy niż Read+Gemini+fix |
| Krótkie snippety / fixe | Claude bezpośrednio | Zawsze |

### Gemini CLI — jedyna dopuszczalna składnia:
```bash
# TYLKO z --output-format text i 2>/dev/null, nigdy bez tego
gemini -p "..." --output-format text 2>/dev/null | grep -v "^Loaded cached" > plik.sql
```
**NIGDY:** `gemini -p "..." > plik.ts` — wchodzi w tryb agentyczny i korumpuje pliki.

### Kiedy Gemini generuje TS (>150 linii):
1. Zapisz output do pliku przez `| grep -v "^Loaded" > plik.ts`
2. Natychmiast przejrzyj (Read) — usuń śmieci jeśli są
3. Sprawdź błędy TS z IDE diagnostics
4. Popraw przez Edit (nie regeneruj całości)

### Twoja rola (Claude):
- Architektura i planowanie
- Wszystkie edycje istniejących plików
- Code review Gemini output
- Cały kod < 150 linii
- SQL możesz pisać bezpośrednio jeśli < 30 linii
