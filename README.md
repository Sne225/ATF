# Mvula

Mvula is a small, phone-first planting decision aid for one field at a time. It
compares recent and forecast rainfall with illustrative crop rules, then shows
the result, reasons, an interactive forecast, field-condition estimates, a
20-year seasonal history, and a shareable message. It is decision support, not
a guarantee of a successful harvest.

## Run locally

Requires Node.js 20.19+ or 22.12+.

```sh
npm install
npm run dev
```

Open the local URL Vite prints. For a production build and local preview:

```sh
npm run typecheck
npm test
npm run build
npm run preview
```

Location access requires HTTPS or localhost. Without it, search for a place or
tap the map to set the field.

## How the advice works

The rule engine uses the field-local forecast dates from Open-Meteo (today is
daily-array index 14 with `past_days=14`). It checks whether the three-day rain
sum meets the crop's onset threshold, whether the longest following dry spell
is within that crop's tolerance, and whether the modelled mean soil temperature
meets its minimum. It checks cold soil first, then a plantable today, a false
start, a plantable day in the next eight days, and otherwise recommends
checking again in three days. Confidence is lowered when forecast evidence is
uncertain or the estimated topsoil is dry despite sowing rain.

The catalogue has 31 crops. Crop warmth and drought classes in
`src/lib/advisor/crops.ts` provide illustrative soil-temperature, heat, onset
rain, and dry-spell guides. These defaults need review by an agronomist familiar
with local varieties, soils, and planting practices.

Warmth guides (minimum soil temperature / heat guide) are cool 7°C / 30°C,
mild 12°C / 35°C, warm 15°C / 38°C, and hot 18°C / 40°C. Drought guides
(three-day onset rain / maximum dry spell) are delicate 25 mm / 4 days,
sensitive 25 mm / 7 days, moderate 20 mm / 10 days, and hardy 20 mm / 12 days.

The outlook lets the user inspect each of the 16 forecast days and compare
rainfall, temperature, modelled topsoil moisture, and rain minus reference
evapotranspiration over 7- or 16-day ranges. Missing readings remain unknown,
not zero. Field-condition cards explain the estimates and distinguish good,
watch, risk, and unavailable data.

The historical panel requests 20 complete July-to-June seasons of daily
precipitation from Open-Meteo's ERA5 archive. It compares monthly rainfall and
the first crop-rule planting window in each season. A planting window requires
the crop's three-day onset-rain guide and a following dry spell within its
tolerance; earlier false starts are also counted. Historical patterns describe
the past and are not a forecast or a field measurement.

If watering is available, the advisor does not require sowing rain or a short
dry spell, but still checks cold soil and highlights heat and very heavy rain.
This is a user-selected assumption, not a prediction that irrigation water is
available in practice. The rules are deterministic; no language model is
called at runtime.

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
