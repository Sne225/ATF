import type { HistorySeries } from './advisor/history'
import { getHistoryCache, setHistoryCache } from './storage'
import copy from '../i18n/en.json'

export type CachedHistory = HistorySeries & { fetchedAt: number; startDate: string; endDate: string }
type RawHistory = { daily?: { time?: unknown; precipitation_sum?: unknown } }

const numberArray = (value: unknown): (number | null)[] =>
  Array.isArray(value) ? value.map(item => typeof item === 'number' && Number.isFinite(item) ? item : null) : []

export function historyDateRange(now = new Date()): { startDate: string; endDate: string } {
  const year = now.getUTCFullYear()
  const lastCompletedEndYear = now.getUTCMonth() >= 6 ? year : year - 1
  const firstSeasonYear = lastCompletedEndYear - 20
  const endYear = lastCompletedEndYear
  const startDate = `${firstSeasonYear}-07-01`
  const endDate = `${endYear}-06-30`
  return { startDate, endDate }
}

export function historyCacheKey(lat: number, lon: number): string {
  return `era5:${lat.toFixed(3)},${lon.toFixed(3)}`
}

export async function fetchHistory(lat: number, lon: number, signal?: AbortSignal): Promise<CachedHistory> {
  const key = historyCacheKey(lat, lon)
  const cached = getHistoryCache<CachedHistory>(key)
  if (cached) return cached
  const { startDate, endDate } = historyDateRange()
  const params = new URLSearchParams({
    latitude: lat.toFixed(3), longitude: lon.toFixed(3),
    start_date: startDate, end_date: endDate,
    daily: 'precipitation_sum', timezone: 'auto', models: 'era5',
  })
  let response: Response
  try {
    response = await fetch(`https://archive-api.open-meteo.com/v1/archive?${params}`, { signal })
  } catch (error) {
    if (signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) throw error
    throw new Error(copy.historyUnavailable, { cause: error })
  }
  if (!response.ok) throw new Error(copy.historyUnavailable)
  const raw = await response.json() as RawHistory
  const dates = raw.daily?.time
  const rain = numberArray(raw.daily?.precipitation_sum)
  if (!Array.isArray(dates) || dates.length !== rain.length || dates.length < 365 || rain.every(value => value === null)) {
    throw new Error(copy.historyIncomplete)
  }
  const history: CachedHistory = {
    days: dates.map((date, index) => ({ date: String(date), rain: rain[index] ?? null })),
    fetchedAt: Date.now(), startDate, endDate,
  }
  setHistoryCache(key, history)
  return history
}
