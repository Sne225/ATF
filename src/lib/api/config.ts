export type ApiMode = 'mock' | 'live' | 'server'

// Data source for the app. Defaults to `server` (the FastAPI backend at
// /api), which proxies Open-Meteo/Nominatim and adds the LLM advice endpoint.
//
//   VITE_API_MODE=mock    deterministic in-app data, no network (offline demo)
//   VITE_API_MODE=live    browser calls Open-Meteo/Nominatim directly
//   VITE_API_MODE=server  calls the FastAPI backend (default)
//
// VITE_API_BASE overrides the backend base URL (defaults to /api, which the
// Vite dev server proxies to http://127.0.0.1:8000).
const configured = import.meta.env.VITE_API_MODE as string | undefined
export const API_MODE: ApiMode =
  configured === 'mock' ? 'mock' : configured === 'live' ? 'live' : 'server'

export const API_BASE: string = import.meta.env.VITE_API_BASE ?? '/api'
