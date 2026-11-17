# Mvula handover

## Current status

Mvula is a locally runnable Vite/React/TypeScript planting-advice app. The core
workflow and the v2 enhancements described in the user prompt are implemented:
field selection, crop advice, the 31-crop catalogue, irrigation-aware rules,
interactive forecast, field-condition metrics, and historical rainfall
comparison. This is decision support, not a planting guarantee.

The v2 attachment was the available spec; `docs/SPEC.md` is not present.

## Run and verify

Requirements: Node.js 20.19+ or 22.12+.

```sh
npm install
npm run dev
npm test
npm run build
```

Latest validation: `npm test` passes (5 files, 23 tests); `npm run build`
passes including TypeScript type-check. The local Vite server is currently
responding at `http://127.0.0.1:5173`. A shared browser tab is open to the app;
its current URL has a selected field, crop, and watering setting. Avoid
changing that shared page unless needed.

## Implemented areas

- **Location and sharing:** Leaflet/OpenStreetMap map, draggable field pin,
  search, GPS watch and accuracy circle, reverse-geocoded label, URL state,
  WhatsApp/native share/copy.
- **Decision rules:** deterministic advisor, five verdicts, confidence,
  reason values, missing-data handling, irrigation behavior, and crop-family
  threshold defaults. Agronomic defaults need local expert review.
- **Crop catalogue:** 31 crops, category and alias search, recent crops,
  accessible catalogue dialog, crop threshold classes.
- **Forecast outlook:** lazy-loaded 16-day forecast strip; Rain, Temperature,
  Topsoil, and Water balance chart segments; selected day, tooltips, rain
  bands, 7/16/30-day ranges. The 30-day range includes 14 past plus 16
  forecast days.
- **Field metrics:** soil temperature, topsoil trend, recent/forecast rain,
  dry gap, water balance, heat, heavy rain, and estimated harvest, with
  unavailable values kept distinct from zero.
- **Season history:** lazy-loaded Open-Meteo ERA5 daily precipitation for 20
  complete July-to-June seasons; monthly rainfall/onset calendar, season
  comparison, false-start detection, 7-day local cache, stale-cache fallback,
  and retry state.
- **Documentation:** `README.md` includes local setup, data sources,
  limitations, rule behavior, threshold classes, and implementation choices.

## Key files

- `src/App.tsx`: application state, map, URL, advisory loading and integration.
- `src/lib/advisor/crops.ts`: crop definitions and illustrative threshold
  classes.
- `src/lib/advisor/rules.ts`: deterministic forecast advisor.
- `src/lib/advisor/metrics.ts`: field-condition calculations.
- `src/lib/advisor/history.ts`: pure historical-season analysis.
- `src/lib/openMeteo.ts`: live forecast request and normalization.
- `src/lib/openMeteoHistory.ts`: archive API request, date range and cache key.
- `src/components/Outlook.tsx`: interactive forecast charts.
- `src/components/MetricsGrid.tsx`: field metrics cards.
- `src/components/HistoryPanel.tsx`: history loading, calendar and season UI.
- `src/i18n/en.json`: English UI copy.
- `src/style.css`: responsive styling.

## Suggested continuation

1. Browser-smoke-test the latest **30-day** chart range at mobile and desktop
   widths. The 7/16-day interactions and mobile width were exercised earlier;
   the latest 30-day addition has only passed the build/tests so far.
2. Do a final visual and accessibility pass at 360px and 1280px, especially
   on the outlook controls and dense season-history rows.
3. Review crop thresholds and historical onset interpretation with local
   agronomists; these are illustrative and are not region-specific.
4. Review the unused earlier component `src/components/RainTimeline.tsx`;
   `App.tsx` now uses `Outlook.tsx`.
5. Decide whether to implement optional v2 stretch items, if any, only after
   the core review. Do not assume deployment is requested.

## Not done / constraints

- GitHub Pages workflow/deployment is intentionally not configured; the user
  asked to focus on local operation. No commits were made.
- The workspace has no Git metadata (`git status` reports it is not a
  repository). Do not initialize Git unless the user asks.
- No backend, accounts, API keys, saved fields, PWA shell, satellite map, or
  second language has been added.
- Historical and forecast values are regional model estimates. Data
  availability and thresholds should be reviewed before real-world use.
