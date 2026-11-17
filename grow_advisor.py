"""
Grow Advisor — pass a crop + location, get an LLM verdict on whether it's
viable to grow there.

Pipeline:
  1. Load crop requirements from sa_crops.json
  2. (Optional) geocode a place name -> lat/lon via Open-Meteo
  3. Fetch historical daily weather from Open-Meteo
  4. Compute agronomic metrics (GDD, frost days, precip, temperature)
  5. Send the crop + climate summary to DeepSeek via litellm for a verdict

Usage:
  python3 grow_advisor.py --crop maize --location "Bloemfontein"
  python3 grow_advisor.py --crop rooibos --lat -32.35 --lon 19.05
  python3 grow_advisor.py --crop sugarcane --location "Durban" --years 15
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import date, timedelta
from typing import Any

from dotenv import load_dotenv
import litellm

from crop_suitability import fetch_historical, growing_degree_days

load_dotenv()

CROPS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sa_crops.json")

GEOCODE = "https://geocoding-api.open-meteo.com/v1/search"


# --------------------------------------------------------------------------- #
# Geocoding (name -> lat/lon)
# --------------------------------------------------------------------------- #

def geocode(name: str) -> tuple[float, float, str]:
    params = {"name": name, "count": 1, "language": "en", "format": "json"}
    url = GEOCODE + "?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=30) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    results = data.get("results") or []
    if not results:
        raise SystemExit(f"Could not geocode '{name}'.")
    r = results[0]
    label = f"{r.get('name')}, {r.get('admin1') or ''}, {r.get('country') or ''}".strip(", ")
    return r["latitude"], r["longitude"], label


# --------------------------------------------------------------------------- #
# Climate summary
# --------------------------------------------------------------------------- #

def summarize(crop: dict[str, Any], hist: dict[str, Any]) -> dict[str, Any]:
    t_max = hist.get("temperature_2m_max", [])
    t_min = hist.get("temperature_2m_min", [])
    t_mean = hist.get("temperature_2m_mean", [])
    precip = hist.get("precipitation_sum", [])

    base = crop["base_temp"]
    gdd = growing_degree_days(t_mean, base)
    days = len(t_mean)
    years = max(1.0, days / 365.0)

    frost_days = sum(1 for t in t_min if t is not None and t <= crop["t_min"])
    too_hot = sum(1 for t in t_mean if t is not None and t > crop["t_opt_max"])
    too_cold = sum(1 for t in t_mean if t is not None and t < crop["t_opt_min"])
    annual_precip = sum(p for p in precip if p is not None) / years

    return {
        "location_days_analysed": days,
        "years": round(years, 1),
        "gdd_available_per_year": round(gdd[-1] / years, 0),
        "gdd_required": crop["gdd_required"],
        "gdd_shortfall_surplus": round(gdd[-1] / years - crop["gdd_required"], 0),
        "frost_days_per_year": round(frost_days / years, 1),
        "days_below_opt_temp_per_year": round(too_cold / years, 1),
        "days_above_opt_temp_per_year": round(too_hot / years, 1),
        "annual_precip_mm": round(annual_precip, 0),
        "crop_precip_need_mm_per_year": crop["precip_mm_per_month"] * 12,
        "mean_annual_tmax": round(sum(t_max) / len(t_max), 1) if t_max else None,
        "mean_annual_tmin": round(sum(t_min) / len(t_min), 1) if t_min else None,
    }


# --------------------------------------------------------------------------- #
# LLM call
# --------------------------------------------------------------------------- #

SYSTEM = (
    "You are an expert agronomist specialising in South African crop production. "
    "Given a crop's growing requirements and a location's measured historical "
    "climate, give a clear, practical verdict on whether the crop can be grown "
    "profitably there. Be honest about risks. Do not invent data. Answer in plain "
    "language with a short structure."
)

USER_TEMPLATE = """Assess whether {crop_name} can be grown at the location below.

