"""
Crop suitability tester using Open-Meteo data.

Fetches historical + current weather for a given location, computes growing
degree days (GDD), frost risk, precipitation and temperature ranges, then
compares them against known crop requirements to decide whether a crop can
realistically be grown.

Open-Meteo is free for non-commercial use and needs no API key for these
endpoints. Docs: https://open-meteo.com/en/docs
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.parse
import urllib.request
from datetime import date, timedelta
from dataclasses import dataclass, field
from typing import Any

# --------------------------------------------------------------------------- #
# Crop requirement profiles
# --------------------------------------------------------------------------- #
# GDD uses a base temperature below which the crop does not develop. Topt is
# the optimal daily mean temp, Tmin/Tmax the lethal/tolerable bounds. GDD_total
# is the seasonal accumulated heat needed to reach maturity.


@dataclass
class Crop:
    name: str
    base_temp: float          # GDD base temp (°C)
    gdd_required: float       # accumulated GDD to maturity
    t_min: float              # absolute low it can survive (°C)
    t_opt_min: float          # ideal growing mean temp low
    t_opt_max: float          # ideal growing mean temp high
    frost_tolerant: bool
    precip_mm_per_month: float  # rough monthly water need


CROPS: dict[str, Crop] = {
    "maize": Crop("Maize (corn)", 10.0, 1300, -2, 18, 30, False, 80),
    "wheat": Crop("Winter wheat", 0.0, 1400, -25, 10, 24, True, 60),
    "potato": Crop("Potato", 7.0, 1200, -2, 10, 22, False, 70),
    "soybean": Crop("Soybean", 10.0, 1500, -1, 18, 32, False, 85),
    "tomato": Crop("Tomato", 10.0, 1100, 0, 16, 28, False, 60),
    "barley": Crop("Barley", 0.0, 1200, -20, 8, 22, True, 55),
    "rice": Crop("Rice", 10.0, 1600, 5, 20, 35, False, 130),
}


# --------------------------------------------------------------------------- #
# Open-Meteo client
# --------------------------------------------------------------------------- #

BASE = "https://archive-api.open-meteo.com/v1/archive"
FORECAST = "https://api.open-meteo.com/v1/forecast"


def _get_json(url: str) -> dict[str, Any]:
    with urllib.request.urlopen(url, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_historical(
    lat: float,
    lon: float,
    start: str,
    end: str,
    years: int = 10,
) -> dict[str, Any]:
    """Pull daily historical temp + precipitation for the last `years` years."""
    params = {
        "latitude": lat,
        "longitude": lon,
        "start_date": start,
        "end_date": end,
        "daily": "temperature_2m_max,temperature_2m_min,temperature_2m_mean,"
        "precipitation_sum",
        "timezone": "auto",
    }
    url = BASE + "?" + urllib.parse.urlencode(params)
    data = _get_json(url)
    daily = data.get("daily", {})
    return daily


def fetch_forecast(lat: float, lon: float, days: int = 14) -> dict[str, Any]:
    """Pull the upcoming forecast (to sanity-check the season ahead)."""
    params = {
        "latitude": lat,
        "longitude": lon,
        "forecast_days": days,
        "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum",
        "timezone": "auto",
    }
    url = FORECAST + "?" + urllib.parse.urlencode(params)
    return _get_json(url).get("daily", {})


# --------------------------------------------------------------------------- #
# Agronomy math
# --------------------------------------------------------------------------- #

def growing_degree_days(t_mean: list[float], base: float) -> list[float]:
    """Accumulate GDD: sum of max(0, Tmean - base) per day."""
    out: list[float] = []
    acc = 0.0
    for t in t_mean:
        acc += max(0.0, (t or 0.0) - base)
        out.append(acc)
    return out


def assess(crop: Crop, hist: dict[str, Any]) -> dict[str, Any]:
    """Return a structured suitability verdict from historical daily data."""
    t_max = hist.get("temperature_2m_max", [])
    t_min = hist.get("temperature_2m_min", [])
    t_mean = hist.get("temperature_2m_mean", [])
    precip = hist.get("precipitation_sum", [])
    dates = hist.get("time", [])

    if not t_mean:
        return {"error": "no historical data returned"}

    gdd = growing_degree_days(t_mean, crop.base_temp)
    final_gdd = gdd[-1]
    days = len(t_mean)
    years = max(1, days / 365.0)

    # Frost days: any day where min temp <= 0 (or <= crop.t_min for tender)
    lethal_threshold = crop.t_min
    frost_days = sum(1 for t in t_min if t is not None and t <= lethal_threshold)

    # Days outside optimal growing band
    too_hot = sum(1 for t in t_mean if t is not None and t > crop.t_opt_max)
    too_cold = sum(1 for t in t_mean if t is not None and t < crop.t_opt_min)

    avg_annual_precip = sum(p for p in precip if p is not None)
    monthly_precip = avg_annual_precip / years / 12.0

    # Per-year GDD (roughly) to see if a single season can reach maturity
    gdd_per_year = final_gdd / years

    result = {
        "crop": crop.name,
        "days_analysed": days,
        "years_analysed": round(years, 1),
        "total_gdd": round(final_gdd, 1),
        "gdd_per_year": round(gdd_per_year, 1),
        "gdd_required": crop.gdd_required,
        "frost_days_total": frost_days,
        "frost_days_per_year": round(frost_days / years, 1),
        "too_hot_days_per_year": round(too_hot / years, 1),
        "too_cold_days_per_year": round(too_cold / years, 1),
        "mean_monthly_precip_mm": round(monthly_precip, 1),
        "precip_needed_mm": crop.precip_mm_per_month,
        "avg_t_min": round(sum(t_min) / len(t_min), 1) if t_min else None,
        "avg_t_max": round(sum(t_max) / len(t_max), 1) if t_max else None,
    }

    # Verdict logic
    reasons: list[str] = []
    if gdd_per_year >= crop.gdd_required:
        reasons.append(f"sufficient heat (GDD {round(gdd_per_year)} >= {crop.gdd_required})")
    else:
        reasons.append(f"insufficient heat (GDD {round(gdd_per_year)} < {crop.gdd_required})")

    if crop.frost_tolerant:
        reasons.append("frost-tolerant: winter survival expected")
    elif frost_days / years > 1:
        reasons.append(f"frost risk ({round(frost_days / years, 1)} frost days/yr exceeds tender-crop tolerance)")
    else:
        reasons.append("low frost risk")

    if monthly_precip < crop.precip_mm_per_month * 0.5:
        reasons.append("precipitation too low (irrigation likely required)")
    elif monthly_precip > crop.precip_mm_per_month * 2.5:
        reasons.append("precipitation very high (drainage may be needed)")
    else:
        reasons.append("precipitation within workable range")

    viable = (
        gdd_per_year >= crop.gdd_required
        and (crop.frost_tolerant or frost_days / years <= 1)
        and monthly_precip >= crop.precip_mm_per_month * 0.5
    )
    result["viable"] = viable
    result["reasons"] = reasons
    return result


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #

def main() -> int:
    ap = argparse.ArgumentParser(description="Test crop viability from Open-Meteo data")
    ap.add_argument("--lat", type=float, default=51.5, help="Latitude (default 51.5)")
    ap.add_argument("--lon", type=float, default=-0.1, help="Longitude (default -0.1, London)")
    ap.add_argument("--crop", choices=sorted(CROPS), default="maize")
    ap.add_argument("--years", type=int, default=10, help="Historical years to analyse")
    ap.add_argument("--forecast", action="store_true", help="Also print near-term forecast")
    args = ap.parse_args()

    crop = CROPS[args.crop]

    today = date.today()
    start = today - timedelta(days=365 * args.years)
    end = today - timedelta(days=1)

    print(f"Fetching {args.years} years of daily data for "
          f"lat={args.lat}, lon={args.lon} ...")
    hist = fetch_historical(args.lat, args.lon, start.isoformat(), end.isoformat())
    if not hist.get("temperature_2m_mean"):
        print("No historical data returned. Check coordinates / network.", file=sys.stderr)
        return 1

    result = assess(crop, hist)
    print(json.dumps(result, indent=2))

    if args.forecast:
        fc = fetch_forecast(args.lat, args.lon)
        if fc:
            print("\nNear-term forecast (next 14 days):")
            for d, tmax, tmin, p in zip(
                fc.get("time", []),
                fc.get("temperature_2m_max", []),
                fc.get("temperature_2m_min", []),
                fc.get("precipitation_sum", []),
            ):
                print(f"  {d}: {tmin}..{tmax}°C  precip {p}mm")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
