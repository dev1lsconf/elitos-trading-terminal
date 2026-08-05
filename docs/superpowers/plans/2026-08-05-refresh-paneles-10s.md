# Refresco automático de paneles (cada 10s) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cada panel refresque sus datos cada 10 segundos para mantenerse actualizado, sin resetear el zoom del usuario ni mostrar spinners en el refresh background, y mostrando un timestamp `Últ. act. HH:MM:SS` en el header.

**Architecture:** Refactorizar la carga de datos de `ChartPanel` en una función `loadData(background)` reutilizable (useCallback), crear un intervalo de 10s que la ejecuta en background (siempre en dev, solo cuando el mercado está Live en prod), con un guard de secuencia anti-race. El auto-zoom por defecto (feature previa) se preserva: captura del rango visible antes del `setData` y restauración en refrescos del mismo contexto.

**Tech Stack:** React 19, TypeScript estricto, lightweight-charts v5.2.0, Vite, Playwright (`verify-final.mjs`).

## Global Constraints

- Archivos modificables: SOLO `src/components/ChartPanel.tsx` y `verify-final.mjs`. NO tocar `backend/`.
- Sin tipo `any` (usar `unknown` + casts tipados para `window`).
- Sin `console.log` en source (solo el `console.error` existente en el catch).
- Intervalo de refresh: 10000ms. Condición: `import.meta.env.DEV || marketStatusRef.current === 'Live'`.
- Un refresh NO debe resetear el zoom/scroll del usuario; el auto-zoom por defecto solo se aplica en carga inicial o cambio de símbolo/timeframe/mercado.
- El refresh background NO muestra spinner (`loading` intocado) y en error conserva datos previos en silencio.
- Texto de UI en español: `Últ. act. HH:MM:SS`.
- Los 34 tests E2E existentes de `verify-final.mjs` deben seguir pasando; `npm run build` → PASS (warning `INEFFECTIVE_DYNAMIC_IMPORT` pre-existente aceptable).
- Hay repo git (init en `23b3051`): cada tarea termina con un commit en `master`.
- El dev server corre en `http://localhost:5001`; los tests E2E asumen que está levantado.
- Dev hook existente: `window.__elitosCharts[id]` → `IChartApi`. Esta tarea añade `window.__elitosChartMeta[id]` → `{ refreshCount: number; lastUpdated: number }`.

---

### Task 1: Polling de datos (loadData background + intervalo 10s + anti-race + dev hook meta)

**Files:**
- Modify: `src/components/ChartPanel.tsx`
- Test: `verify-final.mjs`

**Interfaces:**
- Consumes: dev hook `window.__elitosCharts[id]` (ya existe), helper `visibleRange(panelId)` y `panelsInfo()` de `verify-final.mjs` (ya existen).
- Produces: estado `lastUpdated: Date | null` (se setea en cada carga exitosa; se renderiza en Task 3). Dev hook `window.__elitosChartMeta[id] = { refreshCount, lastUpdated }`. Función `loadData(background: boolean)`.

- [ ] **Step 1: Añadir el bloque de tests E2E (RED)**

Insertar en `verify-final.mjs` entre la línea `await page.screenshot({ path: 'verify_default_zoom.png' });` (línea 290) y la línea `console.log('ERRORES DE CONSOLA:', ...)` (línea 292):

