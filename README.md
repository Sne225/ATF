# Mvula

Mvula is a small, phone-first planting decision aid for one field at a time. It
compares recent and forecast rainfall with illustrative crop rules, then shows
the result, reasons, an interactive forecast, field-condition estimates, a
20-year seasonal history, and a shareable message. It is decision support, not
a guarantee of a successful harvest.

## Getting started

Run instructions, API reference, architecture, data sources, and maintenance
notes live in [`AGENTS.md`](./AGENTS.md). In short:

```sh
# backend (FastAPI)
pip install -r server/requirements.txt
uvicorn server.main:app --reload --port 8000

# frontend (Vite)
npm install
npm run dev
```

## Data and privacy

- Forecast: Open-Meteo Forecast API, with daily precipitation, precipitation
  probability, reference evapotranspiration and temperature, plus hourly soil
  moisture and soil temperature.
- Seasonal history: Open-Meteo Historical Weather API (ERA5 reanalysis daily
  precipitation). The app requests the latest 20 complete July-to-June seasons
  and caches the result in local storage for seven days. Cached history is
  shown if a refresh fails.
- Search: Open-Meteo Geocoding API.
- Map tiles: OpenStreetMap.
- Pin labels: Nominatim reverse geocoding, throttled to no more than one
  request per second.
- Forecast responses are cached in this browser's local storage for one hour.
  Stale data for the same rounded field coordinates may be shown after a
  network failure. No user account or server is involved.

The service sends coordinates to the selected public data providers. Weather
models are estimates at a regional grid scale; soil readings may be absent.
Missing readings are not interpreted as zero. Neither a forecast nor this
simple rule captures all local conditions. Confirm the field conditions and
consult an extension officer before making a planting decision.

## Product and implementation choices

- The initial view shows Africa with maize selected by default. A shared URL
  stores latitude, longitude, crop, and the optional watering assumption;
  opening it fetches fresh data.
- Leaflet is loaded in the app bundle, and the rainfall chart is a small SVG to
  keep the first load lean. The outlook and history panels are lazy-loaded.
  Fonts are self-hosted through Fontsource packages.
- The live GPS dot and accuracy circle are separate from the movable field pin.
- The crop catalogue's recent selections are saved locally. No field names or
  user profiles are sent to a server.
- The map uses standard OpenStreetMap tiles only; no satellite layer, offline
  app shell, saved fields, or additional language is included.
- GitHub Pages deployment is intentionally not configured; this build is
  focused on working locally.

## Use of GitHub Copilot

GitHub Copilot was used to scaffold and implement the application from the
requirements, including the deterministic advisor and its tests. The resulting
code and agricultural assumptions should be reviewed by maintainers and local
agronomy experts before real-world use.
