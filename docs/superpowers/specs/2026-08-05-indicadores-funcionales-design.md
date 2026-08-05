# Diseño: Indicadores funcionales en ChartPanel

Fecha: 2026-08-05
Estado: Aprobado (usuario: Eric Batista)

## Contexto

El usuario reportó que al seleccionar indicadores en el menú "no pasa nada", excepto VWAP y Bollinger. La investigación (reproducción headless con Playwright + inspección de typings de lightweight-charts v5.2.0) concluyó:

| Indicador | Estado actual | Causa raíz |
|---|---|---|
| VWAP | **Funciona** (tras fix) | Bug de orden de efectos (ya arreglado: `applyExtraSeries()` se invoca antes de setear datos). |
| Bollinger | **Funciona** (tras fix) | Ídem. |
| FVG | **Roto en silencio** | `(series as any).setMarkers?.()` — en v5 `setMarkers` se movió a un plugin (`createSeriesMarkers`); el método ya no existe en `ISeriesApi`, el `?.()` se corta. |
| RSI | No implementado | El checkbox no tiene código de render. |
| MACD | No implementado | Ídem. |
| Williams %R | No implementado | Ídem. |
| Volume Profile | No implementado | Ídem. |
| Volumen | Toggle inerte | El histograma de volumen se muestra siempre; el checkbox no controla nada. |

Backend ya entrega todos los datos (`data.indicators`: `rsi`, `macd`, `williams`, `volume_profile`, `fvg`) — no requiere cambios.

## Decisiones (brainstorming con el usuario)

1. **RSI, MACD, Williams %R** → sub-paneles estilo TradingView, apilados bajo el gráfico de precios.
2. **Volume Profile** → líneas horizontales POC/VAH/VAL sobre el precio + histograma horizontal.
3. **Volumen** → el checkbox activa/desactiva la visibilidad del histograma (por defecto activado).
4. **Layout completo estilo TradingView** → tema oscuro pro, toolbar de panel compacta (mercado/símbolo/timeframe/indicadores), paneles en grid bien cuadrados, responsive.
5. **Implementar TODOS los indicadores** del menú (ninguno se elimina: todos son implementables con la API v5).
6. **Verificación** → pruebas headless (Playwright/Edge) por indicador + grids + responsive + `tsc -b` + `vite build`.

## Layout estilo TradingView (alcance extendido)

- **Tema oscuro**: fondo de chart `#131722`, grid `#1E222D`, texto `#D1D4DC` (paleta oficial de TradingView dark). Se sustituye la paleta actual `#0B0B0F`/`#1A1A2E`.
- **Toolbar del panel** (header de cada ChartPanel), de izquierda a derecha: selector de mercado, input de símbolo con autocompletado, botones de timeframe (grupo compacto), botón indicadores (icono `fx`), y a la derecha estado Live/Closed + último precio. Toolbar sticky dentro del panel, `flex-wrap` para caber en anchos pequeños.
- **Grid de paneles**: mantener CSS Grid con `repeat(cols, minmax(0,1fr)) × repeat(rows, minmax(0,1fr))`, gap compacto `gap-2`, paneles con `rounded-lg border` y `min-w-0/min-h-0`. Cada panel ocupa exactamente su celda (`h-full`), sin desbordes (el bug original de flex-wrap no debe volver).
- **Responsive**: en `max-width: 768px` el grid fuerza 1 columna (los paneles se apilan); en pantallas intermedias el selector de grid sigue funcionando. El panel usa `min-width: 0` en inputs para no desbordar.
- **Sub-paneles de indicadores**: apilados bajo el gráfico de precio dentro del mismo panel, con `pane.setHeight(110)` (estilo TradingView).
- No se añaden sidebars ni listas laterales de símbolos (fuera de alcance).

## Arquitectura

- Toda la lógica de render vive en `src/components/ChartPanel.tsx`.
- Nuevo archivo `src/components/VolumeProfilePrimitive.ts` con un series primitive (API `IPrimitive` de v5) que dibuja el histograma horizontal.
- Sin cambios en backend. En `App.tsx` solo ajustes de layout (paleta, gap del grid, responsive). En `types.ts` solo dos ajustes: declarar `macd`/`signal` en `ChartIndicators.macd` y cambiar el default de `volume` a `true`.

### Panes de lightweight-charts v5

API utilizada (verificada en typings v5.2.0):
- `chart.addSeries(def, opts, paneIndex)` — tercer parámetro asigna el pane.
- `chart.panes()[i].setHeight(px)` — altura fija por pane en píxeles.
- `series.applyOptions({ visible })` — `SeriesOptionsCommon.visible` existe (typings líneas 1065/1248/1423).
- `series.createPriceLine({ price, color, lineStyle, axisLabelVisible })` — líneas de nivel.
- `createSeriesMarkers(series, markers?, options?)` → `ISeriesMarkersPluginApi.setMarkers()` — plugin de marcadores FVG (typings línea 294).
- `IPrimitive` → `paneViews()` → `IPrimitivePaneView.renderer()` → `IPrimitivePaneRenderer.draw(target)` — histograma VP.

### Distribución de panes