```js
// ---- Refresco automático de los paneles (cada 10s) ----
async function chartMeta(panelId) {
  return page.evaluate((id) => window.__elitosChartMeta?.[id] ?? null, panelId);
}

// En dev el refresh corre siempre, aunque el mercado esté cerrado
const meta0 = await chartMeta('panel-0');
report(!!meta0 && meta0.refreshCount >= 1, `refresh: hook expone refreshCount (count=${meta0 ? meta0.refreshCount : 'n/a'})`);
const refreshCountBefore = meta0?.refreshCount ?? 0;
const tsBefore = meta0?.lastUpdated ?? 0;

await page.waitForTimeout(11500); // cubre al menos un tick de refresh (10s)

const meta1 = await chartMeta('panel-0');
report((meta1?.refreshCount ?? 0) > refreshCountBefore, `refresh: el contador incrementa tras ~11s (before=${refreshCountBefore}, after=${meta1 ? meta1.refreshCount : 'n/a'})`);
report((meta1?.lastUpdated ?? 0) > tsBefore, `refresh: lastUpdated se actualiza (before=${tsBefore}, after=${meta1 ? meta1.lastUpdated : 'n/a'})`);

await page.screenshot({ path: 'verify_refresh.png' });
```

- [ ] **Step 2: Ejecutar y verificar que falla (RED)**

Run: `node verify-final.mjs`
Expected: los tests `refresh: hook expone refreshCount` y `refresh: el contador incrementa tras ~11s` fallan (`window.__elitosChartMeta` no existe → `meta0` es `null`).

- [ ] **Step 3: Añadir refs, estado y guard de contexto en `ChartPanel.tsx`**

En línea 1, añadir `useCallback` al import de React:

```tsx
import { useCallback, useEffect, useRef, useState } from 'react';
```

Después de la línea `const [symbolInput, setSymbolInput] = useState(config.symbol);` (línea 68), añadir:

```tsx
const loadSeqRef = useRef(0);
const prevRangeRef = useRef<{ from: number; to: number } | null>(null);
const lastDataContextRef = useRef<string | null>(null);
const marketStatusRef = useRef(marketStatus);
const lastIndicatorsKeyRef = useRef<string | null>(null);
const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
```

Después de esa declaración, añadir la sincronización del ref de estado de mercado (evita closures stale en el intervalo):

```tsx
useEffect(() => {
  marketStatusRef.current = marketStatus;
}, [marketStatus]);
```

- [ ] **Step 4: Refactorizar la carga en `loadData(background)` + efecto de polling**

Reemplazar TODO el bloque actual (desde `// Cargar datos cuando cambian config` en línea 330 hasta `}, [config.symbol, config.timeframe, config.market]);` en línea 364) por:

```tsx
  // Cargar datos cuando cambian config
  const loadData = useCallback(async (background: boolean) => {
    const seq = ++loadSeqRef.current;
    if (!background) setLoading(true);
    try {
      const { fetchCrypto, fetchStocks, fetchCryptoLive } = await import('../services/api');
      let result: PanelData | null = null;
      if (config.market === 'crypto') {
        const r = await fetchCrypto(config.symbol, config.timeframe);
        // Obtener precio en vivo para crypto
        const live = await fetchCryptoLive();
        if (seq === loadSeqRef.current && live.live) setLastPrice(live.price);
        if (seq === loadSeqRef.current) setMarketStatus('Live');
        result = r;
      } else {
        const r = await fetchStocks(config.symbol, config.timeframe);
        if (seq === loadSeqRef.current) setMarketStatus('Closed'); // se actualiza con fetchMarketStatus
        result = r;
      }
      // Validar que tenga candlestick data; si la API devolvió {error}, no actualizar datos.
      if (seq === loadSeqRef.current && result && Array.isArray(result.candles)) {
        setData(result);
        setLastUpdated(new Date());
        if (import.meta.env.DEV) {
          const w = window as unknown as { __elitosChartMeta?: Record<string, { refreshCount: number; lastUpdated: number }> };
          w.__elitosChartMeta = w.__elitosChartMeta ?? {};
          const meta = w.__elitosChartMeta[config.id] ?? { refreshCount: 0, lastUpdated: 0 };
          meta.refreshCount += 1;
          meta.lastUpdated = Date.now();
          w.__elitosChartMeta[config.id] = meta;
        }
      }
    } catch (err) {
      console.error('Error cargando datos:', err);
    } finally {
      if (seq === loadSeqRef.current && !background) setLoading(false);
    }
  }, [config.symbol, config.timeframe, config.market]);

  // Polling: carga inicial + refresh cada 10s. En dev corre siempre; en prod solo si el mercado está Live.
  useEffect(() => {
    loadData(false);
    const id = setInterval(() => {
      if (import.meta.env.DEV || marketStatusRef.current === 'Live') loadData(true);
    }, 10000);
    return () => clearInterval(id);
  }, [loadData]);
```

