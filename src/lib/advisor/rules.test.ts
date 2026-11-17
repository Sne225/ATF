import { describe, expect, it } from 'vitest'
import { crops, searchCrops, thresholds, visibleCrops } from './crops'
import { advise, type WeatherSeries } from './rules'

function fixture(kind: 'plant' | 'false_start' | 'wait_window' | 'wait_no_rain' | 'too_cold', length = 30): WeatherSeries {
  const rain = Array<number | null>(length).fill(0)
  if (kind === 'plant' || kind === 'false_start' || kind === 'too_cold') {
    rain[12] = 10; rain[13] = 10; rain[14] = 5
  }
  if (kind === 'false_start') {
    for (let i = 15; i < Math.min(23, length); i++) rain[i] = 0
    for (let i = 23; i < length; i += 5) rain[i] = 2
  }
  if (kind === 'plant' || kind === 'too_cold') {
    for (let i = 15; i < length; i += 4) rain[i] = 2
  }
  if (kind === 'wait_window') {
    rain[15] = 7; rain[16] = 10; rain[17] = 8
    for (let i = 20; i < length; i += 5) rain[i] = 2
  }
  const soilTemp = kind === 'too_cold' ? 10 : 24
  return {
    days: rain.map((value, i) => ({
      date: new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10),
      rain: value,
      probability: 70,
    })),
    soilMoistureLayers: [0, 1, 2].map(() => Array(24 * length).fill(0.22)),
    soilTemperatures: Array(24 * length).fill(soilTemp),
  }
}

describe('advise', () => {
  it.each(['plant', 'false_start', 'wait_window', 'wait_no_rain', 'too_cold'] as const)(
    'returns the %s verdict from its weather fixture',
    (verdict) => expect(advise(fixture(verdict), crops[0]!).verdict).toBe(verdict),
  )

  it('accepts the exact rain and dry-spell thresholds', () => {
    const weather = fixture('plant')
    for (let i = 15; i < 22; i++) weather.days[i]!.rain = 0
    weather.days[22]!.rain = 2
    weather.days[12]!.rain = 10
    weather.days[13]!.rain = 10
    weather.days[14]!.rain = 5
    expect(advise(weather, crops[0]!).verdict).toBe('plant')
  })

  it('does not treat missing soil readings as zero or as a planting signal', () => {
    const weather = fixture('plant')
    weather.soilMoistureLayers = weather.soilMoistureLayers.map(layer => layer.map(() => null))
    weather.soilTemperatures = weather.soilTemperatures.map(() => null)
    const result = advise(weather, crops[0]!)
    expect(result.verdict).not.toBe('plant')
    expect(result.metrics.topsoil).toBeUndefined()
    expect(result.metrics.soilTempC).toBeUndefined()
  })

  it('uses the available forecast when it ends before the full dry-spell look-ahead', () => {
    expect(advise(fixture('plant', 18), crops[0]!).verdict).toBe('plant')
  })

  it.each([
    [9, 'high'],
    [10.5, 'medium'],
    [11, 'low'],
  ] as const)('sets too-cold confidence from the temperature margin alone', (temperature, confidence) => {
    const weather = fixture('too_cold')
    weather.soilTemperatures = weather.soilTemperatures.map(() => temperature)
    weather.soilMoistureLayers = weather.soilMoistureLayers.map(layer => layer.map(() => null))
    expect(advise(weather, crops[0]!).confidence).toBe(confidence)
  })

  it('uses the class tables for crop thresholds', () => {
    expect(thresholds(crops.find(crop => crop.id === 'maize')!)).toEqual({
      minSoilTempC: 12, heatStressMaxC: 35, maxDrySpellDays: 7, onsetRainMm: 25,
    })
    expect(thresholds(crops.find(crop => crop.id === 'okra')!)).toEqual({
      minSoilTempC: 18, heatStressMaxC: 40, maxDrySpellDays: 10, onsetRainMm: 20,
    })
  })

  it('searches names and aliases without case or accent sensitivity', () => {
    expect(searchCrops('sukuma wiki')[0]?.id).toBe('kale')
    expect(searchCrops('MEALIES')[0]?.id).toBe('maize')
    expect(searchCrops('niebe')[0]?.id).toBe('cowpeas')
    expect(searchCrops('okra')[0]?.id).toBe('okra')
  })

  it('keeps the selected crop in the five visible recent/default tiles', () => {
    const visible = visibleCrops(['kale', 'okra', 'teff', 'cassava', 'spinach'], 'watermelon')
    expect(visible).toHaveLength(5)
    expect(visible[0]?.id).toBe('watermelon')
  })

  it('irrigation bypasses rain and dry-gap checks but keeps cold and weather warnings', () => {
    const weather = fixture('wait_no_rain')
    weather.days[15]!.high = 39
    weather.days[16]!.rain = 40
    const result = advise(weather, crops[0]!, true)
    expect(result.verdict).toBe('plant')
    expect(result.reasons.map(reason => reason.key)).toContain('heatRisk')
    expect(result.reasons.map(reason => reason.key)).toContain('heavyRainRisk')
    expect(advise(fixture('too_cold'), crops[0]!, true).verdict).toBe('too_cold')
  })
})
