import { describe, expect, it } from 'vitest'
import { crops } from './crops'
import { calculateMetrics } from './metrics'
import type { Advisory } from './rules'
import type { Forecast } from '../openMeteo'

function forecast(): Forecast {
  const days = Array.from({ length: 30 }, (_, i) => ({
    date: new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10),
    rain: 2 as number | null,
    probability: 70,
    high: 30 as number | null,
    low: 18 as number | null,
    et0: 3 as number | null,
    weatherCode: 1,
  }))
  const soilMoistureLayers = [0, 1, 2].map(() => Array<number | null>(30 * 24).fill(0.2))
  const soilTemperatures = Array<number | null>(30 * 24).fill(11)
  return {
    days, soilMoistureLayers, soilTemperatures,
    probabilities: days.map(day => day.probability), highs: days.map(day => day.high),
    lows: days.map(day => day.low), et0: days.map(day => day.et0),
    utcOffset: 0, fetchedAt: 0,
  }
}

const advisory: Advisory = {
  verdict: 'plant', confidence: 'high', reasons: [],
  metrics: { rainLast3: 6, rainNext7: 14, longestDrySpell: 0, heatStressDays: 0, heavyRainDays: 0 },
  sowingDay: 14, dryStartDay: 15, dryLength: 0,
}

describe('calculateMetrics', () => {
  it('summarizes rain, temperature risk, water balance, and harvest date', () => {
    const weather = forecast()
    weather.days[15]!.high = 36
    weather.days[16]!.rain = 40
    const result = calculateMetrics(weather, crops[0]!, advisory)
    expect(result.soilTempStatus).toBe('watch')
    expect(result.rainLast7).toBe(14)
    expect(result.rainNext7).toBe(52)
    expect(result.wetDaysAhead).toBe(7)
    expect(result.waterBalance).toBe(31)
    expect(result.heatStressDays).toBe(1)
    expect(result.heavyRainDays).toBe(1)
    expect(result.expectedHarvest).toBe('2026-05-15')
  })

  it('does not turn missing rain or soil readings into zero', () => {
    const weather = forecast()
    weather.days[15]!.rain = null
    weather.soilMoistureLayers = weather.soilMoistureLayers.map(layer => layer.map(() => null))
    const result = calculateMetrics(weather, crops[0]!, advisory)
    expect(result.rainNext7).toBeUndefined()
    expect(result.waterBalance).toBeUndefined()
    expect(result.topsoil).toBeUndefined()
    expect(result.topsoilTrend).toBe('unknown')
    expect(result.wetDaysAhead).toBeUndefined()
  })

  it('detects the seven-day topsoil trend', () => {
    const weather = forecast()
    for (let day = 8; day < 15; day++) {
      for (const layer of weather.soilMoistureLayers) {
        layer.fill(0.1 + (day - 8) * 0.025, day * 24, (day + 1) * 24)
      }
    }
    expect(calculateMetrics(weather, crops[0]!, advisory).topsoilTrend).toBe('rising')
  })
})