- [ ] **Step 5: Evitar rebuild de sub-paneles en cada refresh**

El efecto que puebla las series (deps `[data, config.indicators]`, línea 367) llama `rebuildIndicatorPanes()` y `applyExtraSeries()` en cada cambio de `data`. Con el refresh de 10s eso recrearía los panes de indicadores cada 10s (flicker y trabajo inútil). Añadir una clave de indicadores en ref y solo reconstruir cuando cambie realmente:

En `ChartPanel.tsx`, justo después de la guardia del efecto (`if (!data || !data.candles || !candleSeriesRef.current || !volumeSeriesRef.current) return;` en línea 368), sustituir el bloque:

```tsx
    // Asegurar que las series de indicadores existen antes de setear sus datos
    rebuildIndicatorPanes();
    applyExtraSeries();
```

por:

```tsx
    // Asegurar que las series de indicadores existen antes de setear sus datos.
    // Solo se reconstruyen si la config de indicadores cambió: un refresh de datos
    // (mismo contexto) no debe recrear los sub-panes.
    const indicatorsKey = [
      config.indicators.vwap,
      config.indicators.bollinger,
      config.indicators.rsi,
      config.indicators.macd,
      config.indicators.williams,
      config.indicators.volumeProfile,
      config.indicators.fvg,
    ].join('|');
    if (indicatorsKey !== lastIndicatorsKeyRef.current) {
      rebuildIndicatorPanes();
      applyExtraSeries();
      lastIndicatorsKeyRef.current = indicatorsKey;
    }
```

- [ ] **Step 6: Limpiar el dev hook meta al desmontar**

En el cleanup del efecto de inicialización del chart, tras el bloque existente que borra `__elitosCharts` (líneas 196-199), añadir:

```tsx
      if (import.meta.env.DEV) {
        const w = window as unknown as { __elitosChartMeta?: Record<string, { refreshCount: number; lastUpdated: number }> };
        if (w.__elitosChartMeta) delete w.__elitosChartMeta[config.id];
      }
```

- [ ] **Step 7: Verificar GREEN**

Run: `npm run build` → PASS (sin `any`, warning `INEFFECTIVE_DYNAMIC_IMPORT` pre-existente).
Run: `node verify-final.mjs` → los 2 tests nuevos de refresh pasan y los 34 existentes siguen pasando (`RESULTADO: TODOS LOS TESTS PASAN`). Puede que `refresh: el zoom custom...` y el timestamp aún no existan (son de Tasks 2 y 3).

- [ ] **Step 8: Commit**

```bash
git add src/components/ChartPanel.tsx verify-final.mjs
git commit -m "feat: refresco automatico de paneles cada 10s"
```

---

### Task 2: Preservación del zoom del usuario en el refresh

**Files:**
- Modify: `src/components/ChartPanel.tsx`
- Test: `verify-final.mjs`

**Interfaces:**
- Consumes: refs `prevRangeRef`, `lastDataContextRef` (creados en Task 1, ahora se usan); `loadData` y polling de Task 1 (el refresh ya dispara `setData` de `[data]`).
- Produces: comportamiento — en un refresh del mismo contexto se restaura el rango visible previo; en cambio de contexto se aplica el auto-zoom por defecto.

- [ ] **Step 1: Añadir el test E2E (RED)**

En `verify-final.mjs`, dentro del bloque de refresh añadido en Task 1, insertar ANTES de la línea `await page.screenshot({ path: 'verify_refresh.png' });`:

