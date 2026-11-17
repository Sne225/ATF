import type { Crop } from './crops'
import { thresholds } from './crops'

export type HistoryDay = { date: string; rain: number | null }
export type HistorySeries = { days: HistoryDay[] }
export type HistoricalSeason = {
  startYear: number
  label: string
  rainfall?: number
  monthlyRain: (number | undefined)[]
  onset?: { date: string; rain3: number; dryDays: number }
  falseStart?: { date: string; dryDays: number }
}
export type HistoryMonth = { month: number; rainfall?: number; onsetCount: number; seasonsObserved: number }
export type HistoryAnalysis = {
  seasons: HistoricalSeason[]
  months: HistoryMonth[]
  seasonsWithOnset: number
  falseStartSeasons: number
  seasonsWithoutOnset: number
  commonOnsetMonth?: number
}

const dateParts = (value: string) => {
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isNaN(date.getTime()) ? undefined : { year: date.getUTCFullYear(), month: date.getUTCMonth(), day: date.getUTCDate() }
}
const seasonLabel = (year: number) => `${year}/${String((year + 1) % 100).padStart(2, '0')}`

function calculateSeason(days: HistoryDay[], startYear: number, crop: Crop): HistoricalSeason {
  const rules = thresholds(crop)
  const rain = days.map(day => day.rain)
  const sumPrefix = [0]
  const validPrefix = [0]
  for (const value of rain) {
    sumPrefix.push(sumPrefix.at(-1)! + (value ?? 0))
    validPrefix.push(validPrefix.at(-1)! + (value === null ? 0 : 1))
  }
  const monthSums = Array<number>(12).fill(0)
  const monthCounts = Array<number>(12).fill(0)
  let observed = 0, rainfallTotal = 0
  for (const day of days) {
    const parts = dateParts(day.date)
    if (!parts || day.rain === null) continue
    observed++
    rainfallTotal += day.rain
    monthSums[parts.month]! += day.rain
    monthCounts[parts.month]!++
  }
  const monthlyRain = monthSums.map((total, month) => {
    const expected = days.filter(day => dateParts(day.date)?.month === month).length
    return expected > 0 && monthCounts[month] === expected ? total : undefined
  })

  let onset: HistoricalSeason['onset']
  let falseStart: HistoricalSeason['falseStart']
  for (let day = 2; day < days.length; day++) {
    if (validPrefix[day + 1]! - validPrefix[day - 2]! !== 3) continue
    const rain3 = sumPrefix[day + 1]! - sumPrefix[day - 2]!
    if (rain3 < rules.onsetRainMm) continue
    let longestDry = 0, dryRun = 0
    for (let i = day + 1; i <= Math.min(day + 14, days.length - 1); i++) {
      const value = rain[i]
      if (value !== null && value !== undefined && value < 1) {
        dryRun++
        longestDry = Math.max(longestDry, dryRun)
      } else dryRun = 0
    }
    const event = { date: days[day]!.date, rain3, dryDays: longestDry }
    if (longestDry <= rules.maxDrySpellDays) {
      onset = event
      break
    }
    if (!falseStart) falseStart = event
  }
  return {
    startYear, label: seasonLabel(startYear),
    rainfall: observed === days.length ? rainfallTotal : undefined,
    monthlyRain,
    onset, falseStart,
  }
}

export function analyzeHistory(series: HistorySeries, crop: Crop): HistoryAnalysis {
  const grouped = new Map<number, HistoryDay[]>()
  for (const day of series.days) {
    const parts = dateParts(day.date)
    if (!parts || day.rain === undefined || (day.rain !== null && !Number.isFinite(day.rain))) continue
    const startYear = parts.month >= 6 ? parts.year : parts.year - 1
    const season = grouped.get(startYear) ?? []
    season.push(day)
    grouped.set(startYear, season)
  }
  const seasons = [...grouped.entries()]
    .map(([year, days]) => {
      days.sort((a, b) => a.date.localeCompare(b.date))
      return calculateSeason(days, year, crop)
    })
    .filter(season => {
      const first = `${season.startYear}-07-01`
      const next = new Date(Date.UTC(season.startYear + 1, 6, 1)).toISOString().slice(0, 10)
      const last = new Date(Date.parse(`${next}T00:00:00Z`) - 86400000).toISOString().slice(0, 10)
      const dates = grouped.get(season.startYear)!.map(day => day.date)
      const expectedLength = (Date.parse(`${last}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / 86400000 + 1
      return dates.length === expectedLength && dates.includes(first) && dates.includes(last)
    })
    .sort((a, b) => a.startYear - b.startYear)
  const months = Array.from({ length: 12 }, (_, month) => {
    const values = seasons.map(season => season.monthlyRain[month]).filter((value): value is number => value !== undefined)
    return {
      month,
      rainfall: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : undefined,
      onsetCount: seasons.filter(season => season.onset && dateParts(season.onset.date)?.month === month).length,
      seasonsObserved: values.length,
    }
  })
  const seasonsWithOnset = seasons.filter(season => season.onset).length
  const commonOnsetMonth = seasonsWithOnset
    ? months.reduce((best, month) => month.onsetCount > best.onsetCount ? month : best, months[0]!).month
    : undefined
  return {
    seasons, months, seasonsWithOnset,
    falseStartSeasons: seasons.filter(season => season.falseStart).length,
    seasonsWithoutOnset: seasons.filter(season => !season.onset).length,
    commonOnsetMonth,
  }
}
