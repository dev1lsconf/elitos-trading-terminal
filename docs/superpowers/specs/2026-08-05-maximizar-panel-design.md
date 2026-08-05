# Design — Maximizar panel dentro de la app

Fecha: 2026-08-05
Estado: Aprobado por el usuario (opción A, con doble clic añadido)

## Contexto

El terminal Elitos muestra una grilla de paneles de gráficos (grid 1/2/4/6/8). El usuario quiere poder maximizar un panel concreto para verlo con todo el espacio disponible dentro de la app, manteniendo la barra superior (Elitos, Grid, Sync, Market Status) y el footer visibles.

Requisitos del usuario (recogidos en brainstorming):
- Maximizar **dentro de la app** (NO fullscreen del navegador). La barra superior y el footer siguen visibles.
- Un solo panel maximizado a la vez.
- Al maximizar, el resto de paneles se ocultan por completo y vuelven a su estado original al restaurar.
- Entrada/salida por botón toggle en el header + tecla Esc para restaurar.
- Añadido por el usuario: doble clic en el área del gráfico alterna maximizar/restaurar.

## Enfoque elegido (Opción A)

Estado global en `App.tsx`: `maximizedPanelId: string | null`. Al maximizar, `App` renderiza solo ese panel ocupando el 100% del área del grid. Al restaurar, vuelve el grid completo.

## Arquitectura

### `App.tsx`
- Nuevo estado: `const [maximizedPanelId, setMaximizedPanelId] = useState<string | null>(null);`
- Nueva función: `handleMaximize(panelId: string | null)` que hace toggle: si `panelId === maximizedPanelId` → `null` (restaurar), si no → `panelId` (maximizar).
- Render del grid:
  - Si `maximizedPanelId === null`: render actual (grid con todos los paneles).
  - Si hay un panel maximizado: renderizar solo ese panel dentro del mismo contenedor de grid, ocupando una celda única (1 columna, 1 fila) a altura completa.
- Listener global de teclado: `useEffect` que escucha `keydown` y si la tecla es `Escape` y hay un panel maximizado, restaura (`setMaximizedPanelId(null)`). Se limpia en el cleanup.
- Prop `onMaximize` y `isMaximized` pasados a cada `ChartPanel`.

### `ChartPanel.tsx`
- Nuevas props:
  - `onMaximize: () => void` — llamado al pulsar el botón toggle o al hacer doble clic en el gráfico.
  - `isMaximized: boolean` — controla el icono del botón (⛶ vs ✕) y un `data-*` para tests.
- Botón en el header (junto al menú de indicadores):
  - Icono ⛶ (maximizar) cuando `isMaximized === false`.
  - Icono ✕ (restaurar) cuando `isMaximized === true`.
  - `aria-label` descriptivo y un `data-testid="maximize-toggle"` para los tests E2E.
- Doble clic en el área del gráfico:
  - `onDoubleClick` en el `containerRef` (el div que contiene el chart).
  - Llama a `onMaximize()`.

Nota: no es necesario tocar el chart de lightweight-charts. Con `autoSize: true` (ya activo), el widget se redimensiona automáticamente al cambiar el tamaño de su contenedor.

## Comportamiento detallado

- **Solo un maximizado a la vez**: maximizar un panel mientras otro está maximizado no es alcanzable por UI (solo se renderiza el panel maximizado, sus botones no existen en el DOM). Para maximizar otro panel, primero hay que restaurar.
- **Los demás paneles se ocultan**: se dejan de renderizar (no se desmonta estado porque el panel maximizado es el mismo componente; los demás no se montan mientras están ocultos). Al restaurar, el grid vuelve completo con todas las configs intactas.
- **El header sigue visible en maximizado**: mercado, ticker, timeframe, estado, precio y menú de indicadores siguen funcionando igual. El usuario puede cambiar símbolo/timeframe/indicadores estando maximizado.
- **El grid no se altera**: `gridLayout`, `panels`, timeframes sincronizados e indicadores se conservan al maximizar/restaurar.
- **Esc**: restaura únicamente si hay un panel maximizado. No interfiere con otros usos de Esc (no hay otros en la app).

## Doble clic — consideraciones

- El evento `dblclick` en el contenedor del chart no interfiere con scroll/zoom/arrastre de lightweight-charts (son eventos distintos: mousedown/mousemove/wheel vs dblclick).
- Riesgo conocido: un arrastre muy rápido que termine justo sobre el mismo punto puede disparar `dblclick`. Es el mismo comportamiento que TradingView y es aceptable.
- El doble clic solo debe dispararse sobre el área del gráfico, no sobre el header.

## Testing

Extender `verify-final.mjs` (Playwright/Edge, contra `http://localhost:5001`):

1. **Maximizar por botón** → solo 1 panel visible y ocupa todo el área del grid (`width ≈ innerWidth - padding`, altura completa del main).
2. **Cambiar símbolo estando maximizado** → el input funciona y el gráfico se actualiza.
3. **Maximizar por doble clic** → `dblclick` en el canvas → solo 1 panel visible.
4. **Esc restaura** → `keydown` Escape → el grid completo vuelve a renderizar con la misma cantidad de paneles.
5. **Cualquier panel puede maximizarse** → maximizar panel 0, restaurar, maximizar panel 1 → solo 1 panel visible; restaurar → grid completo de nuevo.
6. **Toggle del botón** → pulsar ⛶ y luego ✕ restaura.
7. Regresión: verificar que `npm run build` y el resto de tests existentes siguen pasando.

## Archivos afectados

- `src/App.tsx` — estado `maximizedPanelId`, función toggle, render condicional del grid, listener de Esc, props a ChartPanel.
- `src/components/ChartPanel.tsx` — props `onMaximize`/`isMaximized`, botón toggle en el header, `onDoubleClick` en el contenedor del chart.
- `verify-final.mjs` — nuevos tests de maximizado.

## Fuera de alcance

- Fullscreen del navegador (API Fullscreen).
- Botón de doble clic en el header (solo en el gráfico).
- Persistencia del estado maximizado entre recargas (se resetea al recargar).
- Redimensionar/arrastrar paneles (drag & drop) — no existe y no se añade.
