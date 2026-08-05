// Tipos compartidos para la aplicación de trading

export type MarketType = 'stocks' | 'crypto';
export type Timeframe = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w' | '1M';
export type GridLayout = 1 | 2 | 4 | 6 | 8;

export interface Candle {
  time: number;      // Unix timestamp (seconds)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ChartIndicators {
  times: number[];
  close: number[];
  rsi: (number | null)[];
  macd: {
    macd: (number | null)[];
    signal: (number | null)[];
    hist: (number | null)[];
  };
  bollinger: {
    upper: (number | null)[];
    mid: (number | null)[];
    lower: (number | null)[];
  };
  vwap: (number | null)[];
  williams: (number | null)[];
  volume_profile: VolumeProfileData;
  fvg: FVGBox[];
}

export interface VolumeProfileData {
  poc: number | null;
  vah: number | null;
  val: number | null;
  max_vol: number;
  bins: { price: number; volume: number; poc: boolean }[];
  avg_price: number | null;
}

export interface FVGBox {
  start: number;
  end: number;
  top: number;
  bottom: number;
  direction: 'bullish' | 'bearish';
}

export interface PanelConfig {
  id: string;
  market: MarketType;
  symbol: string;
  timeframe: Timeframe;
  indicators: {
    rsi: boolean;
    macd: boolean;
    volume: boolean;
    bollinger: boolean;
    vwap: boolean;
    williams: boolean;
    volumeProfile: boolean;
    fvg: boolean;
  };
}

export interface MarketStatus {
  crypto: 'Live' | 'Closed';
  us: 'Live' | 'Closed';
}

export interface APIResponse {
  candles: Candle[];
  indicators?: ChartIndicators;
  error?: string;
}

// Tickers comunes para autocompletado
export const COMMON_CRYPTO: string[] = [
  'BTC', 'ETH', 'SOL', 'AVAX', 'BNB', 'XRP', 'DOGE', 'ADA', 'DOT', 'LINK',
  'MATIC', 'ARB', 'OP', 'APT', 'SUI', 'NEAR', 'ATOM', 'LTC', 'BCH', 'ETC',
];

export const COMMON_STOCKS: string[] = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'NVDA', 'JPM', 'V', 'UNH',
  'HD', 'MA', 'PG', 'DIS', 'NFLX', 'AMD', 'INTC', 'CRM', 'PYPL', 'ADBE',
];

export const TIMEFRAMES: { value: Timeframe; label: string }[] = [
  { value: '1m', label: '1m' },
  { value: '5m', label: '5m' },
  { value: '15m', label: '15m' },
  { value: '30m', label: '30m' },
  { value: '1h', label: '1h' },
  { value: '4h', label: '4h' },
  { value: '1d', label: '1D' },
  { value: '1w', label: '1W' },
  { value: '1M', label: '1M' },
];

export const GRID_OPTIONS: { value: GridLayout; label: string; cols: number; rows: number }[] = [
  { value: 1, label: '1', cols: 1, rows: 1 },
  { value: 2, label: '2', cols: 2, rows: 1 },
  { value: 4, label: '4', cols: 2, rows: 2 },
  { value: 6, label: '6', cols: 3, rows: 2 },
  { value: 8, label: '8', cols: 4, rows: 2 },
];

export const DEFAULT_PANEL_CONFIG: Omit<PanelConfig, 'id'> = {
  market: 'stocks',
  symbol: 'AAPL',
  timeframe: '1d',
  indicators: {
    rsi: false,
    macd: false,
    volume: true,
    bollinger: false,
    vwap: false,
    williams: false,
    volumeProfile: false,
    fvg: false,
  },
};