# Zoom por defecto del gráfico Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cada gráfico muestre por defecto el último bloque de velas que quepa en el ancho del panel (auto-zoom ~9px/vela), en vez de todas las velas comprimidas con espacio vacío.

**Architecture:** lightweight-charts ya gestiona el rango visible de su time scale. Se añade a `src/components/ChartPanel.tsx` una constante `DEFAULT_BAR_SPACING = 9` y un `useEffect` con dependencia `[data]` (declarado después del efecto que puebla las series) que, tras cargar datos nuevos, calcula las velas a mostrar según el ancho real del contenedor y fija el rango lógico (`setVisibleLogicalRange`) o hace `fitContent()` si caben todas. Un hook **solo en dev** (`import.meta.env.DEV`) expone el chart en `window.__elitosCharts` (mapa panelId → chart) para que los tests E2E lean `timeScale().getVisibleLogicalRange()`.

**Tech Stack:** React 19, TypeScript (strict), lightweight-charts v5, Vite, Tailwind v4, Playwright (`verify-final.mjs`, playwright-core + Edge).

**Spec:** `docs/superpowers/specs/2026-08-05-zoom-default-grafico-design.md`

## Global Constraints

- TypeScript strict; prohibido el tipo `any`. Usar `unknown` con casts explícitos (`as unknown as { ... }`) o intersecciones de tipos.
- No dejar `console.log` en source (solo `console.error` dentro de try/catch, como ya existe).
- NO modificar nada bajo `backend/` (read-only).
- NO hay repositorio git → no hay commits. La verificación es `npm run build` y `node verify-final.mjs`.
- Los 29 tests existentes de `verify-final.mjs` deben seguir pasando.
- No añadir dependencias nuevas; usar la paleta Tailwind existente.
- Dev server en `http://localhost:5001` (ya en ejecución; no reiniciar salvo necesidad).
- El código del hook de test bajo `if (import.meta.env.DEV)` se elimina del build de producción por dead-code elimination de Vite (`src/vite-env.d.ts` ya referencia `vite/client`, así que `import.meta.env.DEV` está tipado).

---

### Task 1: Hook de test en dev (`window.__elitosCharts`)

**Files:**
- Modify: `src/components/ChartPanel.tsx:136` (hook tras `chartRef.current = chart;`), `src/components/ChartPanel.tsx:184` (cleanup)

**Interfaces:**
- Consumes: `config.id: string` (ya existe), `IChartApi` (ya importado), `chartRef` (ya existe).
- Produces: `window.__elitosCharts: Record<string, IChartApi>` — mapa panelId → instancia de chart, presente solo en dev. Lo consume Task 2.

- [ ] **Step 1: Registrar el chart en `window.__elitosCharts`**

En el efecto de inicialización del chart (deps `[]`, línea 70-186), inmediatamente después de `chartRef.current = chart;` (línea 136), añade:

```ts
    // Hook de test solo en dev: expone el chart para verify-final.mjs
    if (import.meta.env.DEV) {
      const w = window as unknown as { __elitosCharts?: Record<string, IChartApi> };
      w.__elitosCharts = w.__elitosCharts ?? {};
      w.__elitosCharts[config.id] = chart;
    }
```

- [ ] **Step 2: Limpiar la entrada al desmontar**

En el cleanup del mismo efecto, justo antes de `chartRef.current = null;` (línea 184), añade:

```ts
      if (import.meta.env.DEV) {
        const w = window as unknown as { __elitosCharts?: Record<string, IChartApi> };
        if (w.__elitosCharts) delete w.__elitosCharts[config.id];
      }
```

- [ ] **Step 3: Compilar**

Run: `npm run build`
Expected: PASS (tsc -b && vite build). El warning `INEFFECTIVE_DYNAMIC_IMPORT` de `api.ts` es pre-existente y aceptable.

- [ ] **Step 4: Verificar el hook en vivo**

Escribe un script Playwright desechable en `%TEMP%` (fuera del proyecto; bórralo al terminar) que haga `goto('http://localhost:5001')`, espere 5s y evalúe:

```js
const res = await page.evaluate(() => {
  const charts = window.__elitosCharts ?? {};
  return {
    defined: typeof window.__elitosCharts !== 'undefined',
    keys: Object.keys(charts),
    hasChart: !!(charts['panel-0'] && typeof charts['panel-0'].timeScale === 'function'),
  };
});
console.log(JSON.stringify(res, null, 2));
```

Expected: `{ "defined": true, "keys": ["panel-0"], "hasChart": true }` (si hay más paneles montados, habrá más keys; `hasChart` para `panel-0` debe ser `true`).

- [ ] **Step 5: No hay commit (no hay git)**

---

### Task 2: Auto-zoom por defecto + E2E tests

**Files:**
- Modify: `src/components/ChartPanel.tsx` (constante `DEFAULT_BAR_SPACING` + `useEffect` con dep `[data]`)
- Modify: `verify-final.mjs` (nuevo bloque de tests antes de `console.log('ERRORES DE CONSOLA:'...)`, línea 241)

