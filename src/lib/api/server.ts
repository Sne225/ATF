import type { Forecast } from '../openMeteo'
import type { CachedHistory } from '../openMeteoHistory'
import type { Place } from '../geo'
import { API_BASE } from './config'
import copy from '../../i18n/en.json'

type MessageKey = 'weatherUnavailable' | 'historyUnavailable' | 'searchFailure' | 'reverseFailure'

async function getJson<T>(url: string, signal?: AbortSignal, failureKey?: MessageKey): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, { signal })
  } catch (error) {
    if (signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) throw error
    throw new Error(copy[failureKey ?? 'weatherUnavailable'], { cause: error })
  }
  if (!response.ok) throw new Error(copy[failureKey ?? 'weatherUnavailable'])
  return response.json() as Promise<T>
}

export function serverWeather(lat: number, lon: number, signal?: AbortSignal): Promise<Forecast> {
  const params = new URLSearchParams({ lat: lat.toFixed(3), lon: lon.toFixed(3) })
  return getJson<Forecast>(`${API_BASE}/weather?${params}`, signal, 'weatherUnavailable')
}

export function serverHistory(lat: number, lon: number, signal?: AbortSignal): Promise<CachedHistory> {
  const params = new URLSearchParams({ lat: lat.toFixed(3), lon: lon.toFixed(3) })
  return getJson<CachedHistory>(`${API_BASE}/history?${params}`, signal, 'historyUnavailable')
}

export function serverSearchPlaces(query: string, signal?: AbortSignal): Promise<Place[]> {
  const params = new URLSearchParams({ query })
  return getJson<Place[]>(`${API_BASE}/places/search?${params}`, signal, 'searchFailure')
}

export function serverReversePlace(lat: number, lon: number, signal?: AbortSignal): Promise<string> {
  const params = new URLSearchParams({ lat: lat.toFixed(5), lon: lon.toFixed(5) })
  return getJson<string>(`${API_BASE}/places/reverse?${params}`, signal, 'reverseFailure')
}
