"""Cálculo de indicadores técnicos (implementado manualmente con numpy/pandas)."""
from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd


def rsi(close: pd.Series, period: int = 14) -> pd.Series:
    """Relative Strength Index."""
    delta = close.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
    avg_loss = loss.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    rsi = 100 - (100 / (1 + rs))
    return rsi.fillna(50)


def macd(
    close: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9
) -> pd.DataFrame:
    """MACD con línea de señal e histograma."""
    ema_fast = close.ewm(span=fast, adjust=False).mean()
    ema_slow = close.ewm(span=slow, adjust=False).mean()
    macd_line = ema_fast - ema_slow
    signal_line = macd_line.ewm(span=signal, adjust=False).mean()
    histogram = macd_line - signal_line
    return pd.DataFrame({"macd": macd_line, "signal": signal_line, "hist": histogram})


def bollinger(close: pd.Series, period: int = 20, std_dev: float = 2.0) -> pd.DataFrame:
    """Bandas de Bollinger."""
    mid = close.rolling(period).mean()
    std = close.rolling(period).std()
    return pd.DataFrame({"upper": mid + std_dev * std, "mid": mid, "lower": mid - std_dev * std})


def vwap(high: pd.Series, low: pd.Series, close: pd.Series, volume: pd.Series) -> pd.Series:
    """VWAP acumulado por sesión (resetea a lo largo de la serie dada)."""
    tp = (high + low + close) / 3
    cum_vol = volume.cumsum()
    cum_pv = (tp * volume).cumsum()
    result = np.where(cum_vol > 0, cum_pv / cum_vol.replace(0, np.nan), np.nan)
    return pd.Series(result, index=close.index)


def williams_r(high: pd.Series, low: pd.Series, close: pd.Series, period: int = 14) -> pd.Series:
    """Williams %R."""
    hh = high.rolling(period).max()
    ll = low.rolling(period).min()
    return ((hh - close) / (hh - ll).replace(0, np.nan)) * -100


def ema(close: pd.Series, period: int = 21) -> pd.Series:
    """Exponential Moving Average."""
    return close.ewm(span=period, adjust=False).mean()


def sma(close: pd.Series, period: int = 50) -> pd.Series:
    """Simple Moving Average."""
    return close.rolling(period).mean()


def atr(high: pd.Series, low: pd.Series, close: pd.Series, period: int = 14) -> pd.Series:
    """Average True Range (Wilder)."""
    prev_close = close.shift()
    tr = pd.concat(
        [high - low, (high - prev_close).abs(), (low - prev_close).abs()], axis=1
    ).max(axis=1)
    return tr.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()


def supertrend(
    high: pd.Series, low: pd.Series, close: pd.Series, period: int = 10, multiplier: float = 3.0
) -> pd.DataFrame:
    """Supertrend (estilo TradingView).

    Devuelve dos series: `lower` = valor del supertrend cuando hay uptrend
    (verde) y `upper` = valor cuando hay downtrend (rojo). Los tramos no
    activos son NaN.
    """
    atr_v = atr(high, low, close, period)
    hl2 = (high + low) / 2
    upper = hl2 + multiplier * atr_v
    lower = hl2 - multiplier * atr_v

    n = len(close)
    fub = upper.to_numpy(dtype=float).copy()
    flb = lower.to_numpy(dtype=float).copy()
    trend_up = np.ones(n, dtype=bool)
    st = np.full(n, np.nan)

    for i in range(1, n):
        if fub[i] < fub[i - 1] or close.iloc[i - 1] > fub[i - 1]:
            fub[i] = fub[i - 1]
        if flb[i] > flb[i - 1] or close.iloc[i - 1] < flb[i - 1]:
            flb[i] = flb[i - 1]

        if trend_up[i - 1]:
            st[i] = flb[i]
            if close.iloc[i] < st[i]:
                trend_up[i] = False
                st[i] = fub[i]
        else:
            st[i] = fub[i]
            if close.iloc[i] > st[i]:
                trend_up[i] = True
                st[i] = flb[i]

    trend_up = trend_up.copy()
    trend_up[0] = True
    upper_out = np.where(trend_up, np.nan, st)
    lower_out = np.where(trend_up, st, np.nan)
    return pd.DataFrame({"upper": upper_out, "lower": lower_out}, index=close.index)


def donchian(high: pd.Series, low: pd.Series, period: int = 20) -> pd.DataFrame:
    """Canales de Donchian."""
    upper = high.rolling(period).max()
    lower = low.rolling(period).min()
    mid = (upper + lower) / 2
    return pd.DataFrame({"upper": upper, "mid": mid, "lower": lower})


