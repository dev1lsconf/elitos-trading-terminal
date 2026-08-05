"""Fuentes de datos.

-	Crypto: WebSocket de Hyperliquid (tiempo real, sin API keys).
-	US Stocks: yfinance (Yahoo Finance).
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

import yfinance as yf

logger = logging.getLogger("elitos")

# Intervalos soportados: clave (intencion de cadencia) -> parametros yfinance/Hyperliquid.
CRYPTO_INTERVALS: dict[str, str] = {
    "1m": "1m",
    "5m": "5m",
    "15m": "15m",
    "30m": "30m",
    "1h": "1h",
    "4h": "4h",
    "1d": "1d",
    "1w": "1w",
    "1M": "1mo",
}
US_INTERVALS: dict[str, tuple[str, str]] = {
    "1m": ("1m", "1d"),
    "5m": ("5m", "5d"),
    "15m": ("15m", "5d"),
    "30m": ("30m", "5d"),
    "1h": ("1h", "1mo"),
    "4h": ("1h", "1mo"),  # se re-muestrea a 4h
    "1d": ("1d", "3mo"),
    "1w": ("1wk", "6mo"),
    "1M": ("1mo", "2y"),
}


def normalize_crypto_symbol(symbol: str) -> str:
    """Convierte un ticker legible (BTC, BTC-USD) al formato de Hyperliquid (BTC)."""
    s = symbol.strip().upper().replace("USDT", "").replace("USD", "").replace("PERP", "")
    return s


class HyperliquidFeed:
    """Cliente WebSocket no bloqueante para velas de Hyperliquid (Fija a '1m')."""

    WS_URL = "wss://api.hyperliquid.xyz/ws"
    BASE_REST = "https://api.hyperliquid.xyz/info"

    def __init__(self) -> None:
        self._cache: dict[str, list[dict[str, Any]]] = {}
        self._task: asyncio.Task | None = None

    async def _ensure(self) -> None:
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._run())

    async def _run(self) -> None:
        import websockets

        while True:
            try:
                async with websockets.connect(self.WS_URL, max_size=10**7) as ws:
                    await ws.send(
                        '{"method":"subscribe","subscription":{"type":"candle","coin":"BTC","interval":"1m"}}'
                    )
                    async for raw in ws:
                        import json

                        try:
                            msg = json.loads(raw)
                        except Exception:
                            continue
                        if msg.get("channel") != "candle":
                            continue
                        data = msg.get("data", {})
                        candle = data.get("c", [])
                        if len(candle) < 8:
                            continue
                        ts = candle[0]
                        rec = {
                            "time": ts,
                            "open": float(candle[1]),
                            "close": float(candle[2]),
                            "high": float(candle[3]),
                            "low": float(candle[4]),
                            "volume": float(candle[5]),
                            "turnover": float(candle[6]),
                        }
                        coin = data.get("s", "BTC")
                        self._cache.setdefault(coin, []).append(rec)
                        self._cache[coin] = self._cache[coin][-2000:]
            except Exception as exc:  # noqa: BLE001
                logger.warning("Hyperliquid WS caido: %s", exc)
                await asyncio.sleep(3)

    async def latest(self, timeout: float = 5.0) -> list[dict[str, Any]]:
        """Espera a recibir al menos una vela y devuelve la más reciente."""
        await self._ensure()
        for _ in range(int(timeout * 4)):
            if self._cache:
                break
            await asyncio.sleep(0.25)
        return list(self._cache.get("BTC", [])[-1:])  # type: ignore[list-item]


# Instancia global de Hyperliquid.
HYPER = HyperliquidFeed()


def get_crypto_klines(symbol: str, interval: str = "1m", limit: int = 500) -> list[dict[str, Any]] | None:
    """Obtiene velas históricas de Hyperliquid vía REST (endpoint candlesSnapshot)."""
    import json
    import time
    import urllib.request

    coin = normalize_crypto_symbol(symbol)
    hl_interval = CRYPTO_INTERVALS.get(interval, "1m")
    # Hyperliquid necesita startTime en milisegundos.  limit dias aprox hacia atras.
    now_ms = int(time.time() * 1000)
    # 1m * limit -> startTime aproximado
    interval_ms = {"1m": 60_000, "5m": 300_000, "15m": 900_000, "30m": 1_800_000,
                   "1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000, "1w": 604_800_000, "1mo": 2_592_000_000}
    start_ms = now_ms - interval_ms.get(hl_interval, 60_000) * (limit + 10)
    payload = json.dumps({"type": "candleSnapshot", "req": {"coin": coin, "interval": hl_interval, "startTime": start_ms}}).encode()
    req = urllib.request.Request(
        HYPER.BASE_REST, data=payload, headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
    except Exception as exc:  # noqa: BLE001
        logger.warning("Hyperliquid REST fallo para %s: %s", coin, exc)
        return None

    if not isinstance(data, list):
        logger.warning("Respuesta inesperada de Hyperliquid: %s", data)
        return None
    out: list[dict[str, Any]] = []
    for c in data[-limit:]:
        out.append(
            {
                "time": c["t"] // 1000,  # convertir ms a segundos
                "open": float(c["o"]),
                "high": float(c["h"]),
                "low": float(c["l"]),
                "close": float(c["c"]),
                "volume": float(c["v"]),
            }
        )
    return out


def get_us_history(symbol: str, interval: str = "1d") -> list[dict[str, Any]]:
    """Extrae datos históricos de Yahoo Finance para un ticker de bolsa de EE. UU."""
    intv, period = US_INTERVALS.get(interval, ("1d", "3mo"))
    ticker = yf.Ticker(symbol.strip().upper())
    df = ticker.history(period=period, interval=intv, auto_adjust=True, prepost=False)
    out: list[dict[str, Any]] = []
    for ts, row in df.iterrows():
        try:
            t = int(ts.timestamp())
        except Exception:
            t = int(ts[0].timestamp()) if hasattr(ts, "__getitem__") else 0
        out.append(
            {
                "time": t,
                "open": float(row["Open"]),
                "high": float(row["High"]),
                "low": float(row["Low"]),
                "close": float(row["Close"]),
                "volume": float(row["Volume"]) if not pd_isna(row["Volume"]) else 0.0,
            }
        )
    return out


def is_us_market_open() -> bool:
    """Determina si el mercado de EE. UU. (NYSE/NASDAQ) está abierto (9:30-16:00 ET, lun-vie)."""
    import datetime as _dt

    now = _dt.datetime.now(_dt.timezone(_dt.timedelta(hours=-4)))
    if now.weekday() >= 5:
        return False
    open_t = now.replace(hour=9, minute=30, second=0, microsecond=0)
    close_t = now.replace(hour=16, minute=0, second=0, microsecond=0)
    return open_t <= now <= close_t


def pd_isna(value: Any) -> bool:
    """Chequeo isna sin depender del contexto de pandas (recibe numero o float nan)."""
    try:
        import math

        return math.isnan(float(value))
    except Exception:
        return value is None