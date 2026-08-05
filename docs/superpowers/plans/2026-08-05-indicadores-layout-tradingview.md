# Indicadores funcionales + Layout TradingView — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every indicator in the menu actually work in ChartPanel (RSI, MACD, Williams %R as sub-panes; FVG markers; Volume Profile lines + histogram; working Volume toggle) and restyle the whole app with the TradingView dark palette, squared responsive panels, verified end-to-end with headless browser tests + `tsc` + build.

**Architecture:** All rendering logic lives in `src/components/ChartPanel.tsx`. Sub-pane indicators (RSI/MACD/Williams) use lightweight-charts v5 panes: a single `rebuildIndicatorPanes()` removes old indicator series/panes and re-adds active ones with `paneIndex`, applied BEFORE any `setData` (the golden rule that already fixed VWAP/Bollinger). FVG uses the `createSeriesMarkers` plugin (v5 replaced `series.setMarkers`). Volume Profile draws POC/VAH/VAL `createPriceLine` lines plus a new series primitive (`VolumeProfilePrimitive.ts`, `ISeriesPrimitive` + `IPrimitivePaneView` + `IPrimitivePaneRenderer`) attached to the candle series for the horizontal histogram. Layout restyle is CSS-only (Tailwind classes + chart options), plus a responsive override class.

**Tech Stack:** React 19, TypeScript strict, Vite 8, Tailwind 4, lightweight-charts 5.2.0, Playwright (headless Edge) for verification. Backend FastAPI (unchanged).

## Global Constraints

- **Golden rule (from spec):** the data effect `[data, config.indicators]` MUST call series reconstruction (`rebuildIndicatorPanes()` + `applyExtraSeries()`) BEFORE any `setData`. Do not introduce any other ordering.
- **Paleta TradingView dark:** chart bg `#131722`, grid/border `#1E222D` (chart borders `#2A2E39`), text `#D1D4DC`, muted `#787B86`, up `#26a69a`, down `#ef5350`, accent `#2962FF`, gold/orange `#FF9800`, indicator colors: Bollinger `#A97AFF`, RSI `#2962FF`, MACD line `#2962FF` + signal `#FF9800`, Williams `#E91E63`, VP POC `#FF9800`, VP VAH/VAL dashed `#787B86`, volume green `rgba(8,153,129,0.4)` / red `rgba(242,54,69,0.4)`.
- **Backend data shape (verified `indicators.py`):** `macd` is `{ macd, signal, hist }` — NOT `positive/negative`. Types must match this.
- **Sub-pane height:** every active indicator pane `chart.panes()[i].setHeight(110)`.
- **No git repo** in this project — omit all `git commit` steps. Verification = `npx tsc -b` + `npx vite build` + Playwright.
- **No `any`** (CLAUDE.md hard rule). Use `unknown`/type guards. No `console.log` leftovers except `console.error` inside `try/catch` for indicator errors (spec: Manejo de errores).
- **Do not modify `backend/`.** Do not change `src/services/api.ts` logic (only its macd type shape).
- `DEFAULT_PANEL_CONFIG.indicators.volume` becomes `true`.

---

### Task 1: Fix indicator data types (types.ts + api.ts)

**Files:**
- Modify: `src/types.ts` (lines 16-34 `ChartIndicators`)
- Modify: `src/services/api.ts` (lines 14-46 `PanelData.indicators`)
- Test: `npx tsc -b` (no output = pass)

**Interfaces:**
- Consumes: nothing new.
- Produces: `ChartIndicators.macd` = `{ macd: (number|null)[]; signal: (number|null)[]; hist: (number|null)[] }` (used by Task 3); `DEFAULT_PANEL_CONFIG.indicators.volume = true` (used by Task 4).

- [ ] **Step 1: Fix `ChartIndicators.macd` in `src/types.ts`**

Replace lines 20-24:
```ts
  macd: {
    positive: (number | null)[];
    negative: (number | null)[];
    hist: (number | null)[];
  };
```
with:
```ts
  macd: {
    macd: (number | null)[];
    signal: (number | null)[];
    hist: (number | null)[];
  };
```

- [ ] **Step 2: Fix the duplicate macd shape in `src/services/api.ts`**

Replace lines 18-22:
```ts
    macd: {
      positive: (number | null)[];
      negative: (number | null)[];
      hist: (number | null)[];
    };
```
with:
```ts
    macd: {
      macd: (number | null)[];
      signal: (number | null)[];
      hist: (number | null)[];
    };
```

