# Spec — Zoom por defecto del gráfico (auto-zoom según ancho del panel)

Fecha: 2026-08-05
Proyecto: Elitos Trading Terminal

## Problema

Al cargar datos, lightweight-charts muestra **todas** las velas comprimidas en el ancho del panel
(el `setData` inicial ajusta la escala a todo el dataset, dejando además espacio vacío a la derecha
por el `rightOffset` por defecto). El resultado: en paneles pequeños (grid 4/6/8) y con timeframes
con mucha historia (1m ≈ 390 velas, 1h ≈ 170, crypto ≈ 500) las velas son diminutas y el panel se
ve "vacío" a los lados. Cuando el usuario hace zoom, las velas llenan el panel. Se quiere que ese
nivel de zoom sea el estado por defecto.

## Objetivo

Que por defecto el gráfico muestre las últimas velas que quepan en el ancho del panel con una
separación fija (~9px/vela), de modo que las velas llenen el ancho del panel y mantengan un tamaño
consistente en cualquier grid, al maximizar y en cualquier timeframe.

## Comportamiento deseado

- Al cargar datos nuevos (cambio de símbolo, timeframe o mercado), se aplica el zoom por defecto:
  - Velas visibles ≈ `floor(ancho_panel / 9px)`, mínimo 10 velas, sin superar las velas disponibles.
  - El último bar queda cerca del borde derecho (respiro mínimo `rightOffset: 2`).
  - Si caben todas las velas disponibles en el ancho (e.g. acciones 1d ≈ 65 velas en un panel de
    ~1900px), se muestra todo (`fitContent`).
- Ejemplos (anchos reales medidos en 1920px):
  - Panel ~948px (grid 4, 2×2) con AAPL 1h (~170 velas): se ven las últimas ~105 velas.
  - Panel ~470px (grid 8, 4×2) con AAPL 1d (65 velas): se ven las últimas ~52 velas.
  - Panel ~1900px (grid 1) con AAPL 1d (65 velas): se ven todas (65 < 211 → fitContent).
  - Panel maximizado: se ven muchas más velas (hasta el máximo disponible).

## Implementación

Archivo: `src/components/ChartPanel.tsx` (único archivo de código modificado).

1. Constante `DEFAULT_BAR_SPACING = 9` (px por vela).
2. Nuevo `useEffect` con dependencia `[data]`, declarado **después** del efecto que puebla las series
   (para que las series ya tengan datos cuando se calcule el rango). Lógica:
   - Guardia: si `!data` o `!chartRef.current`, salir.
   - `width = containerRef.current?.clientWidth ?? 0`.
   - `barsToShow = Math.max(10, Math.floor(width / DEFAULT_BAR_SPACING))`.
   - `n = data.candles.length`.
   - Si `barsToShow >= n` → `chart.timeScale().fitContent()`.
   - Si no → `chart.timeScale().setVisibleLogicalRange({ from: n - barsToShow, to: n - 1 })`.
   - `chart.timeScale().applyOptions({ rightOffset: 2 })`.
3. Hook de test solo en dev: en la creación del chart, `if (import.meta.env.DEV)` registrar el chart
   en un mapa global `window.__elitosCharts` (panelId → chart). Fuera de `DEV` el código se elimina
   en el build de producción (dead-code elimination de Vite). Sin `any`: tipar la ventana con un
   `Record<string, unknown>` o intersección de tipos.

## Interacciones (deben cumplirse)

- **Alternar indicadores** (volumen, RSI, MACD, etc.) → NO resetea el zoom del usuario. El efecto de
  zoom depende solo de `[data]`, no de `[config.indicators]`. Se verificará empíricamente que
  llamar `setData` a las series de indicadores (con el mismo rango ya visible) no re-ajusta la
  escala de tiempo.
- **Cambiar grid o maximizar/restaurar** → el zoom se mantiene; el canvas se redimensiona
  (autoSize) y las velas se ensanchan/estrechan con el panel. No se re-aplica el zoom por defecto.
- **Cambiar símbolo / timeframe / mercado** → se re-aplica el zoom por defecto (cambio de `data`).

## Testing

- `verify-final.mjs` (Playwright, suite existente 29/29):
  - Nuevo bloque de tests de "zoom por defecto":
    1. En grid=4 (2×2, panel ~948px), panel-0 con AAPL 1h (~170 velas): velas visibles ≈
       `floor(ancho/9)` (~105) y `< total`, con tolerancia (por el `rightOffset` y el redondeo
       de `getVisibleLogicalRange`).
    2. El último bar visible está cerca del borde derecho (`to` ≈ `total - 1`).
    3. Alternar un indicador (Volumen ON/OFF) no cambia las velas visibles (no resetea el zoom).
    4. En grid=1 (panel ~1900px) con AAPL 1d (~65 velas): se muestran todas (`fitContent`).
  - Total de velas obtenido vía API (`/api/stocks`) desde el test en Node.
  - Lectura del rango vía `window.__elitosCharts[panelId].timeScale().getVisibleLogicalRange()`.
  - Screenshot de evidencia: `verify_default_zoom.png`.
  - Regresión completa: los 29 tests existentes deben seguir pasando.
- `npm run build` → PASS (sin `any`, sin `console.log` en source, warning
  `INEFFECTIVE_DYNAMIC_IMPORT` pre-existente aceptable).

## Fuera de alcance

- Persistir el zoom del usuario entre sesiones.
- Botón de "auto-fit" manual en la UI.
- Cambios en el backend o en la cantidad de velas solicitadas.
- Cambios en el panel (bordes, header, layout).
