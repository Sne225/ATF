import {
  crops,
  defaultCropIds,
  normalizeCropSearch,
  searchCrops,
  thresholds,
  visibleCrops,
} from '../advisor/crops'
import type { Crop, CropCategory, CropMethod, CropThresholds, Drought, Warmth } from '../advisor/crops'
import { fetchWeather, type Forecast } from '../openMeteo'
import { fetchHistory, type CachedHistory } from '../openMeteoHistory'
import { reversePlace as liveReversePlace, searchPlaces as liveSearchPlaces, type Place } from '../geo'
import { API_MODE } from './config'
import { quickPlaces, mockReversePlace, mockSearchPlaces } from './mock/catalog'
import { mockWeather } from './mock/forecast'
import { mockHistory } from './mock/history'
import { serverHistory, serverReversePlace, serverSearchPlaces, serverWeather } from './server'

export { crops, defaultCropIds, normalizeCropSearch, searchCrops, thresholds, visibleCrops, quickPlaces }
export type { Crop, CropCategory, CropMethod, CropThresholds, Drought, Warmth, Forecast, CachedHistory, Place }

// A short, cancellable delay so mock responses feel like a network call.
function mockDelay(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Request was cancelled', 'AbortError'))
      return
    }
    const timer = setTimeout(resolve, 120 + Math.random() * 180)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new DOMException('Request was cancelled', 'AbortError'))
    }, { once: true })
  })
}

export function getWeather(lat: number, lon: number, signal?: AbortSignal): Promise<Forecast> {
  if (API_MODE === 'server') return serverWeather(lat, lon, signal)
  if (API_MODE === 'live') return fetchWeather(lat, lon, signal)
  return mockDelay(signal).then(() => mockWeather(lat, lon))
}

export function getHistory(lat: number, lon: number, signal?: AbortSignal): Promise<CachedHistory> {
  if (API_MODE === 'server') return serverHistory(lat, lon, signal)
  if (API_MODE === 'live') return fetchHistory(lat, lon, signal)
  return mockDelay(signal).then(() => mockHistory(lat, lon))
}

export function searchPlaces(query: string, signal?: AbortSignal): Promise<Place[]> {
  if (API_MODE === 'server') return serverSearchPlaces(query, signal)
  if (API_MODE === 'live') return liveSearchPlaces(query, signal)
  return mockDelay(signal).then(() => mockSearchPlaces(query))
}

export function reversePlace(lat: number, lon: number, signal?: AbortSignal): Promise<string> {
  if (API_MODE === 'server') return serverReversePlace(lat, lon, signal)
  if (API_MODE === 'live') return liveReversePlace(lat, lon, signal)
  return mockDelay(signal).then(() => mockReversePlace(lat, lon))
}