- [ ] **Step 3: Set default `volume: true` in `src/types.ts`**

In `DEFAULT_PANEL_CONFIG.indicators` (line 119) change `volume: false` to `volume: true`.

- [ ] **Step 4: Verify**

Run: `npx tsc -b`
Expected: exits 0 with no errors.

---

### Task 2: TradingView dark theme + squared responsive panels (App.tsx, ChartPanel.tsx, index.css)

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/ChartPanel.tsx` (styles + chart options only in this task)
- Modify: `src/index.css`
- Test: `npx tsc -b` + visual (screenshot via Playwright in Task 6)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: new chart option colors and palette classes; a responsive class `trading-grid` used by the App grid.

- [ ] **Step 1: Add responsive override to `src/index.css`**

Append at end of file:
```css
/* Grid de paneles: 1 columna en móvil (override de las columnas inline de App) */
@media (max-width: 767px) {
  .trading-grid {
    grid-template-columns: minmax(0, 1fr) !important;
    grid-template-rows: none !important;
  }
}
```

- [ ] **Step 2: Restyle `src/App.tsx` with the TradingView palette**

Apply these exact class changes (keep structure identical):
- Root: `bg-[#0B0B0F] text-[#E0E0E0]` → `bg-[#131722] text-[#D1D4DC]`
- Header: `bg-[#0B0B0F]/95 ... border-b border-[#1A1A2E]` → `bg-[#131722]/95 ... border-b border-[#1E222D]`
- Title gradient: `from-[#6D5EE5] to-[#FFB800]` → `from-[#2962FF] to-[#FF9800]`
- All `text-[#888]` → `text-[#787B86]`
- All `border-[#1A1A2E]` → `border-[#1E222D]`
- All `bg-[#1A1A2E]` (selects) → `bg-[#1E222D]`
- All `focus:ring-[#6D5EE5]` → `focus:ring-[#2962FF]`
- Checkbox `accent-[#6D5EE5]` → `accent-[#2962FF]`
- Market status green `bg-[#00D97E]`/`text-[#00D97E]` → `bg-[#089981]`/`text-[#089981]` (red `#F23645` unchanged)
- `<main>`: `p-4` → `p-2`
- Grid div (line 159): `className="h-full grid gap-3"` → `className="h-full grid gap-2 trading-grid"` (keep the inline `style` with `gridTemplateColumns/Rows`)
- Footer: `border-[#1A1A2E] ... text-[#666]` → `border-[#1E222D] ... text-[#787B86]`; link `text-[#6D5EE5]` → `text-[#2962FF]`

- [ ] **Step 3: Restyle `ChartPanel.tsx` classes with the TradingView palette**

- Panel root (line 332): `bg-[#0B0B0F] rounded-xl border border-[#1A1A2E]` → `bg-[#131722] rounded-lg border border-[#1E222D]`
- Panel header (line 334): `p-3 border-b border-[#1A1A2E] bg-[#0F0F1A]/80` → `p-2 border-b border-[#1E222D] bg-[#1E222D]/60`
- All selects/inputs: `bg-[#1A1A2E] border border-[#2A2A4A] ... focus:ring-[#6D5EE5]` → `bg-[#131722] border border-[#2A2A4A] ... focus:ring-[#2962FF]`
- Status pill: `bg-[#00D97E]/20 text-[#00D97E]` → `bg-[#089981]/20 text-[#089981]`
- Last price `text-[#888]` → `text-[#787B86]`
- Indicators button: `hover:bg-[#1A1A2E]` → `hover:bg-[#1E222D]`; svg `text-[#888]` → `text-[#787B86]`
- IndicatorsMenu: panel `bg-[#0F0F1A]` → `bg-[#1E222D]`; `ESTÁNDAR` label `text-[#6D5EE5]` → `text-[#2962FF]`; hover rows `hover:bg-[#1A1A2E]` → `hover:bg-[#131722]`; checkboxes `accent-[#6D5EE5]` → `accent-[#2962FF]`; divider `border-[#1A1A2E]` → `border-[#2A2A4A]`; `PREMIUM` `text-[#FFB800]` → `text-[#FF9800]`, its accent `accent-[#FFB800]` → `accent-[#FF9800]`
- Loading overlay `bg-[#0B0B0F]/90` → `bg-[#131722]/90`; spinner `border-[#6D5EE5]` → `border-[#2962FF]`

- [ ] **Step 4: Update chart options in `ChartPanel.tsx` (init effect, lines 54-89)**

Change the `createChart` options block to:
```ts
    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: 'solid', color: '#131722' },
        textColor: '#D1D4DC',
        fontFamily: 'Inter, system-ui, sans-serif',
        panes: {
          separatorColor: '#2A2E39',
          separatorHoverColor: 'rgba(255, 152, 0, 0.2)',
        },
      },
      grid: {
        vertLines: { color: '#1E222D' },
        horzLines: { color: '#1E222D' },
      },
      crosshair: {
        mode: 1, // Magnet mode
        vertLine: { color: '#2A2E39', width: 1, style: 2 },
        horzLine: { color: '#2A2E39', width: 1, style: 2 },
      },
      rightPriceScale: {
        borderColor: '#2A2E39',
        scaleMargins: { top: 0.1, bottom: 0.25 },
      },
      timeScale: {
        borderColor: '#2A2E39',
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: { time: true, price: true },
      },
    } as ChartOptions);
```

- [ ] **Step 5: Update candle + volume colors in the init effect**

In the candle series options (lines 92-100) change `upColor/borderUpColor/wickUpColor` from `#00D97E` to `#26a69a` and `downColor/borderDownColor/wickDownColor` from `#F23645` to `#ef5350`.

In the volume data mapping (data effect, lines 236-240) change the histogram point colors:
```ts
      color: c.close >= c.open ? 'rgba(8, 153, 129, 0.4)' : 'rgba(242, 54, 69, 0.4)',
```

- [ ] **Step 6: Verify**

Run: `npx tsc -b`
Expected: exits 0 with no errors.

---

### Task 3: Sub-pane indicators — RSI, MACD, Williams %R

**Files:**
- Modify: `src/components/ChartPanel.tsx`
- Test: `npx tsc -b`; visual pixel check in Task 6

**Interfaces:**
- Consumes: `ChartIndicators.macd` shape from Task 1 (`macd`/`signal`/`hist`); `config.indicators.rsi/macd/williams`.
- Produces: refs `rsiSeriesRef`, `macdHistRef`, `macdLineRef`, `macdSignalRef`, `williamsSeriesRef` (all `ISeriesApi<...> | null`); function `rebuildIndicatorPanes()` used by Task 4/5 data effect; `ind.rsi`, `ind.williams`, `ind.macd.hist`/`macd`/`signal` data rendering.

- [ ] **Step 1: Add refs**

After `bollingerLowerRef` (line 41) add:
```ts
  const rsiSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const macdHistRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const macdLineRef = useRef<ISeriesApi<'Line'> | null>(null);
  const macdSignalRef = useRef<ISeriesApi<'Line'> | null>(null);
  const williamsSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
```

- [ ] **Step 2: Add `LineStyle` import**

Add `LineStyle` to the `lightweight-charts` import list (after `LineSeries`).

- [ ] **Step 3: Add the `rebuildIndicatorPanes` function**

Add this function right after `applyExtraSeries` (after line 183):
```ts
  // Sub-paneles de indicadores (RSI, MACD, Williams %R) en orden fijo, contiguos.
  const PANE_ORDER = ['rsi', 'macd', 'williams'] as const;

  const rebuildIndicatorPanes = () => {
    const chart = chartRef.current;
    if (!chart) return;

    // 1. Eliminar series de sub-paneles existentes
    [rsiSeriesRef, macdHistRef, macdLineRef, macdSignalRef, williamsSeriesRef].forEach(ref => {
      if (ref.current) {
        try { chart.removeSeries(ref.current); } catch {}
        ref.current = null;
      }
    });

    // 2. Eliminar todos los panes excepto el 0 (precio)
    let guard = 0;
    while (chart.panes().length > 1 && guard < 10) {
      try { chart.removePane(1); } catch { break; }
      guard++;
    }

    // 3. Recrear los panes activos en orden fijo
    let paneIdx = 1;
    for (const key of PANE_ORDER) {
      if (!config.indicators[key]) continue;
      if (key === 'rsi') {
        rsiSeriesRef.current = chart.addSeries(LineSeries, {
          color: '#2962FF',
          lineWidth: 1,
          priceLineVisible: false,
          title: 'RSI (14)',
          autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }),
        }, paneIdx) as ISeriesApi<'Line'>;
        rsiSeriesRef.current.createPriceLine({ price: 70, color: '#787B86', lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: false });
        rsiSeriesRef.current.createPriceLine({ price: 30, color: '#787B86', lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: false });
      } else if (key === 'macd') {
        macdHistRef.current = chart.addSeries(HistogramSeries, {
          priceLineVisible: false,
          title: 'MACD',
        }, paneIdx) as ISeriesApi<'Histogram'>;
        macdLineRef.current = chart.addSeries(LineSeries, {
          color: '#2962FF',
          lineWidth: 1,
          priceLineVisible: false,
          title: 'MACD',
        }, paneIdx) as ISeriesApi<'Line'>;
        macdSignalRef.current = chart.addSeries(LineSeries, {
          color: '#FF9800',
          lineWidth: 1,
          priceLineVisible: false,
          title: 'Signal',
        }, paneIdx) as ISeriesApi<'Line'>;
      } else if (key === 'williams') {
        williamsSeriesRef.current = chart.addSeries(LineSeries, {
          color: '#E91E63',
          lineWidth: 1,
          priceLineVisible: false,
          title: 'Williams %R (14)',
          autoscaleInfoProvider: () => ({ priceRange: { minValue: -100, maxValue: 0 } }),
        }, paneIdx) as ISeriesApi<'Line'>;
        williamsSeriesRef.current.createPriceLine({ price: 0, color: '#787B86', lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: false });
        williamsSeriesRef.current.createPriceLine({ price: -50, color: '#787B86', lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: false });
      }
      paneIdx++;
    }

    // 4. Fijar altura de cada pane de indicador
    for (let i = 1; i < chart.panes().length; i++) {
      try { chart.panes()[i].setHeight(110); } catch {}
    }
  };
```

- [ ] **Step 4: Call `rebuildIndicatorPanes` in the init effect**

After `applyExtraSeries();` (line 117) add `rebuildIndicatorPanes();`.

- [ ] **Step 5: Call `rebuildIndicatorPanes` at the top of the data effect**

In the data effect (line 222-227), BEFORE `applyExtraSeries();`:
```ts
    if (!data || !data.candles || !candleSeriesRef.current || !volumeSeriesRef.current) return;

    // Asegurar que las series de indicadores existen antes de setear sus datos
    rebuildIndicatorPanes();
    applyExtraSeries();
```

- [ ] **Step 6: Render sub-pane indicator data**

Add this block inside the data effect, after the existing Bollinger block (after line 271):
```ts
      // RSI
      if (config.indicators.rsi && rsiSeriesRef.current && ind.rsi) {
        const rsiData: LineData<Time>[] = ind.rsi
          .map((v: number | null, i: number) => v !== null ? { time: ind.times[i] as Time, value: v } : null)
          .filter((v): v is LineData<Time> => v !== null);
        if (rsiData.length > 0) rsiSeriesRef.current.setData(rsiData);
      }

      // MACD
      if (config.indicators.macd && macdHistRef.current && macdLineRef.current && macdSignalRef.current && ind.macd) {
        const histData: HistogramData<Time>[] = ind.macd.hist
          .map((v: number | null, i: number) => v !== null ? {
            time: ind.times[i] as Time,
            value: v,
            color: v >= 0 ? 'rgba(8, 153, 129, 0.55)' : 'rgba(242, 54, 69, 0.55)',
          } : null)
          .filter((v): v is HistogramData<Time> => v !== null);
        const macdData: LineData<Time>[] = ind.macd.macd
          .map((v: number | null, i: number) => v !== null ? { time: ind.times[i] as Time, value: v } : null)
          .filter((v): v is LineData<Time> => v !== null);
        const signalData: LineData<Time>[] = ind.macd.signal
          .map((v: number | null, i: number) => v !== null ? { time: ind.times[i] as Time, value: v } : null)
          .filter((v): v is LineData<Time> => v !== null);
        if (histData.length > 0) macdHistRef.current.setData(histData);
        if (macdData.length > 0) macdLineRef.current.setData(macdData);
        if (signalData.length > 0) macdSignalRef.current.setData(signalData);
      }

      // Williams %R
      if (config.indicators.williams && williamsSeriesRef.current && ind.williams) {
        const wData: LineData<Time>[] = ind.williams
          .map((v: number | null, i: number) => v !== null ? { time: ind.times[i] as Time, value: v } : null)
          .filter((v): v is LineData<Time> => v !== null);
        if (wData.length > 0) williamsSeriesRef.current.setData(wData);
      }
```

- [ ] **Step 7: Null the new refs in cleanup**

In the init effect cleanup (lines 119-130) add:
```ts
      rsiSeriesRef.current = null;
      macdHistRef.current = null;
      macdLineRef.current = null;
      macdSignalRef.current = null;
      williamsSeriesRef.current = null;
```

- [ ] **Step 8: Extend the toggle effect dependencies**

In the effect at line 301-303, change deps:
```ts
  useEffect(() => {
    applyExtraSeries();
  }, [config.indicators.vwap, config.indicators.bollinger, config.indicators.rsi, config.indicators.macd, config.indicators.williams]);
```
(Optional; the data effect already re-runs on any `config.indicators` change. Keep for parity with existing code.)

- [ ] **Step 9: Verify**

Run: `npx tsc -b`
Expected: exits 0 with no errors.

---

### Task 4: Volume toggle + FVG markers via createSeriesMarkers plugin

**Files:**
- Modify: `src/components/ChartPanel.tsx`
- Test: `npx tsc -b`; pixel checks in Task 6 (volume histogram disappears when toggled off; FVG arrows appear)

**Interfaces:**
- Consumes: `config.indicators.volume` (default `true` from Task 1), `config.indicators.fvg`, `data.indicators.fvg`, `candleSeriesRef`.
- Produces: `markersPluginRef` (`ISeriesMarkersPluginApi<Time> | null`) created once at init and detached in cleanup.

- [ ] **Step 1: Add imports**

Add to the `lightweight-charts` import list: `createSeriesMarkers` and type `ISeriesMarkersPluginApi`.

- [ ] **Step 2: Add the markers plugin ref**

After `williamsSeriesRef` (Task 3 Step 1) add:
```ts
  const markersPluginRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
```

- [ ] **Step 3: Create the plugin at init**

After `volumeSeriesRef.current = volumeSeries as ISeriesApi<'Histogram'>;` (line 114) add:
```ts
    markersPluginRef.current = createSeriesMarkers(candleSeries as ISeriesApi<'Candlestick'>);
```

- [ ] **Step 4: Detach the plugin in cleanup**

In the init effect cleanup add:
```ts
      try { markersPluginRef.current?.detach(); } catch {}
      markersPluginRef.current = null;
```

- [ ] **Step 5: Apply volume visibility + FVG markers in the data effect**

After `volumeSeriesRef.current.setData(volumes);` (line 243) add:
```ts
    volumeSeriesRef.current.applyOptions({ visible: config.indicators.volume });
```

Replace the entire FVG block (lines 273-296) — the dead `(candleSeriesRef.current as any).setMarkers?.()` code — with:
```ts
      // FVG - marcadores en la serie principal (plugin createSeriesMarkers de v5)
      if (config.indicators.fvg && markersPluginRef.current) {
        const markers: SeriesMarker<Time>[] = (ind.fvg ?? []).map((box: FVGBox) => ({
          time: box.start as Time,
          position: box.direction === 'bullish' ? 'belowBar' : 'aboveBar',
          shape: box.direction === 'bullish' ? 'arrowUp' : 'arrowDown',
          color: box.direction === 'bullish' ? '#089981' : '#F23645',
        }));
        markersPluginRef.current.setMarkers(markers);
      } else if (markersPluginRef.current) {
        markersPluginRef.current.setMarkers([]);
      }
```

- [ ] **Step 6: Verify**

Run: `npx tsc -b`
Expected: exits 0 with no errors.

---

### Task 5: Volume Profile — price lines + VolumeProfilePrimitive

**Files:**
- Create: `src/components/VolumeProfilePrimitive.ts`
- Modify: `src/components/ChartPanel.tsx`
- Test: `npx tsc -b`; pixel check in Task 6 (POC orange `#FF9800` line + histogram bins)

**Interfaces:**
- Consumes: `VolumeProfileData` type from `../types`; `candleSeriesRef` (ISeriesApi<'Candlestick'>).
- Produces: class `VolumeProfilePrimitive` with `setData(vp: VolumeProfileData | null): void` (attached once at init, data updated per data effect). ChartPanel refs `vpPocLineRef/vpVahLineRef/vpValLineRef` (`IPriceLine | null`).

- [ ] **Step 1: Create `src/components/VolumeProfilePrimitive.ts`**

```ts
import type {
  ISeriesPrimitive,
  ISeriesPrimitivePaneView,
  ISeriesPrimitivePaneRenderer,
  ISeriesApi,
  SeriesAttachedParameter,
  IPrimitivePaneView,
  IPrimitivePaneRenderer,
  Time,
} from 'lightweight-charts';
import type { CanvasRenderingTarget2D } from 'fancy-canvas';
import type { VolumeProfileData } from '../types';

class VolumeProfilePaneRenderer implements IPrimitivePaneRenderer {
  private _data: VolumeProfileData | null = null;
  private _series: ISeriesApi<'Candlestick'> | null = null;
  private _requestUpdate: (() => void) | null = null;

  setData(data: VolumeProfileData | null, series: ISeriesApi<'Candlestick'> | null, requestUpdate: (() => void) | null) {
    this._data = data;
    this._series = series;
    this._requestUpdate = requestUpdate;
  }

  draw(target: CanvasRenderingTarget2D) {
    if (!this._data || !this._series) return;
    const data = this._data;
    const series = this._series;
    const POC = data.poc;
    const MAX_WIDTH_FRACTION = 0.25;

    target.useMediaCoordinateSpace(scope => {
      const ctx = scope.context;
      const paneWidth = scope.mediaSize.width;
      if (paneWidth <= 0) return;
      const maxBarWidth = paneWidth * MAX_WIDTH_FRACTION;

      for (const bin of data.bins) {
        if (!bin || typeof bin.volume !== 'number' || bin.volume <= 0) continue;
        const y = series.priceToCoordinate(bin.price);
        if (y === null || !Number.isFinite(y)) continue;
        const width = data.max_vol > 0 ? (bin.volume / data.max_vol) * maxBarWidth : 0;
        if (width < 0.5) continue;
        const x = paneWidth - width;
        let color = 'rgba(242, 54, 69, 0.30)';
        if (bin.poc) color = 'rgba(255, 152, 0, 0.85)';
        else if (POC === null || bin.price >= POC) color = 'rgba(8, 153, 129, 0.30)';
        ctx.fillStyle = color;
        ctx.fillRect(x, y - 1, width, 2);
      }
    });
  }
}

class VolumeProfilePaneView implements IPrimitivePaneView {
  constructor(private readonly _renderer: VolumeProfilePaneRenderer) {}
  renderer(): IPrimitivePaneRenderer | null {
    return this._renderer;
  }
}

export class VolumeProfilePrimitive implements ISeriesPrimitive<Time> {
  private readonly _renderer = new VolumeProfilePaneRenderer();
  private readonly _paneView: IPrimitivePaneView = new VolumeProfilePaneView(this._renderer);
  private _series: ISeriesApi<'Candlestick'> | null = null;
  private _requestUpdate: (() => void) | null = null;
  private _data: VolumeProfileData | null = null;

  attached(param: SeriesAttachedParameter<Time>) {
    this._series = param.series as ISeriesApi<'Candlestick'>;
    this._requestUpdate = param.requestUpdate;
    this._renderer.setData(this._data, this._series, this._requestUpdate);
  }

  paneViews(): ReadonlyArray<IPrimitivePaneView> {
    return [this._paneView];
  }

  setData(data: VolumeProfileData | null) {
    this._data = data;
    this._renderer.setData(data, this._series, this._requestUpdate);
    if (this._requestUpdate) this._requestUpdate();
  }
}
```

- [ ] **Step 2: Add imports + refs in `ChartPanel.tsx`**

Add `IPriceLine` to the `lightweight-charts` type imports, and `import { VolumeProfilePrimitive } from './VolumeProfilePrimitive';`.

Add refs after `markersPluginRef` (Task 4 Step 2):
```ts
  const volumeProfilePrimitiveRef = useRef<VolumeProfilePrimitive | null>(null);
  const vpPocLineRef = useRef<IPriceLine | null>(null);
  const vpVahLineRef = useRef<IPriceLine | null>(null);
  const vpValLineRef = useRef<IPriceLine | null>(null);
```

- [ ] **Step 3: Attach the primitive at init**

After the markers plugin creation (Task 4 Step 3) add:
```ts
    const vpPrimitive = new VolumeProfilePrimitive();
    candleSeries.attachPrimitive(vpPrimitive);
    volumeProfilePrimitiveRef.current = vpPrimitive;
```

Add to cleanup:
```ts
      volumeProfilePrimitiveRef.current = null;
      vpPocLineRef.current = null;
      vpVahLineRef.current = null;
      vpValLineRef.current = null;
```

- [ ] **Step 4: Render VP lines + histogram data in the data effect**

Add this block after the Williams block (Task 3 Step 6):
```ts
      // Volume Profile - líneas POC/VAH/VAL + histograma horizontal
      const vp = ind.volume_profile;
      const candleSeries = candleSeriesRef.current;
      const removeVpLines = () => {
        if (!candleSeries) return;
        [vpPocLineRef, vpVahLineRef, vpValLineRef].forEach(ref => {
          if (ref.current) {
            try { candleSeries.removePriceLine(ref.current); } catch {}
            ref.current = null;
          }
        });
      };
      if (config.indicators.volumeProfile && candleSeries && vp && vp.poc !== null) {
        removeVpLines();
        vpPocLineRef.current = candleSeries.createPriceLine({ price: vp.poc, color: '#FF9800', lineWidth: 2, axisLabelVisible: true, title: 'POC' });
        if (vp.vah !== null) vpVahLineRef.current = candleSeries.createPriceLine({ price: vp.vah, color: '#787B86', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: 'VAH' });
        if (vp.val !== null) vpValLineRef.current = candleSeries.createPriceLine({ price: vp.val, color: '#787B86', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: 'VAL' });
      } else {
        removeVpLines();
      }
      volumeProfilePrimitiveRef.current?.setData(config.indicators.volumeProfile && vp ? vp : null);
```

- [ ] **Step 5: Verify**

Run: `npx tsc -b`
Expected: exits 0 with no errors.

---

### Task 6: End-to-end verification (Playwright + tsc + build)

**Files:**
- Create: `verify-final.mjs` (project root)
- Test: run the whole app and verify every indicator + grid + responsive

**Interfaces:**
- Consumes: all previous tasks; backend on `localhost:5000`, Vite on `localhost:5001`.

- [ ] **Step 1: Start backend + frontend**

Run (two shells or background):
```
cd backend && .\venv\Scripts\python.exe app.py
npm run dev
```
Wait until `http://localhost:5001/api/market-status` returns 200.

- [ ] **Step 2: Write `verify-final.mjs`**

```js
import { chromium } from 'playwright-core';

const executablePath = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

const errors = [];
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', err => errors.push(`PAGEERROR: ${err.message}`));

async function countColor(el, [r, g, b], tol = 40) {
  for (const c of el.querySelectorAll('canvas')) {
    try {
      const ctx = c.getContext('2d');
      if (!ctx) continue;
      const img = ctx.getImageData(0, 0, c.width, c.height).data;
      let count = 0;
      for (let i = 0; i < img.length; i += 4) {
        if (Math.abs(img[i] - r) < tol && Math.abs(img[i + 1] - g) < tol && Math.abs(img[i + 2] - b) < tol) count++;
      }
      if (count > 60) return count;
    } catch {}
  }
  return 0;
}

async function toggleIndicator(label) {
  await page.locator('button[aria-label="Indicadores"]').first().click();
  await page.waitForTimeout(250);
  await page.locator('label', { hasText: label }).first().click();
  await page.waitForTimeout(1800);
}

async function panelsInfo() {
  return page.evaluate(() => {
    const vw = window.innerWidth, vh = window.innerHeight;
    const panels = [...document.querySelectorAll('main .rounded-lg')];
    return {
      count: panels.length,
      visible: panels.filter(el => {
        const r = el.getBoundingClientRect();
        return r.top >= 0 && r.left >= 0 && r.bottom <= vh + 1 && r.right <= vw + 1 && r.width > 50 && r.height > 50;
      }).length,
      first: panels[0] ? Math.round(panels[0].getBoundingClientRect().width) : 0,
    };
  });
}

await page.goto('http://localhost:5001', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(4000);

const checks = {
  'grid default=1': async () => (await panelsInfo()).count === 1,
  'VWAP': async () => (await countColor(await page.locator('main .rounded-lg').first().elementHandle(), [255, 152, 0])) > 0,
  'Bollinger': async () => (await countColor(await page.locator('main .rounded-lg').first().elementHandle(), [169, 122, 255])) > 0,
  'RSI': async () => (await countColor(await page.locator('main .rounded-lg').first().elementHandle(), [41, 98, 255])) > 0,
  'MACD': async () => (await countColor(await page.locator('main .rounded-lg').first().elementHandle(), [41, 98, 255])) > 0,
  'Williams': async () => (await countColor(await page.locator('main .rounded-lg').first().elementHandle(), [233, 30, 99])) > 0,
  'VolumeProfile': async () => (await countColor(await page.locator('main .rounded-lg').first().elementHandle(), [255, 152, 0])) > 0,
  'FVG': async () => (await countColor(await page.locator('main .rounded-lg').first().elementHandle(), [8, 153, 129])) > 0,
};

const results = [];
for (const [name, fn] of Object.entries(checks)) {
  const ok = await fn();
  results.push(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  console.log(results[results.length - 1]);
}
await page.screenshot({ path: 'verify_all_indicators.png' });

// Volumen toggle off: histograma debe desaparecer (pocos píxeles verdes de volumen)
await toggleIndicator('Volumen');
const greenish = await page.evaluate(() => {
  const el = document.querySelector('main .rounded-lg');
  let count = 0;
  for (const c of el.querySelectorAll('canvas')) {
    try {
      const ctx = c.getContext('2d');
      const img = ctx.getImageData(0, 0, c.width, c.height).data;
      for (let i = 0; i < img.length; i += 4) {
        if (img[i + 1] > 15 && img[i + 1] > img[i] * 1.8 && img[i + 1] > img[i + 2] * 1.8) count++;
      }
    } catch {}
  }
  return count;
});
console.log(greenish < 200 ? 'PASS volumen off (histograma oculto)' : `FAIL volumen off (aun hay ${greenish} px)`);

// Grids y responsive
const gridTests = [];
for (const g of [2, 4, 6, 8]) {
  await page.selectOption('header select', String(g));
  await page.waitForTimeout(3000);
  const info = await panelsInfo();
  gridTests.push(`${info.count === g && info.visible === g ? 'PASS' : 'FAIL'} grid=${g} (${info.visible}/${info.count} visibles)`);
  console.log(gridTests[gridTests.length - 1]);
}
await page.setViewportSize({ width: 800, height: 1000 });
await page.waitForTimeout(2000);
const mob = await panelsInfo();
console.log(mob.count === 1 || mob.first <= 900 ? 'PASS mobile 1 columna' : `FAIL mobile (${JSON.stringify(mob)})`);
await page.screenshot({ path: 'verify_mobile.png' });

console.log('ERRORES DE CONSOLA:', errors.length ? errors.join('\n') : 'ninguno');
await browser.close();
```

- [ ] **Step 3: Run the verification**

Run: `node verify-final.mjs`
Expected: all `PASS` lines, `volumen off` PASS, no console errors.

- [ ] **Step 4: Build check**

Run: `npm run build`
Expected: `tsc -b` and `vite build` both succeed.

- [ ] **Step 5: Fix any FAIL**

For each FAIL, use systematic-debugging: reproduce, inspect, fix, re-run only that check. Iterate until all PASS.

---

## Self-Review Notes

- **Spec coverage:** Layout (TradingView palette + squared responsive grid) → Task 2. RSI/MACD/Williams sub-panes → Task 3. Volumen toggle default true → Task 1 + Task 4. FVG via `createSeriesMarkers` → Task 4. Volume Profile (POC/VAH/VAL lines + horizontal histogram) → Task 5. Golden rule (reconstruct before setData) → Task 3 Step 5. Testing (headless per indicator + grids + responsive + tsc + build) → Task 6. Error handling per block (`try/catch` in rebuild, VP lines, cleanup) → Tasks 3/4/5.
- **Placeholder scan:** no TBD/TODO; all code blocks complete.
- **Type consistency:** `rebuildIndicatorPanes` defined in Task 3 and called in Tasks 3/4/5 data effect; `markersPluginRef` created in Task 4 Step 3 and used in Task 4 Step 5; `VolumeProfilePrimitive.setData` created in Task 5 Step 1 and used in Task 5 Step 4; `macd.macd/signal/hist` shape set in Task 1 and consumed in Task 3 Step 6; `IPriceLine` imported in Task 5 and used for VP line refs.