- Pane 0 = gráfico de precios (velas + volumen + VWAP + Bollinger + Volume Profile + marcadores FVG). El volumen comparte pane 0 con escala propia (`priceScaleId: 'volume'`), como hoy.
- Pane 1..N = indicadores activos, contiguos y sin huecos, en orden fijo: RSI → MACD → Williams %R. Cada pane activo: `setHeight(110)`.
- Al cambiar la configuración de indicadores, **se reconstruyen las series de indicadores** (eliminar inactivas, crear activas con el paneIndex correcto). Esto evita panes vacíos y stale state.

## Implementación por indicador

### Sub-panes (RSI / MACD / Williams %R)

Cada indicador gestiona sus propias refs de series y se crea dentro de un bloque `try/catch` para no romper el panel ante fallos de datos.

- **RSI** (pane: línea): `LineSeries` en `priceScaleId` propio, escala fija 0–100 vía `autoscaleInfoProvider`, `lineWidth: 1`. Niveles 30/70 con `createPriceLine` (colores sutilmente distintos). Datos: `ind.rsi` (valores `null` → omitir punto).
- **MACD**: `HistogramSeries` (hist, colores verde/rojo según signo) + 2× `LineSeries` (macd, signal). Datos: `ind.macd.{positive,negative,hist}` y `ind.macd.macd`, `ind.macd.signal` — **nota**: el tipo `ChartIndicators.macd` en `types.ts` no declara `macd`/`signal` (solo `positive/negative/hist`), y la API devuelve `macd`/`signal` como arrays. Ajustar el tipo para incluir `macd` y `signal` como `(number|null)[]`.
- **Williams %R**: `LineSeries`, escala fija −100 a 0 vía `autoscaleInfoProvider`, niveles 0 y −50 con `createPriceLine`. Datos: `ind.williams`.

Los datos de `rsi`/`macd`/`williams` ya son `(number | null)[]` → se filtran `null` y se mapean con `ind.times`.

### Volumen

`volumeSeriesRef.current.applyOptions({ visible: config.indicators.volume })`. El default actual en `DEFAULT_PANEL_CONFIG` es `false` → **cambiar a `true`** en `types.ts` para que el histograma siga visible al entrar.

### Volume Profile

- **Líneas**: `candleSeries.createPriceLine` para `vah`, `poc`, `val` (POC más prominente, grosor/color destacado).
- **Histograma horizontal**: `VolumeProfilePrimitive` attachado a la serie de velas (`candleSeries.attachPrimitive(primitive)` o `series.attachPrimitive` según API v5). Dibuja un rectángulo por bin (`volume_profile.bins`), derecha-alineado al borde derecho del pane visible, ancho = `bin.volume / max_vol` × **0.25 del ancho visible del pane**, color por distancia al POC (verde→rojo) y bin POC resaltado. Recalcula en cada `draw` con la escala de precio actual (`SeriesAttachedParameter`/`PaneRenderer` target).
- **Ciclo de vida de las líneas**: se recrean en cada efecto de datos cuando `config.indicators.volumeProfile` está activo (mismo patrón que `applyExtraSeries` para VWAP/Bollinger) y se eliminan al desactivarse. No hay camino de "actualizar en sitio"; siempre recrear.

### FVG

En el init del chart: `markersPluginRef.current = createSeriesMarkers(candleSeries)`.
En el setData: si `config.indicators.fvg && ind.fvg` → `markersPluginRef.current.setMarkers(markers)`; si no → `setMarkers([])`. El tipo `SeriesMarker<Time>` se importa de `lightweight-charts`.

### Orden de efectos (regla de oro ya aplicada)

El efecto de datos (`[data, config.indicators]`) **primero** llama a la reconstrucción de series de indicadores (`applyExtraSeries`/`rebuildIndicatorPanes`) y **luego** setea datos. Así un indicador recién activado recibe sus datos en el mismo commit. Esta regla ya está en el código para VWAP/Bollinger y debe extenderse a los nuevos.

## Flujo de datos

`fetchStocks`/`fetchCrypto` → `data` (state) → efecto de datos → (1) reconstruir series de indicadores según `config.indicators`, (2) setData de velas/volumen, (3) setData de indicadores, (4) price lines de VP, (5) marcadores FVG.

## Manejo de errores

- Cada bloque de indicador (pane, VP, FVG) envuelto en `try/catch { console.error }` para que un dato inválido no tumbe el panel.
- Si `data.indicators` falta o un array está vacío, el bloque se omite (chart sigue mostrando velas).

## Testing y verificación

1. **Reproducción headless** (Playwright/Edge): cargar `localhost:5001`, grid 1, activar cada indicador por separado y verificar color de píxeles en canvas:
   - RSI/MACD/Williams: presencia de sus colores en el pane correspondiente.
   - VP: presencia de líneas POC (color destacado) y rectángulos.
   - FVG: presencia de marcadores.
   - Volumen off: el histograma deja de renderizar (color de volumen desaparece).
2. **Layout/responsive**: grid 1/2/4/6/8 a 1920px y 900px → todos los paneles visibles dentro del viewport (sin desbordes verticales); a 800px → 1 columna.
3. `npx tsc -b` sin errores.
4. `npx vite build` sin errores.

## Fuera de alcance

- No se añaden indicadores nuevos (SMA/EMA/OBV/etc.).
- No se persiste la configuración de paneles.
- No se cambia el backend.
- No se añaden sidebars laterales con lista de símbolos ni barra inferior de indicadores activos.