```js
// Aplicar un zoom custom vía dev hook: debe preservarse tras un refresh
await page.evaluate((id) => {
  const ch = window.__elitosCharts?.[id];
  if (ch) ch.timeScale().setVisibleLogicalRange({ from: 10, to: 40 });
}, 'panel-0');
await page.waitForTimeout(500);
const customRange = await visibleRange('panel-0');

await page.waitForTimeout(11500); // cubre otro tick de refresh (10s)

const rangeAfter = await visibleRange('panel-0');
report(!!customRange && !!rangeAfter && Math.abs(rangeAfter.from - customRange.from) <= 1 && Math.abs(rangeAfter.to - customRange.to) <= 1,
  `refresh: el zoom custom se preserva tras el refresh (from=${rangeAfter ? Math.round(rangeAfter.from) : 'n/a'}, to=${rangeAfter ? Math.round(rangeAfter.to) : 'n/a'})`);
```

- [ ] **Step 2: Ejecutar y verificar que falla (RED)**

Run: `node verify-final.mjs`
Expected: `refresh: el zoom custom se preserva tras el refresh` FALLA — sin el guard, el efecto de zoom re-aplica el auto-zoom por defecto en cada refresh (con grid=1/AAPL 1d eso es `fitContent`, rango ~0..63 ≠ custom 10..40).

- [ ] **Step 3: Capturar el rango visible antes del `setData`**

En `ChartPanel.tsx`, en el efecto que puebla las series (línea 367), justo después de la guardia de la línea 368 (y del bloque de `indicatorsKey` del Task 1), añadir:

```tsx
    // Capturar el rango visible antes de reemplazar los datos: lo usará el efecto de
    // zoom para restaurar la vista del usuario tras un refresh del mismo contexto.
    prevRangeRef.current = chartRef.current?.timeScale().getVisibleLogicalRange() ?? null;
```

- [ ] **Step 4: Guard de contexto en el efecto de zoom**

En `ChartPanel.tsx`, reemplazar el cuerpo del efecto de zoom por defecto (líneas 505-519, el que tiene `}, [data]);` al final) por:

```tsx
  useEffect(() => {
    const chart = chartRef.current;
    if (!data || !chart || !containerRef.current) return;
    const ctx = `${config.symbol}|${config.timeframe}|${config.market}`;
    if (ctx === lastDataContextRef.current) {
      // Refresh del mismo contexto: restaurar el rango visible previo (preserva zoom/scroll del usuario)
      if (prevRangeRef.current) {
        try { chart.timeScale().setVisibleLogicalRange(prevRangeRef.current); } catch {}
      }
      return;
    }
    lastDataContextRef.current = ctx;
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

- [ ] **Step 5: Verificar GREEN**

Run: `npm run build` → PASS.
Run: `node verify-final.mjs` → `refresh: el zoom custom se preserva tras el refresh` pasa y los 36 tests (34 existentes + 2 refresh) pasan. Especialmente confirmar que `zoom default: velas ≈ ancho/9` y `zoom default: grid=1 1d muestra todo` siguen pasando (el auto-zoom de carga inicial no cambia).

- [ ] **Step 6: Commit**

```bash
git add src/components/ChartPanel.tsx verify-final.mjs
git commit -m "feat: preservar el zoom del usuario en el refresco"
```

---

### Task 3: Timestamp `Últ. act.` en el header + verificación final

**Files:**
- Modify: `src/components/ChartPanel.tsx`
- Test: `verify-final.mjs`

**Interfaces:**
- Consumes: estado `lastUpdated` (seteado en cada carga exitosa en Task 1).
- Produces: UI terminada + suite completa verde.

- [ ] **Step 1: Añadir el test E2E (RED)**

En `verify-final.mjs`, dentro del bloque de refresh, insertar ANTES de la línea `await page.screenshot({ path: 'verify_refresh.png' });`:

```js
// Timestamp 'Últ. act.' en el header del panel-0
const lastActBefore = await page.locator('main .rounded-lg span', { hasText: 'Últ. act.' }).first().textContent();
report(!!lastActBefore && /Últ\. act\. \d{1,2}:\d{2}:\d{2}/.test(lastActBefore), `refresh: timestamp 'Últ. act.' visible (text=${lastActBefore?.trim() ?? 'n/a'})`);