## Crop requirements
{base_temp}°C growing-degree-day base, needs {gdd_required} GDD to maturity.
Optimal mean temperature {t_opt_min}–{t_opt_max}°C, lethal below {t_min}°C.
Frost tolerant: {frost_tolerant}. Water need ~{precip_need} mm/year.

## Measured climate at the location ({years} years of daily data)
- Growing degree days available per year: {gdd_avail} (crop needs {gdd_required})
- Frost days per year: {frost_days}
- Days below optimal temperature: {cold_days} / year
- Days above optimal temperature: {hot_days} / year
- Annual precipitation: {precip} mm (crop needs ~{precip_need})
- Mean annual max/min: {tmax}°C / {tmin}°C

## Crop notes
{notes}

Answer with:
1. **Verdict**: SUITABLE / MARGINAL / NOT SUITABLE
2. **Confidence**: low/medium/high
3. **Why** (2–4 bullet points grounded in the numbers above)
4. **Main risks** (if any)
5. **Recommendations** (irrigation, cultivar choice, planting window, etc.)
"""


def ask_deepseek(prompt: str, model: str, temperature: float) -> str:
    resp = litellm.completion(
        model=model,
        messages=[
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": prompt},
        ],
        temperature=temperature,
    )
    return resp.choices[0].message.content


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #

def main() -> int:
    ap = argparse.ArgumentParser(description="LLM crop-suitability advisor (DeepSeek)")
    loc = ap.add_mutually_exclusive_group(required=True)
    loc.add_argument("--location", help="Place name, e.g. 'Bloemfontein'")
    loc.add_argument("--lat", type=float, help="Latitude")
    ap.add_argument("--lon", type=float, help="Longitude (required with --lat)")
    ap.add_argument("--crop", required=True, help="Crop key from sa_crops.json")
    ap.add_argument("--years", type=int, default=10, help="Historical years (default 10)")
    ap.add_argument("--model", default=os.getenv("DEEPSEEK_MODEL", "deepseek/deepseek-v4-pro"))
    ap.add_argument("--temperature", type=float, default=0.3)
    args = ap.parse_args()

    # Resolve location
    if args.location:
        lat, lon, label = geocode(args.location)
    else:
        if args.lon is None:
            ap.error("--lon is required when using --lat")
        lat, lon, label = args.lat, args.lon, f"({args.lat}, {args.lon})"

    # Load crop
    with open(CROPS_FILE) as fh:
        crops = json.load(fh)
    if args.crop not in crops:
        ap.error(f"Unknown crop '{args.crop}'. Options: {', '.join(sorted(crops))}")
    crop = crops[args.crop]

    # Fetch weather
    today = date.today()
    start = today - timedelta(days=365 * args.years)
    end = today - timedelta(days=1)
    print(f"Fetching {args.years} years of daily data for {label} "
          f"(lat={lat}, lon={lon}) ...")
    hist = fetch_historical(lat, lon, start.isoformat(), end.isoformat())
    if not hist.get("temperature_2m_mean"):
        print("No historical data returned. Check coordinates / network.", file=sys.stdout)
        return 1

    summary = summarize(crop, hist)

    prompt = USER_TEMPLATE.format(
        crop_name=crop["name"],
        base_temp=crop["base_temp"],
        gdd_required=crop["gdd_required"],
        t_opt_min=crop["t_opt_min"],
        t_opt_max=crop["t_opt_max"],
        t_min=crop["t_min"],
        frost_tolerant=crop["frost_tolerant"],
        precip_need=crop["precip_mm_per_month"] * 12,
        gdd_avail=summary["gdd_available_per_year"],
        frost_days=summary["frost_days_per_year"],
        cold_days=summary["days_below_opt_temp_per_year"],
        hot_days=summary["days_above_opt_temp_per_year"],
        precip=summary["annual_precip_mm"],
        tmax=summary["mean_annual_tmax"],
        tmin=summary["mean_annual_tmin"],
        years=summary["years"],
        notes=crop.get("notes", "—"),
    )

    print(f"\nAsking {args.model} ...\n")
    answer = ask_deepseek(prompt, args.model, args.temperature)
    print(answer)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
