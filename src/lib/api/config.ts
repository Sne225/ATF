export type ApiMode = 'mock' | 'live'

// Set VITE_API_MODE=live to forward requests to the real Open-Meteo and
// Nominatim providers. The default (mock) serves deterministic in-app data
// with no network access.
const configured = import.meta.env.VITE_API_MODE as string | undefined
export const API_MODE: ApiMode = configured === 'live' ? 'live' : 'mock'
