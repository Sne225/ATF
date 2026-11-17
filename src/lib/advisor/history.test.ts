import { describe, expect, it } from 'vitest'
import { crops } from './crops'
import { analyzeHistory, type HistoryDay } from './history'

function season(startYear: number): HistoryDay[] {
  const days: HistoryDay[] = []
  for (let date = new Date(Date.UTC(startYear, 6, 1)); date < new Date(Date.UTC(startYear + 1, 6, 1)); date.setUTCDate(date.getUTCDate() + 1)) {
    days.push({ date: date.toISOString().slice(0, 10), rain: 0.5 })
  }
  return days
}

function addSowingRain(days: HistoryDay[], reliable: boolean) {
  const index = 100
  for (let offset = -2; offset <= 0; offset++) days[index + offset]!.rain = 10
  if (reliable) {
    days[index + 7]!.rain = 2
    days[index + 14]!.rain = 2
  }
}

describe('analyzeHistory', () => {
  it('finds a reliable planting onset and its calendar month in one complete season', () => {
    const days = season(2023)
    for (let offset = -2; offset <= 0; offset++) days[30 + offset]!.rain = 10
    addSowingRain(days, true)
    const result = analyzeHistory({ days }, crops[0]!)
    expect(result.seasons).toHaveLength(1)
    expect(result.seasons[0]?.onset?.date).toBe(days[100]?.date)
    expect(result.seasons[0]?.falseStart?.date).toBe(days[30]?.date)
    expect(result.seasonsWithOnset).toBe(1)
    expect(result.falseStartSeasons).toBe(1)
    expect(result.months[result.commonOnsetMonth!]?.onsetCount).toBe(1)
    expect(result.seasons[0]?.rainfall).toBeGreaterThan(0)
  })

  it('compares a successful and a false-start season', () => {
    const successful = season(2023)
    const falseStart = season(2024)
    addSowingRain(successful, true)
    addSowingRain(falseStart, false)
    const result = analyzeHistory({ days: [...successful, ...falseStart] }, crops[0]!)
    expect(result.seasons).toHaveLength(2)
    expect(result.seasonsWithOnset).toBe(1)
    expect(result.falseStartSeasons).toBe(1)
    expect(result.seasonsWithoutOnset).toBe(1)
  })

  it('reports no planting window when no three-day rain reaches the crop threshold', () => {
    const result = analyzeHistory({ days: season(2023) }, crops[0]!)
    expect(result.seasonsWithOnset).toBe(0)
    expect(result.commonOnsetMonth).toBeUndefined()
    expect(result.seasonsWithoutOnset).toBe(1)
  })
})
