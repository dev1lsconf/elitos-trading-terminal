# Elitos Trading Terminal

Terminal de trading visual estilo cyberpunk/minimalista construida con **Next.js 14 (Vite + React 19)**, **lightweight-charts v5** y backend **Flask + pandas/numpy**.

## Características

### 📊 Gráficos
- **Serie principal**: Línea continua de **% cambio** (modo "compare") respecto a la primera vela del dataset — sin huecos entre velas
- **Volumen**: Histograma inferior con escala propia (toggle ON/OFF)
- **Overlays de precio** (5, convertidos a % con la misma base):
  - **EMA (21)** — amarillo `#FFEB3B`
  - **SMA (50)** — naranja `#FF6D00`
  - **ATR (14)** — verde neón `#00E676`
  - **Supertrend (10,3)** — verde `#089981` (uptrend) / rojo `#F23645` (downtrend)
  - **Donchian (20)** — gris `#787B86` (upper/mid/lower)
- **Indicadores en sub-panes**: RSI, MACD, Williams %R
- **Volume Profile**: POC/VAH/VAL + histograma horizontal
- **Fair Value Gaps (FVG)**: Cajas + marcadores

### ⚙️ Funcionalidad
- Multi-panel: grids 1/2/4/6/8, responsive (mobile 1 columna)
- Maximizar panel (doble clic o botón), restaura con Esc
- Timeframes: 1m, 5m, 15m, 30m, 1h, 4h, 1d, 1w, 1M
- Mercados: US Stocks (yfinance) / Crypto (Hyperliquid WS+REST)
- Badge de mercado Live/Closed (actualizado cada 30s)
- Precio en vivo en header (stocks: última vela; crypto: WS)
- Zoom automático por ancho de panel (`DEFAULT_BAR_SPACING = 9`)
- Refresh cada 10s (background, preserva zoom del usuario)
- Estado persistente: último precio, timestamp "Últ. act."

### 🎨 Estética
- Tema oscuro cyberpunk (`#131722` fondo, `#26C6DA` cyan acento)
- Tipografía Inter variable
- Scrollbars, crosshair, grid sutiles

## Captura

![Elitos Trading Panel](docs/screenshot-panel.png)

*Panel con EMA, SMA, Supertrend y Donchian activos sobre la línea de % cambio (AAPL 1d).*

## Stack

| Capa | Tech |
|------|------|
| Frontend | React 19, Vite, TypeScript, Tailwind CSS 4 |
| Charts | lightweight-charts v5 (ESM) |
| Backend | Flask, pandas, numpy, yfinance, Hyperliquid WS/REST |
| Dev | Playwright (E2E), Vitest-ready |

## Inicio rápido

```bash
# Backend (puerto 5000)
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
python app.py

# Frontend (puerto 5001)
cd ..
npm install
npm run dev
```

Abre `http://localhost:5001`.

## Estructura

```
├── backend/
│   ├── app.py              # Flask API (/api/stocks, /api/crypto, /api/market-status)
│   ├── indicators.py       # RSI, MACD, Bollinger, VWAP, EMA, SMA, ATR, Supertrend, Donchian, VP, FVG
│   └── data_sources.py     # yfinance (stocks) + Hyperliquid WS/REST (crypto)
├── src/
│   ├── components/
│   │   ├── ChartPanel.tsx  # Panel principal (lightweight-charts v5, compare mode)
│   │   ├── FVGPrimitive.ts # Canvas primitive para cajas FVG
│   │   └── VolumeProfilePrimitive.ts
│   ├── services/api.ts     # Fetch wrappers
│   ├── types.ts            # Tipos compartidos (PanelConfig, ChartIndicators, etc.)
│   └── App.tsx             # Grid, estado global, routing de paneles
├── verify-final.mjs        # Suite E2E Playwright (58 tests)
└── package.json
```

## Tests E2E

```bash
npm run dev      # frontend en 5001
python backend/app.py  # backend en 5000
node verify-final.mjs    # 58 tests Playwright (headless Edge)
```

Cubre: grid/layout, zoom, overlays, indicadores, refresh, maximizar, mobile, right-margin, header price.

## Licencia

MIT — libre para uso personal y comercial.