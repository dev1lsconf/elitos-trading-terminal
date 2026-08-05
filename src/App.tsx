import { useState, useCallback, useMemo, useEffect } from 'react';
import { ChartPanel } from './components/ChartPanel';
import type { PanelConfig, GridLayout, MarketStatus, Timeframe } from './types';
import { GRID_OPTIONS, TIMEFRAMES, DEFAULT_PANEL_CONFIG } from './types';
import { fetchMarketStatus } from './services/api';

export default function App() {
  const [gridLayout, setGridLayout] = useState<GridLayout>(1);
  const [panels, setPanels] = useState<PanelConfig[]>(() => {
    const initial: PanelConfig[] = [];
    const symbols = ['AAPL', 'MSFT', 'AMZN', 'TSLA'];
    for (let i = 0; i < 4; i++) {
      initial.push({
        id: `panel-${i}`,
        ...DEFAULT_PANEL_CONFIG,
        symbol: symbols[i % symbols.length],
      });
    }
    return initial;
  });
  const [marketStatus, setMarketStatus] = useState<MarketStatus>({ crypto: 'Live', us: 'Closed' });
  const [globalTimeframe, setGlobalTimeframe] = useState<Timeframe>('1d');
  const [syncTimeframes, setSyncTimeframes] = useState(false);
  const [maximizedPanelId, setMaximizedPanelId] = useState<string | null>(null);

  const gridConfig = useMemo(() => GRID_OPTIONS.find(g => g.value === gridLayout)!, [gridLayout]);

  const ensurePanelCount = useCallback((count: number) => {
    setPanels(prev => {
      if (prev.length === count) return prev;
      if (prev.length > count) return prev.slice(0, count);
      const newPanels = [...prev];
      const symbols = ['AAPL', 'MSFT', 'AMZN', 'TSLA', 'NVDA', 'META', 'GOOGL', 'NFLX'];
      for (let i = prev.length; i < count; i++) {
        newPanels.push({
          id: `panel-${i}`,
          ...DEFAULT_PANEL_CONFIG,
          symbol: symbols[i % symbols.length],
          market: 'stocks',
        });
      }
      return newPanels;
    });
  }, []);

  const handleSymbolChange = useCallback((panelId: string, symbol: string) => {
    setPanels(prev => prev.map(p => p.id === panelId ? { ...p, symbol } : p));
  }, []);

  const handleTimeframeChange = useCallback((panelId: string, timeframe: Timeframe) => {
    setPanels(prev => prev.map(p => p.id === panelId ? { ...p, timeframe } : p));
  }, []);

  const handleMarketChange = useCallback((panelId: string, market: PanelConfig['market']) => {
    setPanels(prev => prev.map(p => {
      if (p.id !== panelId) return p;
      return { ...p, market, symbol: 'AAPL' };
    }));
  }, []);

  const handleIndicatorToggle = useCallback((panelId: string, indicator: keyof PanelConfig['indicators'], value: boolean) => {
    setPanels(prev => prev.map(p =>
      p.id === panelId ? { ...p, indicators: { ...p.indicators, [indicator]: value } } : p
    ));
  }, []);

  // Actualizar market status periódicamente
  useEffect(() => {
    const update = async () => {
      try {
        const status = await fetchMarketStatus();
        setMarketStatus({ us: status.us, crypto: status.crypto });
      } catch {}
    };
    update();
    const id = setInterval(update, 30000);
    return () => clearInterval(id);
  }, []);

  // Sincronizar timeframes si está activado
  useEffect(() => {
    if (syncTimeframes) {
      setPanels(prev => prev.map(p => ({ ...p, timeframe: globalTimeframe })));
    }
  }, [syncTimeframes, globalTimeframe]);

  const handleGlobalTimeframeChange = (tf: Timeframe) => {
    setGlobalTimeframe(tf);
    if (syncTimeframes) {
      setPanels(prev => prev.map(p => ({ ...p, timeframe: tf })));
    }
  };

  const handleMaximize = useCallback((panelId: string | null) => {
    setMaximizedPanelId(prev => (prev === panelId ? null : panelId));
  }, []);

  useEffect(() => {
    if (maximizedPanelId === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMaximizedPanelId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [maximizedPanelId]);

  return (
    <div className="h-screen bg-[#131722] text-[#D1D4DC] font-sans antialiased flex flex-col">
      {/* Toolbar superior */}
      <header className="sticky top-0 z-50 bg-[#131722]/95 backdrop-blur-md border-b border-[#1E222D] flex-shrink-0">
        <div className="max-w-full mx-auto px-4 py-3 flex flex-wrap items-center gap-3">
          {/* Título */}
          <h1 className="text-xl font-bold bg-gradient-to-r from-[#2962FF] to-[#FF9800] bg-clip-text text-transparent flex items-center gap-2">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Elitos
          </h1>

          {/* Grid selector */}
          <div className="flex items-center gap-2 ml-4 border-l border-[#1E222D] pl-4">
            <span className="text-xs text-[#787B86] uppercase tracking-wide">Grid</span>
            <select
              value={gridLayout}
              onChange={(e) => {
                const val = parseInt(e.target.value) as GridLayout;
                setGridLayout(val);
                ensurePanelCount(val);
              }}
              className="bg-[#1E222D] border border-[#2A2A4A] text-[#D1D4DC] text-sm px-3 py-1.5 rounded focus:outline-none focus:ring-1 focus:ring-[#2962FF] cursor-pointer"
            >
              {GRID_OPTIONS.map(g => (
                <option key={g.value} value={g.value}>{g.label} ({g.cols}×{g.rows})</option>
              ))}
            </select>
          </div>

          {/* Global timeframe sync */}
          <div className="flex items-center gap-2 border-l border-[#1E222D] pl-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={syncTimeframes}
                onChange={(e) => setSyncTimeframes(e.target.checked)}
                className="w-4 h-4 accent-[#2962FF] border-[#2A2A4A] bg-[#1E222D] rounded"
              />
              <span className="text-xs text-[#787B86]">Sync TF</span>
            </label>
            {syncTimeframes && (
              <select
                value={globalTimeframe}
                onChange={(e) => handleGlobalTimeframeChange(e.target.value as Timeframe)}
                className="bg-[#1E222D] border border-[#2A2A4A] text-[#D1D4DC] text-sm px-3 py-1.5 rounded focus:outline-none focus:ring-1 focus:ring-[#2962FF]"
              >
                {TIMEFRAMES.map(tf => <option key={tf.value} value={tf.value}>{tf.label}</option>)}
              </select>
            )}
          </div>

          {/* Market status global */}
          <div className="flex items-center gap-3 ml-auto border-l border-[#1E222D] pl-4">
            <div className="flex items-center gap-1">
              <span className={`w-2 h-2 rounded-full ${marketStatus.us === 'Live' ? 'bg-[#089981]' : 'bg-[#F23645]'}`} />
              <span className={`text-xs font-medium ${marketStatus.us === 'Live' ? 'text-[#089981]' : 'text-[#F23645]'}`}>
                US: {marketStatus.us}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Grid de gráficos */}
      <main className="p-2 flex-1 min-h-0 overflow-hidden">
        <div
          className="h-full grid gap-2 trading-grid"
          style={{
            gridTemplateColumns: `repeat(${maximizedPanelId !== null ? 1 : gridConfig.cols}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${maximizedPanelId !== null ? 1 : gridConfig.rows}, minmax(0, 1fr))`,
          }}
        >
          {maximizedPanelId !== null
            ? panels
                .filter(p => p.id === maximizedPanelId)
                .map(panel => (
                  <ChartPanel
                    key={panel.id}
                    config={panel}
                    isMaximized
                    onMaximize={() => handleMaximize(panel.id)}
                    onSymbolChange={(symbol) => handleSymbolChange(panel.id, symbol)}
                    onTimeframeChange={(tf) => handleTimeframeChange(panel.id, tf)}
                    onMarketChange={(market) => handleMarketChange(panel.id, market)}
                    onIndicatorToggle={(ind, val) => handleIndicatorToggle(panel.id, ind, val)}
                    style={{ minWidth: 0, minHeight: 0 }}
                  />
                ))
            : panels.slice(0, gridLayout).map((panel) => (
                <ChartPanel
                  key={panel.id}
                  config={panel}
                  isMaximized={false}
                  onMaximize={() => handleMaximize(panel.id)}
                  onSymbolChange={(symbol) => handleSymbolChange(panel.id, symbol)}
                  onTimeframeChange={(tf) => handleTimeframeChange(panel.id, tf)}
                  onMarketChange={(market) => handleMarketChange(panel.id, market)}
                  onIndicatorToggle={(ind, val) => handleIndicatorToggle(panel.id, ind, val)}
                  style={{ minWidth: 0, minHeight: 0 }}
                />
              ))}
        </div>
      </main>

      {/* Footer con info */}
      <footer className="border-t border-[#1E222D] px-4 py-2 text-xs text-[#787B86] text-center">
        Elitos Trading Terminal — Datos: Yahoo Finance (US Stocks) —
        <a href="https://github.com/tradingview/lightweight-charts" target="_blank" rel="noopener" className="text-[#2962FF] hover:underline mx-1">
          Lightweight Charts
        </a>
      </footer>
    </div>
  );
}