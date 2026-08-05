# Spec — Refresco automático de los paneles cada 10 segundos

Fecha: 2026-08-05
Proyecto: Elitos Trading Terminal

## Problema

Los paneles cargan los datos una sola vez al montarse o al cambiar símbolo/timeframe/mercado. No
existe ningún polling de velas: solo hay un poll de `market-status` a 30s (para el badge Live/Closed
y el precio crypto). Si el usuario deja el terminal abierto, el gráfico queda congelado en los datos
de la carga inicial y no refleja los últimos precios ni las velas nuevas.

## Objetivo

Que cada panel refresque sus datos automáticamente cada 10 segundos para mantenerse actualizado,
sin interrumpir la interacción del usuario (zoom/scroll) y sin parpadeos de spinner.

## Comportamiento deseado

- Cada panel visible refresca sus datos cada 10s mientras el mercado correspondiente esté **Live**
  (crypto 24/7, US stocks solo en horario de mercado). Fuera de horario el refresh queda pausado
  (los datos no cambian, se evitan llamadas inútiles).
- El refresh es **background e invisible**: no muestra spinner, y si la petición falla conserva los
  datos previos en silencio.
- El refresh **NO resetea el zoom/scroll del usuario**. El auto-zoom por defecto (feature previa)
  solo se aplica en carga inicial o cambio de símbolo/timeframe/mercado; en un refresh se restaura
  el rango visible que tenía el usuario antes de la actualización. Si entra una vela nueva, aparece
  en el borde derecho.
- El header de cada panel muestra un timestamp **`Últ. act. HH:MM:SS`** junto al badge Live/Closed,
  que se actualiza en cada carga exitosa.
- **Solo en dev** el refresh corre siempre (aunque el mercado esté `Closed`), para poder ver y
  testear el refresco a cualquier hora. En producción se respeta la condición de mercado.

## Implementación

Archivo: `src/components/ChartPanel.tsx` (único archivo de código modificado) + `verify-final.mjs`
(tests).

1. **Refactor de carga en `loadData(background)`**:
   - Reemplazar el `useEffect` de carga (deps `[config.symbol, config.timeframe, config.market]`) por
     una función estable `loadData` con `useCallback` (mismas deps) que recibe `background: boolean`.
   - `loadData(false)` (inicial/cambio de contexto): `setLoading(true)` (spinner), fetch completo
     (velas + indicadores + precio crypto), `setData` si la respuesta tiene `candles` válidas,
     `setLoading(false)` al terminar.
   - `loadData(true)` (refresh background): no toca `loading`; si la respuesta es válida aplica
     `setData`; en error, `catch` silencioso (mantiene datos previos). Actualiza `lastUpdated` en
     cada carga exitosa (ambos modos).
2. **Efecto de polling**: un `useEffect` con deps `[config.symbol, config.timeframe, config.market]`
   que ejecuta `loadData(false)` y crea `setInterval` de 10000ms que ejecuta `loadData(true)` **solo
   si** `import.meta.env.DEV || marketStatus === 'Live'`. Cleanup: `clearInterval` + flag cancelado.
   - `marketStatus` se lee por closure (estado del panel, ya actualizado por el poll de 30s).
3. **Anti-race (secuencia)**: un `loadSeqRef` (id incremental). Cada `loadData` captura su id y solo
   aplica `setData`/`setLoading`/`lastUpdated` si sigue siendo el id más reciente. Evita que una
   respuesta lenta de un refresh pise los datos de un símbolo recién cambiado.
4. **Preservación del zoom** (interacción con el efecto de auto-zoom, deps `[data]`):
   - En el efecto que puebla las series (el que llama `setData`), **antes** de `setData` de la serie
     de velas: `prevRangeRef.current = chartRef.current?.timeScale().getVisibleLogicalRange() ?? null`.
   - En el efecto de auto-zoom (deps `[data]`): nuevo guard `lastDataContextRef` que almacena
     `symbol|timeframe|market`.
     - Si el contexto **cambió** → aplicar auto-zoom por defecto (comportamiento actual) y guardar el
       contexto.
     - Si el contexto es **el mismo** (refresh) → si `prevRangeRef.current` existe, restaurarlo con
       `setVisibleLogicalRange`; si no, `fitContent`.
5. **Timestamp `lastUpdated`**: estado `Date | null`; se setea en cada carga exitosa. Se renderiza en
   el header como `<span>Últ. act. HH:MM:SS</span>` (formato con `toLocaleTimeString`), oculto hasta
   la primera carga. No `console.log` en source.
6. **Dev hook para tests**: mantener `window.__elitosCharts[id]` (chart) y añadir
   `window.__elitosChartMeta[id] = { refreshCount, lastUpdated }`, actualizado en cada `loadData`
   exitosa (dev only, mismo patrón que el hook existente: `import.meta.env.DEV`, sin `any`).

## Interacciones (deben cumplirse)

- **Auto-zoom por defecto** (feature previa): carga inicial y cambio de símbolo/timeframe siguen
  aplicando el zoom default (los 34 tests existentes siguen pasando). Un refresh con el mismo
  contexto NO re-aplica el zoom default; restaura el rango previo.
- **Alternar indicadores**: sigue sin resetear el zoom (sin cambios en esa lógica).
- **Maximizar/restaurar**: los paneles no visibles se desmontan y sus intervalos se limpian en el
  cleanup; el panel visible conserva su propio polling.
- **Spinner**: solo en carga inicial/cambio de contexto; nunca en refresh background.
- **Cambio de símbolo durante un refresh en vuelo**: la secuencia (`loadSeqRef`) descarta la respuesta
  obsoleta.

## Testing

- `verify-final.mjs` (Playwright, suite existente 34/34):
  - Nuevo bloque de tests de "refresh":
    1. `refresh: contador incrementa tras ~11s` — leer `window.__elitosChartMeta['panel-0'].refreshCount`,
       esperar ~11s, verificar que incrementa (en dev el refresh corre siempre).
    2. `refresh: zoom custom se preserva` — aplicar un rango visible custom vía dev hook, esperar ~11s
       (cubre un tick de refresh), verificar que el rango sigue siendo el custom (±1 vela). Prueba que
       el refresh no resetea al zoom default.
    3. `refresh: timestamp 'Últ. act.' aparece y cambia` — leer el texto del header, esperar ~11s,
       verificar que el texto existe y su valor cambió.
  - Regresión completa: los 34 tests existentes deben seguir pasando (especialmente los de zoom default
    de carga inicial).
  - Screenshot de evidencia: `verify_refresh.png`.
- `npm run build` → PASS (sin `any`, sin `console.log` en source, warning
  `INEFFECTIVE_DYNAMIC_IMPORT` pre-existente aceptable).

## Fuera de alcance

- Refresco solo de la última vela (payload incremental) — implicaría tocar el backend.
- Pausar el refresh cuando la pestaña no está visible (el navegador ya throttlea los `setInterval`
  en background).
- Cambios en el backend o en la cantidad de velas solicitadas.
- Persistencia de preferencias de refresh.
