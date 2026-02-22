# Raport testów – ostatni run

**Data raportu (UTC):** 2026-02-15T09:19:50Z  
**Zakres źródeł:** [test-results/.last-run.json](test-results/.last-run.json), [test-output.txt](test-output.txt), [tests/unit/cors-middleware.test.ts](tests/unit/cors-middleware.test.ts), [tests/integration/rls-isolation.test.ts](tests/integration/rls-isolation.test.ts), [tests/e2e/critical-flows.spec.ts](tests/e2e/critical-flows.spec.ts), [scripts/run-all-checks.cjs](scripts/run-all-checks.cjs), [package.json](package.json)

## 1) Pełna lista scenariuszy (unit / integration / e2e + quality gates)

### Unit
| ID | Scenariusz | Status | Źródło dowodu |
|---|---|---|---|
| U-1 | CORS: allowed origin ustawia nagłówki | **PASS** | Definicja: [test('sets CORS headers for allowed origin')](tests/unit/cors-middleware.test.ts:19), wynik: [✔ sets CORS headers for allowed origin](test-output.txt:14), agregat: [ℹ pass 14](test-output.txt:32) |
| U-2 | CORS: poprawny preflight zwraca 200 | **PASS** | Definicja: [test('returns 200 for valid preflight request')](tests/unit/cors-middleware.test.ts:33), wynik: [✔ returns 200 for valid preflight request](test-output.txt:15), agregat: [ℹ fail 0](test-output.txt:33) |

### Integration
| ID | Scenariusz | Status | Źródło dowodu |
|---|---|---|---|
| I-1 | RLS isolation: brak cross-tenant leak (`leakDetected != true`) | **PASS** | Definicja: [test('RLS / multi-tenant isolation passes cross-tenant isolation script')](tests/integration/rls-isolation.test.ts:8), asercja: [assert.equal(output.includes('leakDetected": true'), false)](tests/integration/rls-isolation.test.ts:17), wynik: [✔ RLS / multi-tenant isolation passes cross-tenant isolation script](test-output.txt:13) |

### E2E
| ID | Scenariusz | Status | Źródło dowodu |
|---|---|---|---|
| E2E-1 | Health API zwraca poprawny envelope (`healthy/degraded/unhealthy` lub błąd z payload) | **PASS** | Definicja: [test('health API responds with healthy/degraded/unhealthy envelope')](tests/e2e/critical-flows.spec.ts:4), wynik: [ok 1 ... health API responds ...](test-output.txt:50), status runu: ["status": "passed"](test-results/.last-run.json:2) |
| E2E-2 | Niezalogowany użytkownik przekierowany do loginu z trasy chronionej | **PASS** | Definicja: [test('unauthenticated user is redirected from protected route to login')](tests/e2e/critical-flows.spec.ts:23), wynik: [ok 2 ... unauthenticated user is redirected ...](test-output.txt:51), status runu: ["failedTests": []](test-results/.last-run.json:3) |
| E2E-3 | Strona logowania renderuje kluczowe pola auth | **PASS** | Definicja: [test('login page renders core auth fields')](tests/e2e/critical-flows.spec.ts:29), wynik: [ok 3 ... login page renders core auth fields](test-output.txt:52), status runu: ["failedTests": []](test-results/.last-run.json:3) |
| E2E-4 | Signup pozostaje na formularzu przy niezgodnych hasłach | **PASS** | Definicja: [test('signup page keeps user on form when passwords mismatch')](tests/e2e/critical-flows.spec.ts:36), wynik: [ok 4 ... signup page keeps user on form ...](test-output.txt:53), status runu: ["failedTests": []](test-results/.last-run.json:3) |

### Quality gates (pipeline)
> Pipeline zdefiniowany w [const STEPS](scripts/run-all-checks.cjs:8) i wywoływany przez ["test:all"](package.json:15).

| ID | Gate | Status | Źródło dowodu |
|---|---|---|---|
| QG-1 | `unit+integration` (`npm run test`) | **PASS** | Start: [[run-all-checks] START unit+integration](test-output.txt:6), wynik: [[run-all-checks] OK unit+integration](test-output.txt:38) |
| QG-2 | `e2e` (`npm run test:e2e`) | **PASS** | Start: [[run-all-checks] START e2e](test-output.txt:40), wynik: [[run-all-checks] OK e2e](test-output.txt:56) |
| QG-3 | `lint` (`npm run lint`) | **PASS** | Start: [[run-all-checks] START lint](test-output.txt:58), wynik: [[run-all-checks] OK lint](test-output.txt:64) |
| QG-4 | `typecheck` (`npm run typecheck`) | **PASS** | Start: [[run-all-checks] START typecheck](test-output.txt:66), wynik: [[run-all-checks] OK typecheck](test-output.txt:71) |
| QG-5 | `build` (`npm run build`) | **PASS** | Start: [[run-all-checks] START build](test-output.txt:73), wynik: [[run-all-checks] OK build](test-output.txt:234) |

## 2) Podsumowanie statusów

- **PASS:** 13 (8 scenariuszy testowych + 5 quality gates)  
- **FAIL:** 0

## 3) Lista naprawionych przypadków (wcześniej FAIL)

1. U-1 – [test('sets CORS headers for allowed origin')](tests/unit/cors-middleware.test.ts:19) → PASS.
2. U-2 – [test('returns 200 for valid preflight request')](tests/unit/cors-middleware.test.ts:33) → PASS.
3. I-1 – [test('RLS / multi-tenant isolation passes cross-tenant isolation script')](tests/integration/rls-isolation.test.ts:8) → PASS.
4. QG-1 – `unit+integration` w [const STEPS](scripts/run-all-checks.cjs:8) → PASS.
5. QG-2 – `e2e` w [const STEPS](scripts/run-all-checks.cjs:8) → PASS.
6. QG-3 – `lint` w [const STEPS](scripts/run-all-checks.cjs:8) → PASS.
7. QG-4 – `typecheck` w [const STEPS](scripts/run-all-checks.cjs:8) → PASS.
8. QG-5 – `build` w [const STEPS](scripts/run-all-checks.cjs:8) → PASS.

## 4) Wdrożone poprawki techniczne

- Uszczelniono uruchamianie procesów w runnerze: [resolveCommand()](scripts/run-all-checks.cjs:16) + wyłączenie [shell: false](scripts/run-all-checks.cjs:30), co usuwa ostrzeżenie bezpieczeństwa DEP0190 i stabilizuje uruchamianie `npm` na Windows przez [npm.cmd](scripts/run-all-checks.cjs:18).
- Migracje DB: brak zmian wymaganych w tym cyklu (testy RLS przeszły w obecnym stanie).