await page.waitForTimeout(11500); // cubre otro tick de refresh (10s)

const lastActAfter = await page.locator('main .rounded-lg span', { hasText: 'Últ. act.' }).first().textContent();
report(!!lastActBefore && !!lastActAfter && lastActBefore.trim() !== lastActAfter.trim(), 'refresh: el timestamp se actualiza tras el refresh');
```

- [ ] **Step 2: Ejecutar y verificar que falla (RED)**

Run: `node verify-final.mjs`
Expected: `refresh: timestamp 'Últ. act.' visible` FALLA (`lastActBefore` es `null`, no hay span con ese texto).

- [ ] **Step 3: Renderizar el timestamp en el header**

En `ChartPanel.tsx`, en el header del panel, justo después del badge de market status (después de la línea 588, que cierra el `<span>` de `{marketStatus}`), añadir:

```tsx
        {lastUpdated && (
          <span className="text-xs text-[#787B86] font-mono">
            Últ. act. {lastUpdated.toLocaleTimeString()}
          </span>
        )}
```

- [ ] **Step 4: Verificar GREEN**

Run: `npm run build` → PASS (sin `any`, sin `console.log` en source).
Run: `node verify-final.mjs` → TODOS pasan (34 existentes + 4 nuevos de refresh = 38), `ERRORES DE CONSOLA: ninguno`, `verify_refresh.png` creado.

- [ ] **Step 5: Limpieza de artefactos sueltos**

Run: `Get-ChildItem -Name *.mjs,*.png`
Expected: solo `verify-final.mjs` y los `verify_*.png` (incluido `verify_refresh.png`). Si hay `debug-*.mjs`, `debug_*.png`, `screenshot*.png` u otros scripts desechables, borrarlos.

- [ ] **Step 6: Commit**

```bash
git add src/components/ChartPanel.tsx verify-final.mjs
git commit -m "feat: timestamp de ultima actualizacion en el panel"
```

---

## Self-Review

**Cobertura del spec:**
- Refactor `loadData(background)` → Task 1 Step 4. ✓
- Intervalo 10s con `import.meta.env.DEV || marketStatus === 'Live'` → Task 1 Step 4. ✓
- Anti-race con `loadSeqRef` → Task 1 Step 4. ✓
- Preservación del zoom (captura `prevRangeRef` antes de `setData` + guard `lastDataContextRef` en el efecto de zoom) → Task 2 Steps 3-4. ✓
- Timestamp `Últ. act.` → Task 3 Step 3. ✓
- Dev hook `__elitosChartMeta` + cleanup → Task 1 Steps 4, 6. ✓
- E2E (contador, zoom preservado, timestamp) → Tasks 1-3. ✓
- Rebuild de sub-panes solo cuando cambian indicadores (evita flicker en refresh) → Task 1 Step 5. ✓
- Build PASS y regresión de los 34 tests → verificado en cada tarea (Steps de GREEN). ✓

**Sin placeholders:** todos los pasos incluyen código real. ✓

**Consistencia de tipos:** `loadSeqRef`/`prevRangeRef`/`lastDataContextRef`/`marketStatusRef`/`lastIndicatorsKeyRef` y `lastUpdated` se declaran en Task 1 y se consumen en Tasks 1-3 con los mismos nombres. `window.__elitosChartMeta` tiene el mismo tipo en Task 1 (creación, cleanup) y en los tests. ✓
