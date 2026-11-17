import type { Forecast } from '../../openMeteo'
import type { WeatherDay } from '../../advisor/rules'
import { hashString, mulberry32 } from './random'

const isoDate = (date: Date): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Rough Southern-Africa wet-season weight by month (peak Nov–Apr).
const seasonal = (month: number): number => {
  const m = month + 1
  if (m >= 11 || m <= 4) return 1
  if (m === 5 || m === 10) return 0.5
  return 0.15
}

const pick = <T>(values: T[], rng: () => number): T => values[Math.floor(rng() * values.length)]!

// Deterministic 30-day forecast (14 past + 16 forecast) for a field.
export function mockWeather(lat: number, lon: number): Forecast {
  const rng = mulberry32(hashString(`${lat.toFixed(3)},${lon.toFixed(3)}`))
  const today = new Date()
  const days: WeatherDay[] = []

  for (let i = 0; i < 30; i++) {
    const date = new Date(today)
    date.setDate(date.getDate() + (i - 14))
    const month = date.getMonth()
    const chance = 0.2 + 0.45 * seasonal(month)
    const rain = rng() < chance ? Math.round((rng() * rng() * 20 + 0.4) * 10) / 10 : 0
    const high = Math.round((27 + rng() * 8 + (seasonal(month) - 0.5) * 4) * 10) / 10
    const low = Math.round((high - 8 - rng() * 6) * 10) / 10
    days.push({
      date: isoDate(date),
      rain,
      probability: Math.round(rain > 0 ? 50 + rng() * 45 : 5 + rng() * 30),
      high,
      low,
      et0: Math.round((3 + rng() * 3) * 10) / 10,
      weatherCode: rain > 0 ? pick([61, 63, 65, 80, 81], rng) : pick([0, 1, 2, 3], rng),
    })
  }

  // Inject one three-day sowing event so the advisor has real signal.
  const eventDay = 12 + Math.floor(rng() * 6)
  for (let k = -2; k <= 0; k++) {
    const index = eventDay + k
    if (index < 0 || index >= 30) continue
    days[index]!.rain = Math.round((days[index]!.rain! + 8 + rng() * 6) * 10) / 10
    days[index]!.probability = Math.round(60 + rng() * 40)
    days[index]!.weatherCode = pick([61, 63, 65], rng)
  }

  const soilMoistureLayers = [0, 1, 2].map(() => {
    const values: (number | null)[] = []
    for (let hour = 0; hour < 30 * 24; hour++) values.push(Math.round((0.16 + rng() * 0.24) * 1000) / 1000)
    return values
  })
  const soilTemperatures: (number | null)[] = []
  for (let hour = 0; hour < 30 * 24; hour++) soilTemperatures.push(Math.round((16 + rng() * 12) * 10) / 10)

  return {
    days,
    soilMoistureLayers,
    soilTemperatures,
    probabilities: days.map(day => day.probability),
    highs: days.map(day => day.high ?? null),
    lows: days.map(day => day.low ?? null),
    et0: days.map(day => day.et0 ?? null),
    utcOffset: -new Date().getTimezoneOffset() * 60,
    fetchedAt: Date.now(),
  }
}
