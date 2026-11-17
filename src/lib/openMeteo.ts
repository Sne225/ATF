import type { WeatherSeries } from './advisor/rules'
import { getWeatherCache, setWeatherCache } from './storage'
import copy from '../i18n/en.json'

type RawWeather = {
  daily?: {
    time?: unknown; precipitation_sum?: unknown; precipitation_probability_max?: unknown
    et0_fao_evapotranspiration?: unknown; temperature_2m_max?: unknown; temperature_2m_min?: unknown; weather_code?: unknown
  }
  hourly?: Record<string, unknown>
  utc_offset_seconds?: number
}

const numberArray = (value: unknown): (number | null)[] =>
  Array.isArray(value) ? value.map(v => typeof v === 'number' && Number.isFinite(v) ? v : null) : []

export type Forecast = WeatherSeries & {
  probabilities: (number | null)[]
  highs: (number | null)[]
  lows: (number | null)[]
  et0: (number | null)[]
  utcOffset: number
  fetchedAt: number
}

export async function fetchWeather(lat: number, lon: number, signal?: AbortSignal): Promise<Forecast> {
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`
  const cached = getWeatherCache<Forecast>(key)
  if (cached) return cached
  const params = new URLSearchParams({
    latitude: lat.toFixed(3), longitude: lon.toFixed(3),
    daily: 'precipitation_sum,precipitation_probability_max,et0_fao_evapotranspiration,temperature_2m_max,temperature_2m_min,weather_code',
    hourly: 'soil_moisture_0_to_1cm,soil_moisture_1_to_3cm,soil_moisture_3_to_9cm,soil_temperature_6cm',
    past_days: '14', forecast_days: '16', timezone: 'auto',
  })
  let response: Response
  try {
    response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal })
  } catch (error) {
    if (signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) throw error
    throw new Error(copy.weatherUnavailable, { cause: error })
  }
  if (!response.ok) throw new Error(copy.weatherUnavailable)
  const raw = await response.json() as RawWeather
  const daily = raw.daily
  const hourly = raw.hourly
  if (!daily || !Array.isArray(daily.time) || !hourly) throw new Error(copy.weatherIncomplete)
  const rain = numberArray(daily.precipitation_sum)
  if (rain.length !== daily.time.length) throw new Error(copy.weatherIncomplete)
  const soilMoistureLayers = [
    numberArray(hourly.soil_moisture_0_to_1cm),
    numberArray(hourly.soil_moisture_1_to_3cm),
    numberArray(hourly.soil_moisture_3_to_9cm),
  ]
  const probabilities = numberArray(daily.precipitation_probability_max)
  const highs = numberArray(daily.temperature_2m_max)
  const lows = numberArray(daily.temperature_2m_min)
  const et0 = numberArray(daily.et0_fao_evapotranspiration)
  const weatherCodes = numberArray(daily.weather_code)
  const result: Forecast = {
    days: daily.time.map((date, i) => ({
      date: String(date), rain: rain[i],
      probability: probabilities[i] ?? null,
      high: highs[i] ?? null,
      low: lows[i] ?? null,
      et0: et0[i] ?? null,
      weatherCode: weatherCodes[i] ?? null,
    })),
    soilMoistureLayers,
    soilTemperatures: numberArray(hourly.soil_temperature_6cm),
    probabilities,
    highs,
    lows,
    et0,
    utcOffset: raw.utc_offset_seconds ?? 0,
    fetchedAt: Date.now(),
  }
  setWeatherCache(key, result)
  return result
}
