import type { Advisory } from './rules'
import type { Crop } from './crops'
import { thresholds } from './crops'
import type { Forecast } from '../openMeteo'

export type MetricStatus = 'good' | 'watch' | 'risk' | 'unknown'
export type MoistureTrend = 'rising' | 'steady' | 'falling' | 'unknown'
export type FieldMetrics = {
  todayIndex: number
  soilTempC?: number
  soilTempStatus: MetricStatus
  topsoil?: number
  topsoilBand?: 'dry' | 'moist' | 'wet'
  topsoilTrend: MoistureTrend
  rainLast7?: number
  rainNext7?: number
  wetDaysAhead?: number
  longestDryGap?: number
  dryGapStart?: string
  waterBalance?: number
  heatStressDays?: number
  heavyRainDays?: number
  expectedHarvest?: string
}

const mean = (values: (number | null | undefined)[]): number | undefined => {
  const known = values.filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value))
  return known.length ? known.reduce((total, value) => total + value, 0) / known.length : undefined
}

function sumComplete(days: Forecast['days'], start: number, count: number, selector: (day: Forecast['days'][number]) => number | null | undefined): number | undefined {
  const range = days.slice(start, start + count)
  if (range.length !== count || range.some(day => selector(day) === null || selector(day) === undefined)) return undefined
  return range.reduce((total, day) => total + selector(day)!, 0)
}

function soilMoistureForDay(weather: Forecast, day: number): number | undefined {
  const layerMeans = [0, 1, 2].map(layer =>
    mean((weather.soilMoistureLayers[layer] ?? []).slice(day * 24, (day + 1) * 24)))
  return mean(layerMeans)
}

function longestDryRun(days: Forecast['days'], start: number, count: number) {
  let longest = 0, current = 0, bestStart = start, currentStart = start, known = 0
  for (let i = start; i < Math.min(start + count, days.length); i++) {
    const rain = days[i]?.rain
    if (rain !== null && rain !== undefined) known++
    if (rain !== null && rain !== undefined && rain < 1) {
      if (!current) currentStart = i
      current++
      if (current > longest) { longest = current; bestStart = currentStart }
    } else current = 0
  }
  return { length: known ? longest : undefined, start: bestStart }
}

function harvestDate(plantDate: string | undefined, daysToHarvest: number): string | undefined {
  if (!plantDate) return undefined
  const date = new Date(`${plantDate}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + daysToHarvest)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString().slice(0, 10)
}

export function calculateMetrics(weather: Forecast, crop: Crop, advisory: Advisory): FieldMetrics {
  const todayIndex = Math.min(14, weather.days.length - 1)
  const rules = thresholds(crop)
  const soilTempC = mean(weather.soilTemperatures.slice(todayIndex * 24, (todayIndex + 3) * 24))
  const soilTempStatus: MetricStatus = soilTempC === undefined ? 'unknown'
    : soilTempC >= rules.minSoilTempC ? 'good'
      : soilTempC >= rules.minSoilTempC - 2 ? 'watch' : 'risk'
  const topsoil = soilMoistureForDay(weather, todayIndex)
  const topsoilBand = topsoil === undefined ? undefined : topsoil < 0.15 ? 'dry' : topsoil <= 0.3 ? 'moist' : 'wet'
  const priorTrend = mean(Array.from({ length: 3 }, (_, i) => soilMoistureForDay(weather, todayIndex - 6 + i)))
  const recentTrend = mean(Array.from({ length: 3 }, (_, i) => soilMoistureForDay(weather, todayIndex - 2 + i)))
  const topsoilTrend: MoistureTrend = priorTrend === undefined || recentTrend === undefined ? 'unknown'
    : recentTrend - priorTrend > 0.015 ? 'rising'
      : recentTrend - priorTrend < -0.015 ? 'falling' : 'steady'
  const rainLast7 = sumComplete(weather.days, todayIndex - 7, 7, day => day.rain)
  const rainNext7 = sumComplete(weather.days, todayIndex, 7, day => day.rain)
  const forecastAhead = weather.days.slice(todayIndex + 1, todayIndex + 8)
  const wetDaysAhead = forecastAhead.length === 7 && forecastAhead.every(day => day.rain !== null)
    ? forecastAhead.filter(day => day.rain! >= 1).length
    : undefined
  const dryRun = longestDryRun(weather.days, todayIndex + 1, 14)
  const waterBalance = weather.days.slice(todayIndex, todayIndex + 7).length === 7 &&
    weather.days.slice(todayIndex, todayIndex + 7).every(day => day.rain !== null && day.et0 !== null && day.rain !== undefined && day.et0 !== undefined)
    ? weather.days.slice(todayIndex, todayIndex + 7).reduce((total, day) => total + day.rain! - day.et0!, 0)
    : undefined
  const heatWeek = weather.days.slice(todayIndex, todayIndex + 7)
  const heatStressDays = heatWeek.length === 7 && heatWeek.every(day => day.high !== null && day.high !== undefined)
    ? heatWeek.filter(day => day.high! > rules.heatStressMaxC).length
    : undefined
  const heavyRainDays = heatWeek.length === 7 && heatWeek.every(day => day.rain !== null && day.rain !== undefined)
    ? heatWeek.filter(day => day.rain! >= 40).length
    : undefined
  const plantingDate = advisory.verdict === 'plant'
    ? weather.days[todayIndex]?.date
    : advisory.verdict === 'wait_window' ? advisory.window?.start : undefined

  return {
    todayIndex, soilTempC, soilTempStatus, topsoil, topsoilBand, topsoilTrend,
    rainLast7, rainNext7, wetDaysAhead, longestDryGap: dryRun.length,
    dryGapStart: weather.days[dryRun.start]?.date,
    waterBalance, heatStressDays, heavyRainDays,
    expectedHarvest: harvestDate(plantingDate, crop.daysToHarvest),
  }
}
