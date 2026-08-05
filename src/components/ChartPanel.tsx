import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createChart,
  createSeriesMarkers,
  IChartApi,
  ISeriesApi,
  ChartOptions,
  CandlestickData,
  HistogramData,
  LineData,
  SeriesMarker,
  Time,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  LineStyle,
  ISeriesMarkersPluginApi,
  IPriceLine,
} from 'lightweight-charts';
import type { PanelConfig, Candle, ChartIndicators, FVGBox } from '../types';
import { VolumeProfilePrimitive } from './VolumeProfilePrimitive';
import { FVGPrimitive } from './FVGPrimitive';

// Separación objetivo de velas (px) para el zoom por defecto del gráfico
const DEFAULT_BAR_SPACING = 9;

interface PanelData {
  candles: Candle[];
  indicators?: ChartIndicators;
  error?: string;
}

interface ChartPanelProps {
  config: PanelConfig;
  onSymbolChange: (symbol: string) => void;
  onTimeframeChange: (tf: PanelConfig['timeframe']) => void;
  onMarketChange: (market: PanelConfig['market']) => void;
  onIndicatorToggle: (indicator: keyof PanelConfig['indicators'], value: boolean) => void;
  onMaximize: () => void;
  isMaximized?: boolean;
  style?: React.CSSProperties;
}