**Interfaces:**
- Consumes: hook `window.__elitosCharts` de Task 1; `data.candles.length` (PanelData, ya existe); `containerRef.current.clientWidth`; helpers existentes de `verify-final.mjs`: `report()`, `panelsInfo()`, `setGrid()`, `toggleIndicator(label)`.
- Produces: comportamiento "zoom por defecto" (ver spec); constantes de test `visibleRange(panelId)` y `totalBars(symbol, interval)` dentro del bloque E2E.

- [ ] **Step 1 (RED): Escribir los tests E2E que fallan**

En `verify-final.mjs`, inserta el siguiente bloque justo antes de la línea `console.log('ERRORES DE CONSOLA:', ...)`:

```js
// ---- Zoom por defecto del gráfico (auto-zoom según ancho del panel) ----
async function visibleRange(panelId) {
  return page.evaluate((id) => {
    const charts = window.__elitosCharts ?? {};
    const ch = charts[id];
    if (!ch) return null;
    const r = ch.timeScale().getVisibleLogicalRange();
    if (!r) return null;
    return { from: r.from, to: r.to, count: r.to - r.from };
  }, panelId);
}

async function totalBars(symbol, interval) {
  const res = await fetch(`http://localhost:5001/api/stocks?symbol=${symbol}&interval=${interval}`);
  const json = await res.json();
  return (json.candles ?? []).length;
}

// grid=4 (2x2, panel ~948px) con AAPL 1h (~170 velas): últimas ~floor(ancho/9), no todas
await setGrid(4);
await page.locator('main .rounded-lg select').nth(1).selectOption('1h');
await page.waitForTimeout(2500);
const symZoom = page.locator('input[type="text"]').first();
await symZoom.fill('AAPL');
await symZoom.press('Enter');
await page.waitForTimeout(3000);
const total1h = await totalBars('AAPL', '1h');
const panelW = (await panelsInfo()).first;
const expected = Math.floor(panelW / 9);
const r1h = await visibleRange('panel-0');
report(!!r1h && r1h.count < total1h, `zoom default: menos velas que el total (visible=${r1h ? Math.round(r1h.count) : 'n/a'}, total=${total1h})`);
report(!!r1h && Math.abs(r1h.count - expected) <= 3, `zoom default: velas ≈ ancho/9 (visible=${r1h ? Math.round(r1h.count) : 'n/a'}, expected=${expected})`);
report(!!r1h && r1h.to >= total1h - 3, `zoom default: último bar pegado al borde derecho (to=${r1h ? Math.round(r1h.to) : 'n/a'}, total=${total1h})`);

// Alternar Volumen no debe resetear el zoom
const beforeToggle = (await visibleRange('panel-0'))?.count ?? 0;
await toggleIndicator('Volumen');
const afterToggleOn = (await visibleRange('panel-0'))?.count ?? 0;
report(Math.abs(afterToggleOn - beforeToggle) <= 1, `zoom default: toggle indicador no resetea (before=${Math.round(beforeToggle)}, after=${Math.round(afterToggleOn)})`);
await toggleIndicator('Volumen'); // volver a OFF

// grid=1 (panel ~1900px) con AAPL 1d (~65 velas): caben todas → fitContent
await setGrid(1);
await page.locator('main .rounded-lg select').nth(1).selectOption('1d');
await page.waitForTimeout(2500);
const total1d = await totalBars('AAPL', '1d');
const r1d = await visibleRange('panel-0');
report(!!r1d && r1d.from <= 1 && r1d.count >= total1d - 2, `zoom default: grid=1 1d muestra todo (visible=${r1d ? Math.round(r1d.count) : 'n/a'}, total=${total1d})`);

await page.screenshot({ path: 'verify_default_zoom.png' });
```

- [ ] **Step 2: Ejecutar la suite para confirmar el fallo (RED)**

Run: `node verify-final.mjs`
Expected: los 29 tests existentes pasan, y **fallan 2 tests nuevos**:
- `zoom default: menos velas que el total` → FAIL (hoy `visible === total`, fitContent).
- `zoom default: velas ≈ ancho/9` → FAIL (hoy `visible === total`, p.ej. ~170 vs 105).
Los otros 2 (último bar pegado a la derecha, toggle no resetea, grid=1 muestra todo) pueden pasar ya; son guardas de regresión. Si falla algo del bloque anterior a estos tests, detente e investiga.

- [ ] **Step 3 (GREEN): Implementar el auto-zoom en ChartPanel**

En `src/components/ChartPanel.tsx`:

1. Añade la constante a nivel de módulo (después de los imports, antes de `export function ChartPanel`):

```ts
// Separación objetivo de velas (px) para el zoom por defecto del gráfico
const DEFAULT_BAR_SPACING = 9;
```

2. Añade un nuevo `useEffect` justo DESPUÉS del efecto que puebla las series (después de su cierre, línea ~484):

```ts
  // Zoom por defecto: mostrar el último bloque de velas que quepa en el ancho del panel.
  // Depende solo de [data] para que alternar indicadores NO resetee el zoom del usuario.
  useEffect(() => {
    const chart = chartRef.current;
    if (!data || !chart || !containerRef.current) return;
    const width = containerRef.current.clientWidth;
    const barsToShow = Math.max(10, Math.floor(width / DEFAULT_BAR_SPACING));
    const n = data.candles.length;
    try {
      chart.timeScale().applyOptions({ rightOffset: 2 });
      if (barsToShow >= n) {
        chart.timeScale().fitContent();
      } else {
        chart.timeScale().setVisibleLogicalRange({ from: n - barsToShow, to: n - 1 });
      }
    } catch {}
  }, [data]);
