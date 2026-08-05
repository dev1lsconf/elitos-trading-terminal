// Servicio API para comunicación con el backend Flask

const API_BASE = '/api';

export interface PanelData {
  candles: Array<{
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>;
  indicators?: {
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
    volume_profile: {
      poc: number | null;
      vah: number | null;
      val: number | null;
      max_vol: number;
      bins: { price: number; volume: number; poc: boolean }[];
      avg_price: number | null;
    };
    fvg: Array<{
      start: number;
      end: number;
      top: number;
      bottom: number;
      direction: 'bullish' | 'bearish';
    }>;
  };
}

export async function fetchCrypto(symbol: string, interval: string, limit = 500): Promise<PanelData> {
  const res = await fetch(`${API_BASE}/crypto?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${limit}`);
  return res.json();
}

export async function fetchStocks(symbol: string, interval: string): Promise<PanelData> {
  const res = await fetch(`${API_BASE}/stocks?symbol=${encodeURIComponent(symbol)}&interval=${interval}`);
  return res.json();
}

export async function fetchMarketStatus(): Promise<{ crypto: 'Live' | 'Closed'; us: 'Live' | 'Closed' }> {
  const res = await fetch(`${API_BASE}/market-status`);
  return res.json();
}

export async function fetchCryptoLive(): Promise<{ live: boolean; price: number | null; time: number }> {
  const res = await fetch(`${API_BASE}/crypto/live`);
  return res.json();
}

export function getSymbolSuggestions(market: 'crypto' | 'stocks', query: string): string[] {
  const all = market === 'crypto' ? COMMON_CRYPTO : COMMON_STOCKS;
  const q = query.toUpperCase();
  return all.filter(s => s.includes(q)).slice(0, 10);
}

// Constantes locales para autocompletado (evita import circular)
const COMMON_CRYPTO = [
  'BTC', 'ETH', 'SOL', 'AVAX', 'BNB', 'XRP', 'DOGE', 'ADA', 'DOT', 'LINK',
  'MATIC', 'ARB', 'OP', 'APT', 'SUI', 'NEAR', 'ATOM', 'LTC', 'BCH', 'ETC',
];

const COMMON_STOCKS = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'NVDA', 'JPM', 'V', 'UNH',
  'HD', 'MA', 'PG', 'DIS', 'NFLX', 'AMD', 'INTC', 'CRM', 'PYPL', 'ADBE',
];