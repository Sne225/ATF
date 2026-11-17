
# Mvula

**Helping small-scale farmers make better planting decisions.**

Mvula is a phone-first agricultural decision-support application that helps small-scale farmers assess when conditions are suitable for planting.

It combines rainfall observations, weather forecasts, soil estimates, crop requirements and historical rainfall patterns to provide practical planting guidance.

The goal is to make agricultural information more accessible and help farmers make informed decisions in the face of unpredictable rainfall and changing weather conditions.

## The Problem

For many small-scale farmers, deciding when to plant is a difficult and consequential decision.

Planting too early can expose seeds and seedlings to dry spells. Planting too late can shorten the growing season and affect potential yields.

Farmers may not have easy access to reliable weather information, agricultural advisory services or tools that translate weather data into practical planting recommendations.

Mvula aims to bridge this gap by bringing relevant environmental and crop information together in one accessible application.

## How It Works

Mvula evaluates planting conditions using several factors:

- **Recent rainfall:** Helps assess whether enough rain has fallen to support planting.
- **Weather forecasts:** Provides an indication of expected rainfall and potential dry spells.
- **Soil conditions:** Uses soil estimates to help assess moisture availability.
- **Crop requirements:** Considers the environmental requirements of different crops.
- **Historical rainfall:** Provides context about seasonal rainfall patterns and planting windows.

The application processes these inputs through its decision-support rules engine and presents planting guidance to the user.

Recommendations are intended as decision-support information, not guarantees of future rainfall or harvest outcomes.

## Features

- Phone-first user interface designed for accessibility.
- Crop-specific planting guidance.
- Rainfall and weather forecast assessment.
- Soil condition estimates.
- Historical rainfall analysis.
- Irrigation-aware recommendations.
- Interactive planting advice.
- Backend API for weather and agricultural data.
- Mock, server and live API modes.

## Technology Stack

### Frontend
- React
- TypeScript
- Vite

### Backend
- Python
- FastAPI

### Other
- JavaScript/TypeScript decision-support rules engine
- Weather and rainfall data integrations
- DeepSeek integration for AI-assisted advice

## Project Structure

```text
ATF/
├── server/                 # FastAPI backend
│   └── main.py
├── src/
│   └── lib/
│       └── advisor/        # Planting decision-support logic
├── public/                 # Static assets
├── grow_advisor.py         # Agricultural advisory functionality
├── crop_suitability.py     # Crop suitability analysis
├── package.json
└── README.md
```

## Getting Started

### Prerequisites

Install the following:

- Node.js 20.19+ or 22.12+
- npm
- Python 3.10+
- Git

### 1. Clone the repository

```bash
git clone https://github.com/Sne225/ATF.git
cd ATF
```

### 2. Set up the backend

Create and activate a Python virtual environment.

**Windows PowerShell:**

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

**Linux/macOS:**

```bash
python3 -m venv .venv
source .venv/bin/activate
```

Install dependencies:

```bash
pip install -r server/requirements.txt
```

Start the backend:

```bash
uvicorn server.main:app --reload --port 8000
```

The API should now be available at:

- API: http://localhost:8000
- Interactive API documentation: http://localhost:8000/docs

### 3. Set up the frontend

Open another terminal in the project directory.

Install dependencies:

```bash
npm ci
```

Start the development server:

```bash
npm run dev
```

<<<<<<< Updated upstream
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

The Vite frontend builds to static files in `dist`. The default API mode now
requires the FastAPI backend described in `AGENTS.md`; deploy it alongside the
frontend with `/api` routed to it, or build with `VITE_API_MODE=live` for direct
browser requests to the public weather providers. No GitHub Actions workflow is
configured in this repository.

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
  network failure. No user account is required; server API mode forwards data
  requests through the FastAPI backend.

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
- Interface icons use Lucide's bundled SVG outline set rather than emoji or
  font glyphs, with consistent sizing and decorative icons hidden from screen
  readers. Crop icons indicate crop families; names remain the primary labels.
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

=======
Vite will display the local development URL in your terminal, usually:

```text
http://localhost:5173
```

Open that address in your browser.

## API Modes

The application supports different API modes:

| Mode | Description |
|---|---|
| `mock` | Uses mock data for development and testing. |
| `server` | Uses the local FastAPI backend. |
| `live` | Uses live data integrations where configured. |

Check the application's configuration and environment variables to select the appropriate mode.

## AI-Powered Advice

The backend includes a `/api/advice` endpoint that integrates with DeepSeek to provide AI-assisted advice.

If you want to use this functionality, configure the relevant API key in your backend environment.

For example, create a `.env` file using the environment variable expected by the backend implementation.

**Important:** The core planting decision-support rules are separate from the DeepSeek integration. The application should not depend on an AI API key to evaluate its deterministic planting rules.

## Testing and Building

Run the available frontend tests:

```bash
npm test
```

Build the frontend:

```bash
npm run build
```

If the test command is unavailable, inspect the scripts defined in `package.json`.

## Data Sources and Limitations

The quality of planting recommendations depends on the availability and accuracy of weather, rainfall and soil information.

Users should understand that:

- Weather forecasts are estimates and can change.
- Soil conditions may be estimated rather than measured directly.
- Historical rainfall does not guarantee future rainfall.
- Planting recommendations should be considered alongside local knowledge and agricultural advice.

Mvula is intended to support farmers' decisions, not replace their judgement.

## Keeping AI Token Usage Low

Mvula was developed with an intentional focus on reducing unnecessary AI token consumption while maintaining development quality.

The following approaches were explored during development.

### 1. Spec-Driven Development

Before implementation, a project specification was created to establish:

- What the application should do.
- The problem it aims to solve.
- The proposed solution.
- The expected functionality and user experience.

This helped align development around a shared understanding before asking AI tools to generate code.

A clear specification reduces repeated explanations, unnecessary prompt iterations and avoidable rework.

### 2. Exploring Multilingual Prompting

An experimental approach was used to reduce prompt length when working with GitHub Copilot.

The process involved:

1. Writing prompts in English.
2. Translating the prompts into Mandarin using Google Translate.
3. Submitting the translated prompts to GitHub Copilot.
4. Translating the responses back into English for review.

The motivation was that Mandarin expressions can sometimes use fewer written characters than their English equivalents.

**Important:** Fewer characters do not automatically mean fewer AI tokens. Token counts depend on the tokenizer used by the underlying model. This should therefore be treated as an experiment rather than a guaranteed token-saving technique. Token usage should be measured before claiming actual savings.

### 3. Reusable AI Skills and UI/UX ProMax

Reusable skills and structured instructions were implemented to help AI tools perform specific development tasks more consistently.

UI development also incorporated **UI/UX ProMax**, helping guide interface design and improve the overall user experience.

This approach encouraged more structured AI-assisted development instead of relying entirely on repeated, generic prompts.

A related community resource:

[UI/UX ProMax Discord resource](https://discord.com/channels/1572209739356569750/1572251707109416970)

## Contributing

Contributions, suggestions and improvements are welcome.

When contributing:

1. Create a feature branch.
2. Keep changes focused on a specific improvement.
3. Run relevant tests and builds.
4. Submit a pull request describing the problem and proposed solution.

## License

Check the repository for the applicable license and usage terms.
>>>>>>> Stashed changes
