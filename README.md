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

For the interactive map, copy `.env.example` to `.env.local` and set a public
Mapbox access token:

```sh
VITE_MAPBOX_TOKEN=your_public_mapbox_token
```

Restart Vite after changing the token. Use a URL-restricted public token, not a
secret token: Vite includes it in the browser bundle. Without a token, a banner
replaces the map; location search, GPS and nearby-place shortcuts remain usable.
Satellite Hybrid is the default map style, with Terrain Outdoors available in
the map's layer switcher.
Satellite administrative boundaries have contrasting outlines; these are not
surveyed field/property boundaries. Map controls retain visible outlines when
the device uses dark mode. If Mapbox rate-limits imagery, the map explains the
issue and offers manual retry or the terrain style instead.

Open the local URL Vite prints. For a production build and local preview:

```sh
npm run typecheck
npm test
npm run build
npm run preview
```

Location access requires HTTPS or localhost. Without it, search for a place or
tap the map to set the field.

## Deployment and Mapbox

The app deploys as a static Vite site. No deployment provider or GitHub Actions
workflow is configured in this repository.

1. Create a public access token (`pk.*`) in your
   [Mapbox account](https://account.mapbox.com/access-tokens/). Keep the public
   read scopes needed for Mapbox styles, fonts and tiles. Never use a secret
   token (`sk.*`) in a `VITE_` variable.
2. Configure the token's allowed URLs for the actual production domain, custom
   domains and any preview URLs where the map should work. Include localhost
   only if using the same token for development; separate development and
   production tokens make restrictions easier to manage.
3. In the deployment host's environment settings, add `VITE_MAPBOX_TOKEN` with
   the public token as its value. Enable it for the production and preview
   build environments as appropriate. `.env.local` is ignored by Git and is
   **not** available to a remote deployment build.
4. Use `npm ci` to install dependencies, `npm run build` as the build command,
   and `dist` as the publish/output directory. The host must provide Node.js
   20.19+ or 22.12+. Serve the site over HTTPS so Locate Me and browser sharing
   can work.
5. Rebuild and redeploy after adding or changing the token. Vite embeds
   `VITE_MAPBOX_TOKEN` in the JavaScript **at build time**; setting a variable
   only on a server that serves an already-built `dist` will not update it.

Before considering a deployment ready, open its real HTTPS URL and confirm that
Satellite Hybrid loads, Terrain Outdoors switches correctly, place search
returns results, and clicking or dragging the pin updates the URL coordinates.
Check Locate Me after granting browser permission, and open a copied field URL
to confirm the selected position is restored.

A missing-token banner means the build did not receive `VITE_MAPBOX_TOKEN`.
Mapbox requests returning 401/403 usually indicate an invalid token, missing
public read scopes, or allowed-URL restrictions that exclude the deployed URL.
Check the browser's Network panel and Mapbox account settings; do not remove URL
restrictions or substitute a secret token to work around an error. Public
tokens are visible in the browser by design, and Mapbox usage is billed to the
token's account.

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
- Search: Mapbox Geocoding API when a token is configured, otherwise the existing
  search provider (Open-Meteo Geocoding API in live API mode).
- Map imagery and terrain: Mapbox, with built-in provider attribution.
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
- Mapbox GL JS renders the map, and the rainfall chart is a small SVG.
  The outlook and history panels are lazy-loaded.
  Fonts are self-hosted through Fontsource packages.
- The live GPS dot and accuracy circle are separate from the movable field pin.
- The crop catalogue's recent selections are saved locally. No field names or
  user profiles are sent to a server.
- The map supports satellite and terrain styles; no offline app shell, saved
  fields, or additional language is included.
- GitHub Pages deployment is intentionally not configured; this build is
  focused on working locally.

## Use of GitHub Copilot

GitHub Copilot was used to scaffold and implement the application from the
requirements, including the deterministic advisor and its tests. The resulting
code and agricultural assumptions should be reviewed by maintainers and local
agronomy experts before real-world use.