def volume_profile(df: pd.DataFrame, bins: int = 24) -> dict[str, Any]:
    """Perfil de volumen calculado sobre una ventana de datos.

    Devuelve POC, VAH y VAL además de los buckets para pintar el histograma.
    Los activos se agrupan en `bins` intervalos de precio.
    """
    if df.empty:
        return {"poc": None, "vah": None, "val": None, "max_vol": 0, "bins": [], "avg_price": None}

    prices = df["close"].to_numpy(dtype=float)
    volumes = df["volume"].fillna(0).to_numpy(dtype=float)
    lo = float(np.nanmin(prices))
    hi = float(np.nanmax(prices))
    if not (hi > lo) or not np.isfinite(lo + hi):
        return {"poc": None, "vah": None, "val": None, "max_vol": 0, "bins": [], "avg_price": None}

    edges = np.linspace(lo, hi, bins + 1)
    idx = np.clip(np.digitize(prices, edges) - 1, 0, bins - 1)
    vol_per_bin = np.zeros(bins)
    np.add.at(vol_per_bin, idx, volumes)
    poc_bin = int(np.argmax(vol_per_bin))
    poc = float((edges[poc_bin] + edges[poc_bin + 1]) / 2)

    # VAH / VAL: 70% del volumen total alrededor del POC.
    total = float(vol_per_bin.sum())
    target = 0.70 * total if total > 0 else 0.0
    acc = 0.0
    lo_i = hi_i = poc_bin
    lower = upper = poc_bin
    while acc < target and (lo_i > 0 or hi_i < bins - 1):
        if lo_i > 0:
            lo_i -= 1
            if vol_per_bin[lo_i] > 0:
                acc += vol_per_bin[lo_i]
                lower = lo_i
        if hi_i < bins - 1:
            hi_i += 1
            if vol_per_bin[hi_i] > 0:
                acc += vol_per_bin[hi_i]
                upper = hi_i
    val = float((edges[lower] + edges[lower + 1]) / 2)
    vah = float((edges[upper] + edges[upper + 1]) / 2)

    bin_list = [
        {
            "price": float((edges[i] + edges[i + 1]) / 2),
            "volume": float(vol_per_bin[i]),
            "poc": i == poc_bin,
        }
        for i in range(bins)
    ]
    return {
        "poc": poc,
        "vah": vah,
        "val": val,
        "max_vol": float(vol_per_bin.max()),
        "bins": bin_list,
        "avg_price": float(np.nanmean(prices)),
    }


def fair_value_gaps(df: pd.DataFrame, min_gap: float | None = None) -> list[dict[str, Any]]:
    """Fair Value Gaps (FVG): imprediatencia de 3 velas donde el rango de la
    vela central no se solapa con las velas adyacentes.

    Devuelve una lista de cajas: {start, end, top, bottom, direction: 'bullish'|'bearish'}.
    """
    gaps: list[dict[str, Any]] = []
    if len(df) < 3:
        return gaps

    highs = df["high"].to_numpy(dtype=float)
    lows = df["low"].to_numpy(dtype=float)
    for i in range(1, len(df) - 1):
        prev_high, prev_low = highs[i - 1], lows[i - 1]
        cur_high, cur_low = highs[i], lows[i]
        next_low, next_high = lows[i + 1], highs[i + 1]

        # FVG alcista: el mínimo de la vela siguiente está sobre el máximo de la vela previa.
        if next_low > prev_high:
            bottom = prev_high
            top = next_low
            if min_gap is not None and (top - bottom) < min_gap:
                continue
            gaps.append(
                {
                    "start": int(df.index[i].value // 10**9),
                    "end": int(df.index[-1].value // 10**9),
                    "top": float(top),
                    "bottom": float(bottom),
                    "direction": "bullish",
                }
            )
        # FVG bajista: el máximo de la vela siguiente está bajo el mínimo de la vela previa.
        elif next_high < prev_low:
            top = prev_low
            bottom = next_high
            if min_gap is not None and (top - bottom) < min_gap:
                continue
            gaps.append(
                {
                    "start": int(df.index[i].value // 10**9),
                    "end": int(df.index[-1].value // 10**9),
                    "top": float(top),
                    "bottom": float(bottom),
                    "direction": "bearish",
                }
            )
    return gaps


def compute_all(df: pd.DataFrame) -> dict[str, Any]:
    """Calcula todos los indicadores y devuelve un dict con las series listas para JSON."""
    close = df["close"]
    high = df["high"]
    low = df["low"]
    vol = df["volume"].fillna(0)

    result: dict[str, Any] = {
        "times": [int(t.value // 10**9) for t in df.index],
        "close": [float(x) for x in close],
        "rsi": _series(rsi(close)),
        "macd": {k: _series(v) for k, v in macd(close).items()},
        "bollinger": {k: _series(v) for k, v in bollinger(close).items()},
        "vwap": _series(vwap(high, low, close, vol)),
        "williams": _series(williams_r(high, low, close)),
        "ema": _series(ema(close)),
        "sma": _series(sma(close)),
        "atr": _series(atr(high, low, close)),
        "supertrend": {k: _series(v) for k, v in supertrend(high, low, close).items()},
        "donchian": {k: _series(v) for k, v in donchian(high, low).items()},
        "volume_profile": volume_profile(df),
        "fvg": fair_value_gaps(df),
    }
    return result


def _series(s: pd.Series) -> list[float | None]:
    """Convierte una serie de pandas a lista JSON-safe (NaN -> None)."""
    if s is None or len(s) == 0:
        return []
    return [None if (pd.isna(x)) else float(x) for x in s]