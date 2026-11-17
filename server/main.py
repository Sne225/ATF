"""
Mvula API — FastAPI backend.

Hosts the real data pipeline that the React app reads, replacing the offline
mock data:

  /api/health            liveness check
  /api/crops             South African crop catalogue (sa_crops.json)
  /api/weather           Open-Meteo forecast, normalized to the app's shape
  /api/history           Open-Meteo ERA5 seasonal rainfall history
  /api/places/search     Open-Meteo geocoding (name -> lat/lon)
  /api/places/reverse    Nominatim reverse geocoding (lat/lon -> name)
  /api/advice            DeepSeek crop-suitability verdict (LLM)

Run:
  pip install -r server/requirements.txt
  uvicorn server.main:app --reload --port 8000

If the built frontend (dist/) is present it is also served as static files.
"""

import sys
from datetime import date, timedelta
from pathlib import Path
import json
import time

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from crop_suitability import fetch_historical
import grow_advisor

load_dotenv()

CROPS_FILE = ROOT / "sa_crops.json"
DIST_DIR = ROOT / "dist"

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse"

app = FastAPI(title="Mvula API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #

def number_array(value) -> list:
    """Mirror the frontend's numberArray: finite numbers pass through, else null."""
    if not isinstance(value, list):
        return []
    return [v if isinstance(v, (int, float)) and v == v and v not in (float("inf"), float("-inf")) else None for v in value]


async def fetch_json(url: str, params: dict) -> dict:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(url, params=params)
        resp.raise_for_status()
        return resp.json()


# --------------------------------------------------------------------------- #
# Weather / history / places
# --------------------------------------------------------------------------- #

@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.get("/api/crops")
async def crops():
    return json.loads(CROPS_FILE.read_text())


@app.get("/api/weather")
async def weather(lat: float = Query(...), lon: float = Query(...)):
    params = {
        "latitude": round(lat, 3),
        "longitude": round(lon, 3),
        "daily": "precipitation_sum,precipitation_probability_max,et0_fao_evapotranspiration,temperature_2m_max,temperature_2m_min,weather_code",
        "hourly": "soil_moisture_0_to_1cm,soil_moisture_1_to_3cm,soil_moisture_3_to_9cm,soil_temperature_6cm",
        "past_days": "14",
        "forecast_days": "16",
        "timezone": "auto",
    }
    try:
        raw = await fetch_json(FORECAST_URL, params)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail="weather unavailable") from exc

    daily = raw.get("daily") or {}
    hourly = raw.get("hourly") or {}
    dates = daily.get("time") or []
    if not dates or not hourly:
        raise HTTPException(status_code=502, detail="weather incomplete")

    rain = number_array(daily.get("precipitation_sum"))
    if len(rain) != len(dates):
        raise HTTPException(status_code=502, detail="weather incomplete")

    probabilities = number_array(daily.get("precipitation_probability_max"))
    highs = number_array(daily.get("temperature_2m_max"))
    lows = number_array(daily.get("temperature_2m_min"))
    et0 = number_array(daily.get("et0_fao_evapotranspiration"))
    codes = number_array(daily.get("weather_code"))

    return {
        "days": [
            {
                "date": str(d),
                "rain": rain[i],
                "probability": probabilities[i] if i < len(probabilities) else None,
                "high": highs[i] if i < len(highs) else None,
                "low": lows[i] if i < len(lows) else None,
                "et0": et0[i] if i < len(et0) else None,
                "weatherCode": codes[i] if i < len(codes) else None,
            }
            for i, d in enumerate(dates)
        ],
        "soilMoistureLayers": [
            number_array(hourly.get("soil_moisture_0_to_1cm")),
            number_array(hourly.get("soil_moisture_1_to_3cm")),
            number_array(hourly.get("soil_moisture_3_to_9cm")),
        ],
        "soilTemperatures": number_array(hourly.get("soil_temperature_6cm")),
        "probabilities": probabilities,
        "highs": highs,
        "lows": lows,
        "et0": et0,
        "utcOffset": raw.get("utc_offset_seconds") or 0,
        "fetchedAt": int(time.time() * 1000),
    }


def history_date_range(now: date):
    year = now.year
    last_end_year = year if now.month >= 7 else year - 1
    first_year = last_end_year - 20
    return f"{first_year}-07-01", f"{last_end_year}-06-30"


