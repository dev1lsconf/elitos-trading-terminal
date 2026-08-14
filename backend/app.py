"""Servidor Flask de Elitos: API REST + WebSocket de datos de mercado.

Ejecución:  python app.py   ->  localhost:5000
En producción: sirve el build estático del frontend desde dist/
"""
from __future__ import annotations

import asyncio
import logging
import math
import os
from pathlib import Path

import numpy as np
import pandas as pd
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

import data_sources as ds
import indicators as ind

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger("elitos")

# Directorio del build del frontend (para producción)
DIST_DIR = Path(__file__).parent.parent / "dist"

app = Flask(__name__, static_folder=DIST_DIR if DIST_DIR.exists() else None)
# CORS: en producción restringe a tu dominio, en desarrollo permite todo
if os.environ.get("FLASK_ENV") == "production":
    CORS(app, origins=os.environ.get("CORS_ORIGINS", "").split(","))
else:
    CORS(app)  # dev: permite localhost:5001, etc.


def _frame(raw: list[dict]) -> pd.DataFrame:
    """Convierte la lista de velas en DataFrame indexado por timestamp (UTC)."""
    df = pd.DataFrame(raw)
    if df.empty:
        return df
    df["time"] = pd.to_datetime(df["time"], unit="s", utc=True)
    df = df.set_index("time").sort_index()
    for col in ("open", "high", "low", "close", "volume"):
        df[col] = pd.to_numeric(df[col], errors="coerce")
    return df[~df["close"].isna()]


@app.get("/api/stocks")
def api_stocks() -> tuple[dict, int]:
    """Datos historicos + indicadores para un ticker de EE. UU."""
    symbol = request.args.get("symbol", "AAPL").strip().upper()
    interval = request.args.get("interval", "1d")
    raw = ds.get_us_history(symbol, interval)
    if not raw:
        return jsonify({"error": f"No se encontraron datos para {symbol}"}), 404
    raw = _resample_4h(raw, interval)
    return jsonify(build_payload(raw))


@app.get("/api/crypto")
def api_crypto() -> tuple[dict, int]:
    """Datos historicos + indicadores para un par de Hyperliquid."""
    symbol = request.args.get("symbol", "BTC").strip()
    interval = request.args.get("interval", "1m")
    raw = ds.get_crypto_klines(symbol, interval)
    if not raw:
        return jsonify({"error": f"No se encontraron datos para {symbol}"}), 404
    return jsonify(build_payload(raw))


@app.get("/api/crypto/live")
def api_crypto_live() -> tuple[dict, int]:
    """Ultima vela en tiempo real de Hyperliquid (para el indicador Live/Closed)."""
    loop = asyncio.new_event_loop()
    try:
        recs = loop.run_until_complete(ds.HYPER.latest())
    finally:
        loop.close()
    if not recs:
        return jsonify({"live": False, "price": None}), 200
    rec = recs[-1]
    return jsonify({"live": True, "price": rec["close"], "time": rec["time"]})


@app.get("/api/market-status")
def api_market_status() -> tuple[dict, int]:
    """Estado de mercado: crypto siempre 'Live', bolsas segun horario ET."""
    return jsonify({"crypto": "Live", "us": "Live" if ds.is_us_market_open() else "Closed"})


def _resample_4h(raw: list[dict], interval: str) -> list[dict]:
    """Re-muestrea 1h -> 4h para polígonos sin intervalo nativo de 4h en yfinance."""
    if interval != "4h":
        return raw
    df = _frame(raw).resample("4h").agg(
        {"open": "first", "high": "max", "low": "min", "close": "last", "volume": "sum"}
    ).dropna()
    out: list[dict] = []
    for ts, row in df.iterrows():
        out.append(
            {
                "time": int(ts.timestamp()),
                "open": float(row["open"]),
                "high": float(row["high"]),
                "low": float(row["low"]),
                "close": float(row["close"]),
                "volume": float(row["volume"]),
            }
        )
    return out


def build_payload(raw: list[dict]) -> dict:
    """Devuelve velas + indicadores listos para la UI."""
    df = _frame(raw)
    times = [int(t.value // 10**9) for t in df.index]
    candles = [
        {
            "time": times[i],
            "open": float(df["open"].iloc[i]),
            "high": float(df["high"].iloc[i]),
            "low": float(df["low"].iloc[i]),
            "close": float(df["close"].iloc[i]),
            "volume": float(df["volume"].fillna(0).iloc[i]),
        }
        for i in range(len(df))
    ]
    payload: dict = {
        "candles": candles,
    }
    try:
        payload["indicators"] = ind.compute_all(df)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Indicadores fallaron: %s", exc)
        payload["indicators"] = {
            "times": times,
            "close": [float(x) for x in df["close"]],
            "rsi": [],
            "macd": {"positive": [], "negative": [], "hist": []},
            "bollinger": {"upper": [], "mid": [], "lower": []},
            "vwap": [],
            "williams": [],
            "volume_profile": ind.volume_profile(df),
            "fvg": [],
        } if not df.empty else {}
    return payload


# ============================================================
# Servir frontend estático en producción (cuando existe dist/)
# ============================================================
if DIST_DIR.exists():
    @app.route("/", defaults={"path": ""})
    @app.route("/<path:path>")
    def serve_frontend(path: str):
        """Sirve index.html para todas las rutas no-API (SPA fallback)."""
        if path.startswith("api/"):
            return jsonify({"error": "Not found"}), 404
        target = DIST_DIR / path
        if target.exists() and target.is_file():
            return send_from_directory(DIST_DIR, path)
        # SPA fallback: index.html para rutas de la app
        return send_from_directory(DIST_DIR, "index.html")


if __name__ == "__main__":
    logger.info("Elitos corriendo en http://localhost:5000")
    app.run(host="0.0.0.0", port=5000, debug=False, threaded=True)