export function ChartPanel({ config, onSymbolChange, onTimeframeChange, onMarketChange, onIndicatorToggle, onMaximize, isMaximized = false, style }: ChartPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const vwapSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const bollingerUpperRef = useRef<ISeriesApi<'Line'> | null>(null);
  const bollingerMidRef = useRef<ISeriesApi<'Line'> | null>(null);
  const bollingerLowerRef = useRef<ISeriesApi<'Line'> | null>(null);
  const rsiSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const macdHistRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const macdLineRef = useRef<ISeriesApi<'Line'> | null>(null);
  const macdSignalRef = useRef<ISeriesApi<'Line'> | null>(null);
  const williamsSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const markersPluginRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const volumeProfilePrimitiveRef = useRef<VolumeProfilePrimitive | null>(null);
  const fvgPrimitiveRef = useRef<FVGPrimitive | null>(null);
  const vpPocLineRef = useRef<IPriceLine | null>(null);
  const vpVahLineRef = useRef<IPriceLine | null>(null);
  const vpValLineRef = useRef<IPriceLine | null>(null);
  const [data, setData] = useState<PanelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [marketStatus, setMarketStatus] = useState<'Live' | 'Closed'>('Live');
  const [lastPrice, setLastPrice] = useState<number | null>(null);
  const [symbolInput, setSymbolInput] = useState(config.symbol);
  const loadSeqRef = useRef(0);
  const marketStatusRef = useRef(marketStatus);
  const lastIndicatorsKeyRef = useRef<string | null>(null);
  const prevRangeRef = useRef<{ from: number; to: number } | null>(null);
  const lastDataContextRef = useRef<string | null>(null);

  useEffect(() => {
    marketStatusRef.current = marketStatus;
  }, [marketStatus]);

  const TIMEFRAMES: PanelConfig['timeframe'][] = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1M'];

  // Inicializar chart
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      autoSize: true,
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

    // Serie principal de velas
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderUpColor: '#26a69a',
      borderDownColor: '#ef5350',
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
    });

    // Serie de volumen (abajo)
    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: '#3A3A5A',
      priceFormat: { type: 'volume', precision: 0 },
      priceScaleId: 'volume',
    });
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.7, bottom: 0 },
    });

    chartRef.current = chart;

    // Hook de test solo en dev: expone el chart para verify-final.mjs
    if (import.meta.env.DEV) {
      const w = window as unknown as { __elitosCharts?: Record<string, IChartApi> };
      w.__elitosCharts = w.__elitosCharts ?? {};
      w.__elitosCharts[config.id] = chart;
    }

    candleSeriesRef.current = candleSeries as ISeriesApi<'Candlestick'>;
    volumeSeriesRef.current = volumeSeries as ISeriesApi<'Histogram'>;

    // Plugin de marcadores FVG (v5 reemplazó series.setMarkers)
    markersPluginRef.current = createSeriesMarkers(candleSeries as ISeriesApi<'Candlestick'>);

    // Primitive de histograma horizontal de Volume Profile
    const vpPrimitive = new VolumeProfilePrimitive();
    candleSeries.attachPrimitive(vpPrimitive);
    volumeProfilePrimitiveRef.current = vpPrimitive;

    // Primitive de cajas FVG (área entre velas, estilo TradingView)
    const fvgPrimitive = new FVGPrimitive();
    candleSeries.attachPrimitive(fvgPrimitive);
    fvgPrimitiveRef.current = fvgPrimitive;

    // Aplicar series extra si hay indicadores activos
    applyExtraSeries();
    rebuildIndicatorPanes();

    return () => {
      try {
        // Desconectar ResizeObserver de autoSize antes de destruir para evitar el
        // race "Object is disposed" al desmontar paneles con grid que cambia
        if (chartRef.current) chartRef.current.applyOptions({ autoSize: false });
      } catch {}
      try {
        if (chartRef.current) chartRef.current.remove();
      } catch {}
      try { markersPluginRef.current?.detach(); } catch {}
      markersPluginRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      vwapSeriesRef.current = null;
      bollingerUpperRef.current = null;
      bollingerMidRef.current = null;
      bollingerLowerRef.current = null;
      rsiSeriesRef.current = null;
      macdHistRef.current = null;
      macdLineRef.current = null;
      macdSignalRef.current = null;
      williamsSeriesRef.current = null;
      volumeProfilePrimitiveRef.current = null;
      fvgPrimitiveRef.current = null;
      vpPocLineRef.current = null;
      vpVahLineRef.current = null;
      vpValLineRef.current = null;

      if (import.meta.env.DEV) {
        const w = window as unknown as { __elitosCharts?: Record<string, IChartApi> };
        if (w.__elitosCharts) delete w.__elitosCharts[config.id];
      }

      if (import.meta.env.DEV) {
        const w = window as unknown as { __elitosChartMeta?: Record<string, { refreshCount: number; lastUpdated: number }> };
        if (w.__elitosChartMeta) delete w.__elitosChartMeta[config.id];
      }

      chartRef.current = null;
    };
  }, []);

  // Aplicar series de indicadores
  const applyExtraSeries = () => {
    const chart = chartRef.current;
    if (!chart) return;

    // VWAP
    if (config.indicators.vwap && !vwapSeriesRef.current) {
      vwapSeriesRef.current = chart.addSeries(LineSeries, {
        color: '#FF9800',
        lineWidth: 2,
        priceLineVisible: false,
        title: 'VWAP',
      }) as ISeriesApi<'Line'>;
    } else if (!config.indicators.vwap && vwapSeriesRef.current) {
      try { chart.removeSeries(vwapSeriesRef.current); } catch {}
      vwapSeriesRef.current = null;
    }

    // Bollinger Bands
    if (config.indicators.bollinger) {
      if (!bollingerUpperRef.current) {
        bollingerUpperRef.current = chart.addSeries(LineSeries, {
          color: '#A97AFF',
          lineWidth: 1,
          lineStyle: 2,
          priceLineVisible: false,
          title: 'BB Upper',
        }) as ISeriesApi<'Line'>;
        bollingerMidRef.current = chart.addSeries(LineSeries, {
          color: '#A97AFF',
          lineWidth: 1,
          priceLineVisible: false,
          title: 'BB Mid',
        }) as ISeriesApi<'Line'>;
        bollingerLowerRef.current = chart.addSeries(LineSeries, {
          color: '#A97AFF',
          lineWidth: 1,
          lineStyle: 2,
          priceLineVisible: false,
          title: 'BB Lower',
        }) as ISeriesApi<'Line'>;
      }
    } else {
      [bollingerUpperRef, bollingerMidRef, bollingerLowerRef].forEach(ref => {
        if (ref.current) {
          try { chart.removeSeries(ref.current); } catch {}
          ref.current = null;
        }
      });
    }
  };

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
      if (seq === loadSeqRef.current) setLoading(false);
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

  // Actualizar series cuando llegan datos
  useEffect(() => {
    if (!data || !data.candles || !candleSeriesRef.current || !volumeSeriesRef.current) return;

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

    // Capturar el rango visible antes de reemplazar los datos: lo usará el efecto de
    // zoom para restaurar la vista del usuario tras un refresh del mismo contexto.
    prevRangeRef.current = chartRef.current?.timeScale().getVisibleLogicalRange() ?? null;

    const candles: CandlestickData<Time>[] = data.candles.map((c: Candle) => ({
      time: c.time as Time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    const volumes: HistogramData<Time>[] = data.candles.map((c: Candle) => ({
      time: c.time as Time,
      value: c.volume,
      color: c.close >= c.open ? 'rgba(8, 153, 129, 0.4)' : 'rgba(242, 54, 69, 0.4)',
    }));

    candleSeriesRef.current.setData(candles);
    volumeSeriesRef.current.setData(volumes);
    volumeSeriesRef.current.applyOptions({ visible: config.indicators.volume });

    // Ajustar márgenes de escala: sin volumen, el precio llena todo el panel
    const chart = chartRef.current;
    if (chart) {
      const volumeOn = config.indicators.volume;
      try {
        chart.priceScale('right').applyOptions({ scaleMargins: volumeOn ? { top: 0.1, bottom: 0.25 } : { top: 0.1, bottom: 0.06 } });
      } catch {}
    }

    // Indicadores
    if (data.indicators) {
      const ind = data.indicators;

      // VWAP
      if (config.indicators.vwap && vwapSeriesRef.current && ind.vwap && ind.vwap.length > 0) {
        const vwapData: LineData<Time>[] = ind.vwap
          .map((v: number | null, i: number) => v !== null ? { time: ind.times[i] as Time, value: v } : null)
          .filter((v): v is LineData<Time> => v !== null);
        if (vwapData.length > 0) vwapSeriesRef.current.setData(vwapData);
      }

      // Bollinger
      if (config.indicators.bollinger && bollingerUpperRef.current && ind.bollinger) {
        const upperData: LineData<Time>[] = ind.bollinger.upper
          .map((v: number | null, i: number) => v !== null ? { time: ind.times[i] as Time, value: v } : null)
          .filter((v): v is LineData<Time> => v !== null);
        const midData: LineData<Time>[] = ind.bollinger.mid
          .map((v: number | null, i: number) => v !== null ? { time: ind.times[i] as Time, value: v } : null)
          .filter((v): v is LineData<Time> => v !== null);
        const lowerData: LineData<Time>[] = ind.bollinger.lower
          .map((v: number | null, i: number) => v !== null ? { time: ind.times[i] as Time, value: v } : null)
          .filter((v): v is LineData<Time> => v !== null);
        if (upperData.length > 0) bollingerUpperRef.current.setData(upperData);
        if (midData.length > 0 && bollingerMidRef.current) bollingerMidRef.current.setData(midData);
        if (lowerData.length > 0 && bollingerLowerRef.current) bollingerLowerRef.current.setData(lowerData);
      }

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
          .filter((v): v is { time: Time; value: number; color: string } => v !== null);
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

      // Volume Profile - líneas POC/VAH/VAL + histograma horizontal
      const vp = ind.volume_profile;
      const removeVpLines = () => {
        if (!candleSeriesRef.current) return;
        [vpPocLineRef, vpVahLineRef, vpValLineRef].forEach(ref => {
          if (ref.current) {
            try { candleSeriesRef.current!.removePriceLine(ref.current); } catch {}
            ref.current = null;
          }
        });
      };
      if (config.indicators.volumeProfile && vp && vp.poc !== null) {
        removeVpLines();
        vpPocLineRef.current = candleSeriesRef.current.createPriceLine({ price: vp.poc, color: '#FF9800', lineWidth: 2, axisLabelVisible: true, title: 'POC' });
        if (vp.vah !== null) vpVahLineRef.current = candleSeriesRef.current.createPriceLine({ price: vp.vah, color: '#787B86', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: 'VAH' });
        if (vp.val !== null) vpValLineRef.current = candleSeriesRef.current.createPriceLine({ price: vp.val, color: '#787B86', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: 'VAL' });
      } else {
        removeVpLines();
      }
      volumeProfilePrimitiveRef.current?.setData(config.indicators.volumeProfile && vp ? vp : null);

      // FVG - cajas (primitiva) + marcadores en la serie principal (plugin createSeriesMarkers de v5)
      const fvgBoxes: FVGBox[] = ind.fvg ?? [];
      fvgPrimitiveRef.current?.setData(config.indicators.fvg ? fvgBoxes : null);
      if (config.indicators.fvg && markersPluginRef.current) {
        const markers: SeriesMarker<Time>[] = fvgBoxes.map((box: FVGBox) => ({
          time: box.start as Time,
          position: box.direction === 'bullish' ? 'belowBar' : 'aboveBar',
          shape: box.direction === 'bullish' ? 'arrowUp' : 'arrowDown',
          color: box.direction === 'bullish' ? '#089981' : '#F23645',
        }));
        markersPluginRef.current.setMarkers(markers);
      } else if (markersPluginRef.current) {
        markersPluginRef.current.setMarkers([]);
      }
    }
  }, [data, config.indicators]);

  // Zoom por defecto: mostrar el último bloque de velas que quepa en el ancho del panel.
  // Depende solo de [data] para que alternar indicadores NO resetee el zoom del usuario.
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

  // Efecto para indicadores que cambian
  useEffect(() => {
    applyExtraSeries();
  }, [config.indicators.vwap, config.indicators.bollinger, config.indicators.rsi, config.indicators.macd, config.indicators.williams]);

  // Actualizar estado de mercado periódicamente
  useEffect(() => {
    const updateStatus = async () => {
      try {
        const { fetchMarketStatus } = await import('../services/api');
        const status = await fetchMarketStatus();
        setMarketStatus(config.market === 'crypto' ? status.crypto : status.us);
        if (config.market === 'crypto') {
          const { fetchCryptoLive } = await import('../services/api');
          const live = await fetchCryptoLive();
          if (live.live) setLastPrice(live.price);
        }
      } catch {}
    };
    updateStatus();
    const interval = setInterval(updateStatus, 30000);
    return () => clearInterval(interval);
  }, [config.market]);

  const handleSymbolSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (symbolInput.trim()) {
      onSymbolChange(symbolInput.trim().toUpperCase());
    }
  };

  return (
    <div className="bg-[#131722] rounded-lg border border-[#1E222D] flex flex-col h-full relative min-h-0" style={style}>
      {/* Header del panel */}
      <div className="p-2 border-b border-[#1E222D] flex flex-wrap items-center gap-2 bg-[#1E222D]/60 relative">
        {/* Market selector */}
        <select
          value={config.market}
          onChange={(e) => onMarketChange(e.target.value as 'crypto' | 'stocks')}
          className="bg-[#131722] border border-[#2A2A4A] text-[#D1D4DC] text-xs px-2 py-1 rounded focus:outline-none focus:ring-1 focus:ring-[#2962FF]"
        >
          <option value="stocks">US Stocks</option>
        </select>

        {/* Ticker search */}
        <form onSubmit={handleSymbolSubmit} className="relative flex-1 min-w-[120px] max-w-[200px]">
          <input
            type="text"
            value={symbolInput}
            onChange={(e) => setSymbolInput(e.target.value)}
            placeholder={config.market === 'crypto' ? 'BTC, ETH...' : 'AAPL, MSFT...'}
            className="w-full bg-[#131722] border border-[#2A2A4A] text-[#D1D4DC] text-xs px-2 py-1 rounded focus:outline-none focus:ring-1 focus:ring-[#2962FF] pr-8"
          />
        </form>

        {/* Timeframe */}
        <select
          value={config.timeframe}
          onChange={(e) => onTimeframeChange(e.target.value as PanelConfig['timeframe'])}
          className="bg-[#131722] border border-[#2A2A4A] text-[#D1D4DC] text-xs px-2 py-1 rounded focus:outline-none focus:ring-1 focus:ring-[#2962FF]"
        >
          {TIMEFRAMES.map(tf => <option key={tf} value={tf}>{tf}</option>)}
        </select>

        {/* Market status */}
        <span className={`ml-auto px-2 py-0.5 rounded text-xs font-medium ${marketStatus === 'Live' ? 'bg-[#089981]/20 text-[#089981]' : 'bg-[#F23645]/20 text-[#F23645]'}`}>
          {marketStatus}
        </span>

        {/* Last price */}
        {lastPrice !== null && (
          <span className="text-xs text-[#787B86] font-mono">
            {lastPrice.toLocaleString()}
          </span>
        )}

        {/* Maximizar panel */}
        <button
          data-testid="maximize-toggle"
          onClick={onMaximize}
          className="p-1.5 rounded hover:bg-[#1E222D] transition-colors"
          aria-label={isMaximized ? 'Restaurar' : 'Maximizar'}
          title={isMaximized ? 'Restaurar' : 'Maximizar'}
        >
          {isMaximized ? (
            <svg className="w-4 h-4 text-[#787B86]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9V5a2 2 0 00-2-2H5a2 2 0 00-2 2v2a2 2 0 002 2h4zm6 0h4a2 2 0 002-2V5a2 2 0 00-2-2h-2a2 2 0 00-2 2v4zM9 15H5a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-4zm6 0v4a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2h-4z" />
            </svg>
          ) : (
            <svg className="w-4 h-4 text-[#787B86]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V6a2 2 0 012-2h2M20 8V6a2 2 0 00-2-2h-2M4 16v2a2 2 0 002 2h2M20 16v2a2 2 0 01-2 2h-2" />
            </svg>
          )}
        </button>

        {/* Indicators menu button */}
        <IndicatorsMenu config={config} onToggle={onIndicatorToggle} />
      </div>

      {/* Chart container */}
      <div ref={containerRef} onDoubleClick={onMaximize} className="flex-1 w-full min-h-0" />

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#131722]/90 z-10">
          <div className="w-8 h-8 border-2 border-[#2962FF] border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}

// Sub-componente: Menú de indicadores
function IndicatorsMenu({ config, onToggle }: { config: PanelConfig; onToggle: (k: keyof PanelConfig['indicators'], v: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const [localIndicators, setLocalIndicators] = useState(config.indicators);

  // Sincronizar con config
  useEffect(() => {
    setLocalIndicators(config.indicators);
  }, [config.indicators]);

  const handleToggle = (key: keyof PanelConfig['indicators']) => {
    const newValue = !localIndicators[key];
    setLocalIndicators(prev => ({ ...prev, [key]: newValue }));
    onToggle(key, newValue);
  };

  const standardIndicators: Array<[keyof PanelConfig['indicators'], string]> = [
    ['rsi', 'RSI (14)'],
    ['macd', 'MACD (12,26,9)'],
    ['volume', 'Volumen'],
    ['bollinger', 'Bandas Bollinger (20,2)'],
    ['vwap', 'VWAP'],
    ['williams', 'Williams %R (14)'],
  ];

  const premiumIndicators: Array<[keyof PanelConfig['indicators'], string]> = [
    ['volumeProfile', 'Volume Profile (VAH/VAL/POC)'],
    ['fvg', 'Fair Value Gap (FVG)'],
  ];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="p-1.5 rounded hover:bg-[#1E222D] transition-colors"
        aria-label="Indicadores"
      >
        <svg className="w-4 h-4 text-[#787B86]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 bg-[#1E222D] border border-[#2A2A4A] rounded-lg shadow-xl p-2 z-20">
          <div className="text-xs text-[#2962FF] font-medium px-2 py-1">ESTÁNDAR</div>
          {standardIndicators.map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 px-2 py-1.5 hover:bg-[#131722] rounded cursor-pointer text-xs text-[#D1D4DC]">
              <input
                type="checkbox"
                checked={localIndicators[key]}
                onChange={() => handleToggle(key)}
                className="w-4 h-4 accent-[#2962FF] border-[#2A2A4A] bg-[#131722] rounded"
              />
              <span>{label}</span>
            </label>
          ))}

          <div className="border-t border-[#2A2A4A] my-1" />

          <div className="text-xs text-[#FF9800] font-medium px-2 py-1">PREMIUM</div>
          {premiumIndicators.map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 px-2 py-1.5 hover:bg-[#131722] rounded cursor-pointer text-xs text-[#D1D4DC]">
              <input
                type="checkbox"
                checked={localIndicators[key]}
                onChange={() => handleToggle(key)}
                className="w-4 h-4 accent-[#FF9800] border-[#2A2A4A] bg-[#131722] rounded"
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}