```

Nota: `useEffect` ya está importado (línea 1).

- [ ] **Step 4: Ejecutar la suite para confirmar el paso (GREEN)**

Run: `node verify-final.mjs`
Expected: TODOS los tests pasan (29 existentes + 4 nuevos de zoom), `ERRORES DE CONSOLA: ninguno`, y se crea `verify_default_zoom.png`.

- [ ] **Step 5 (solo si hace falta): Guard de preservación del rango**

Si el test `zoom default: toggle indicador no resetea` fallara tras el Step 3 (porque `setData` en las series de indicadores re-ajusta la escala de tiempo), aplica este fix en el efecto "Actualizar series cuando llegan datos" (deps `[data, config.indicators]`): antes del primer `setData` captura el rango y tras todos los `setData` lo restaura:

```ts
    const chart = chartRef.current;
    const savedRange = chart ? chart.timeScale().getVisibleLogicalRange() : null;
```
…justo antes de `candleSeriesRef.current.setData(candles);`, y al final del efecto (después de las llamadas a setData de indicadores):

```ts
    if (chart && savedRange) {
      try { chart.timeScale().setVisibleLogicalRange(savedRange); } catch {}
    }
```

Re-ejecuta `node verify-final.mjs` y confirma que pasa. (Solo aplicar si el Step 4 no pasó por esa causa.)

- [ ] **Step 6: Compilar**

Run: `npm run build`
Expected: PASS. (El bloque `import.meta.env.DEV` desaparece del bundle de producción.)

- [ ] **Step 7: No hay commit (no hay git)**

---

### Task 3: Verificación final

**Files:**
- No source changes.

- [ ] **Step 1: Build de producción**

Run: `npm run build`
Expected: PASS (tsc -b && vite build). Warning `INEFFECTIVE_DYNAMIC_IMPORT` pre-existente aceptable.

- [ ] **Step 2: Suite E2E completa**

Run: `node verify-final.mjs`
Expected: TODOS los tests pasan (29 existentes + 4 nuevos), `ERRORES DE CONSOLA: ninguno`, `verify_default_zoom.png` creado.

- [ ] **Step 3: Limpieza de artefactos sueltos**

Run: `Get-ChildItem -Name *.mjs,*.png`
Expected: solo `verify-final.mjs` y los `verify_*.png` (incluido `verify_default_zoom.png`). Si hay `debug-*.mjs`, `debug_*.png`, `screenshot*.png` o scripts desechables en el root, bórralos.

- [ ] **Step 4: No hay commit (no hay git)**

---

## Self-Review Notes

- **Spec coverage:**
  - Auto-zoom según ancho del panel (~9px/vela, mínimo 10, `rightOffset: 2`) → Task 2 Step 3.
  - `fitContent()` cuando caben todas → Task 2 Step 3.
  - Zoom re-aplicado al cambiar símbolo/timeframe/mercado (efecto dep `[data]`) → Task 2 Step 3.
  - Toggle de indicadores NO resetea el zoom → Task 2 Step 3 + test + contingency Step 5.
  - Hook dev-only `window.__elitosCharts` → Task 1.
  - Tests E2E (menos velas que total, velas ≈ ancho/9, último bar a la derecha, toggle no resetea, grid=1 muestra todo) → Task 2 Step 1.
  - Screenshot `verify_default_zoom.png` → Task 2 Step 1.
  - Build PASS y limpieza → Task 3.
- **Placeholders:** Ninguno; todos los pasos tienen código concreto.
- **Type consistency:** `DEFAULT_BAR_SPACING` (Task 2) es la única constante nueva; `window.__elitosCharts` tipado como `Record<string, IChartApi>` de forma idéntica en Task 1 y usado como `Record<string, unknown>`-ish en el JS del test. `visibleRange(panelId)` / `totalBars(symbol, interval)` se definen y usan en el mismo bloque (Task 2 Step 1).
- **TDD:** Task 2 tiene RED (Step 1-2) y GREEN (Step 3-4); Task 1 se verifica por build + script desechable (no hay framework unitario en el repo).
