import type { CachedHistory } from '../../openMeteoHistory'
import type { HistoryDay } from '../../advisor/history'
import { historyDateRange } from '../../openMeteoHistory'
import { hashString, mulberry32 } from './random'

const seasonal = (month: number): number => {
  const m = month + 1
  if (m >= 11 || m <= 4) return 1
  if (m === 5 || m === 10) return 0.5
  return 0.15
}

// Deterministic daily rainfall for the latest 20 complete July–June seasons.
export function mockHistory(lat: number, lon: number): CachedHistory {
  const rng = mulberry32(hashString(`era5:${lat.toFixed(3)},${lon.toFixed(3)}`))
  const { startDate, endDate } = historyDateRange()
  const start = new Date(`${startDate}T00:00:00Z`)
  const end = new Date(`${endDate}T00:00:00Z`)
  const days: HistoryDay[] = []

  for (let date = new Date(start); date <= end; date.setUTCDate(date.getUTCDate() + 1)) {
    const month = date.getUTCMonth()
    const chance = 0.15 + 0.4 * seasonal(month)
    const rain = rng() < chance ? Math.round((rng() * rng() * 16 + 0.3) * 10) / 10 : 0
    days.push({ date: date.toISOString().slice(0, 10), rain })
  }

  // Seed one rainy-season sowing window per season so onsets can be detected.
  const bySeason = new Map<number, HistoryDay[]>()
  for (const day of days) {
    const year = Number(day.date.slice(0, 4))
    const month = Number(day.date.slice(5, 7))
    const startYear = month >= 7 ? year : year - 1
    const list = bySeason.get(startYear) ?? []
    list.push(day)
    bySeason.set(startYear, list)
  }
  for (const season of bySeason.values()) {
    if (season.length < 12) continue
    // Onset somewhere in Nov–Jan (season indexes 120–240).
    const offset = 120 + Math.floor(rng() * 120)
    for (let k = -2; k <= 0; k++) {
      const day = season[offset + k]
      if (!day) continue
      day.rain = Math.round((day.rain! + 9 + rng() * 5) * 10) / 10
    }
    // About a third of seasons get a dry spell right after (a false start).
    if (rng() < 0.33) {
      for (let k = 1; k <= 10; k++) {
        const day = season[offset + k]
        if (!day) continue
        day.rain = 0
      }
    }
  }

  return { days, fetchedAt: Date.now(), startDate, endDate }
}
