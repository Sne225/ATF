const CACHE_PREFIX = 'mvula:weather:'
const CACHE_TTL = 60 * 60 * 1000
const HISTORY_PREFIX = 'mvula:history:'
const HISTORY_TTL = 7 * 24 * 60 * 60 * 1000

export function getWeatherCache<T>(key: string, allowExpired = false): T | undefined {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key)
    if (!raw) return undefined
    const entry = JSON.parse(raw) as { savedAt: number; value: T }
    if (!allowExpired && Date.now() - entry.savedAt > CACHE_TTL) return undefined
    return entry.value
  } catch {
    return undefined
  }
}

export function setWeatherCache<T>(key: string, value: T): void {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ savedAt: Date.now(), value }))
  } catch {
    // Weather remains usable when storage is disabled or full.
  }
}

export function getHistoryCache<T>(key: string, allowExpired = false): T | undefined {
  try {
    const raw = localStorage.getItem(HISTORY_PREFIX + key)
    if (!raw) return undefined
    const entry = JSON.parse(raw) as { savedAt: number; value: T }
    if (!allowExpired && Date.now() - entry.savedAt > HISTORY_TTL) return undefined
    return entry.value
  } catch {
    return undefined
  }
}

export function setHistoryCache<T>(key: string, value: T): void {
  try {
    localStorage.setItem(HISTORY_PREFIX + key, JSON.stringify({ savedAt: Date.now(), value }))
  } catch {
    // Historical data remains usable if local storage is unavailable or full.
  }
}