@app.get("/api/history")
async def history(lat: float = Query(...), lon: float = Query(...)):
    start_date, end_date = history_date_range(date.today())
    params = {
        "latitude": round(lat, 3),
        "longitude": round(lon, 3),
        "start_date": start_date,
        "end_date": end_date,
        "daily": "precipitation_sum",
        "timezone": "auto",
        "models": "era5",
    }
    try:
        raw = await fetch_json(ARCHIVE_URL, params)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail="history unavailable") from exc

    daily = raw.get("daily") or {}
    dates = daily.get("time") or []
    rain = number_array(daily.get("precipitation_sum"))
    if not dates or len(dates) != len(rain) or len(dates) < 365 or all(v is None for v in rain):
        raise HTTPException(status_code=502, detail="history incomplete")

    return {
        "days": [{"date": str(d), "rain": rain[i]} for i, d in enumerate(dates)],
        "fetchedAt": int(time.time() * 1000),
        "startDate": start_date,
        "endDate": end_date,
    }


@app.get("/api/places/search")
async def search_places(query: str = Query(...)):
    params = {"name": query, "count": "5", "language": "en", "format": "json"}
    try:
        raw = await fetch_json(GEOCODE_URL, params)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail="search unavailable") from exc
    results = raw.get("results") or []
    return [
        {
            "lat": p.get("latitude"),
            "lon": p.get("longitude"),
            "name": ", ".join(filter(None, [p.get("name"), p.get("admin1"), p.get("country")])),
        }
        for p in results
    ]


@app.get("/api/places/reverse")
async def reverse_place(lat: float = Query(...), lon: float = Query(...)):
    params = {"format": "jsonv2", "lat": round(lat, 5), "lon": round(lon, 5), "zoom": "10"}
    headers = {"User-Agent": "Mvula/1.0 (local decision support)"}
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(NOMINATIM_URL, params=params, headers=headers)
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail="reverse unavailable") from exc

    address = data.get("address") or {}
    name = (
        data.get("name")
        or address.get("village")
        or address.get("town")
        or address.get("city")
        or address.get("county")
        or ""
    )
    return name


# --------------------------------------------------------------------------- #
# LLM crop-suitability advice
# --------------------------------------------------------------------------- #

@app.get("/api/advice")
def advice(
    crop: str = Query(...),
    lat: float = Query(...),
    lon: float = Query(...),
    years: int = Query(10, ge=1, le=30),
    model: str = Query("deepseek/deepseek-v4-pro"),
):
    """Return a DeepSeek verdict on whether `crop` can be grown at lat/lon."""
    crops = json.loads(CROPS_FILE.read_text())
    if crop not in crops:
        raise HTTPException(status_code=404, detail=f"unknown crop '{crop}'")

    profile = crops[crop]

    today = date.today()
    start = today - timedelta(days=365 * years)
    end = today - timedelta(days=1)

    hist = fetch_historical(lat, lon, start.isoformat(), end.isoformat())
    if not hist.get("temperature_2m_mean"):
        raise HTTPException(status_code=502, detail="no historical data returned")

    summary = grow_advisor.summarize(profile, hist)

    prompt = grow_advisor.USER_TEMPLATE.format(
        crop_name=profile["name"],
        base_temp=profile["base_temp"],
        gdd_required=profile["gdd_required"],
        t_opt_min=profile["t_opt_min"],
        t_opt_max=profile["t_opt_max"],
        t_min=profile["t_min"],
        frost_tolerant=profile["frost_tolerant"],
        precip_need=profile["precip_mm_per_month"] * 12,
        gdd_avail=summary["gdd_available_per_year"],
        frost_days=summary["frost_days_per_year"],
        cold_days=summary["days_below_opt_temp_per_year"],
        hot_days=summary["days_above_opt_temp_per_year"],
        precip=summary["annual_precip_mm"],
        tmax=summary["mean_annual_tmax"],
        tmin=summary["mean_annual_tmin"],
        years=summary["years"],
        notes=profile.get("notes", "—"),
    )

    try:
        answer = grow_advisor.ask_deepseek(prompt, model, temperature=0.3)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"LLM call failed: {exc}") from exc

    return {
        "crop": crop,
        "cropName": profile["name"],
        "lat": lat,
        "lon": lon,
        "summary": summary,
        "answer": answer,
    }


# --------------------------------------------------------------------------- #
# Static frontend (optional)
# --------------------------------------------------------------------------- #

if DIST_DIR.exists():
    app.mount("/", StaticFiles(directory=str(DIST_DIR), html=True), name="static")
