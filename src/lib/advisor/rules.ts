import { thresholds, type Crop } from './crops'

export type WeatherDay = {
  date: string
  rain: number | null
  probability: number | null
  high?: number | null
  low?: number | null
  et0?: number | null
  weatherCode?: number | null
}
export type WeatherSeries = {
  days: WeatherDay[]
  soilMoistureLayers: (number | null)[][]
  soilTemperatures: (number | null)[]
}
export type Verdict = 'plant' | 'false_start' | 'wait_window' | 'wait_no_rain' | 'too_cold'
export type Advisory = {
  verdict: Verdict
  confidence: 'high' | 'medium' | 'low'
  window?: { start: string; end: string }
  reasons: { key: string; values: Record<string, string | number> }[]
  metrics: {
    rainLast3: number; rainNext7: number; longestDrySpell: number
    drySpellStart?: string; topsoil?: number; topsoilBand?: 'dry' | 'moist' | 'wet'; soilTempC?: number
    heatStressDays: number; heavyRainDays: number
  }
  sowingDay: number
  dryStartDay: number
  dryLength: number
}

const mean = (values: (number | null)[]) => {
  const valid = values.filter((x): x is number => x !== null && Number.isFinite(x))
  return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : undefined
}
const sumRain = (days: WeatherDay[], from: number, to: number) =>
  days.slice(Math.max(0, from), to + 1).reduce((s, d) => d.rain === null ? s : s + d.rain, 0)
const drySpell = (days: WeatherDay[], day: number) => {
  let longest = 0, run = 0, start = day + 1, runStart = start
  for (let i = day + 1; i <= Math.min(day + 14, days.length - 1); i++) {
    const rain = days[i]?.rain
    if (rain !== null && rain !== undefined && rain < 1) {
      if (!run) runStart = i
      run++
      if (run > longest) { longest = run; start = runStart }
    } else run = 0
  }
  return { length: longest, start }
}

export function advise(weather: WeatherSeries, crop: Crop, irrigated = false): Advisory {
  const { days } = weather
  const cropRules = thresholds(crop)
  const todayIndex = Math.min(14, days.length - 1)
  const todayKey = days[todayIndex]?.date ?? ''
  const todayTemps = weather.soilTemperatures.filter((v, i) => v !== null && i >= todayIndex * 24 && i < (todayIndex + 3) * 24)
  const soilTempC = mean(todayTemps)
  const topsoil = mean([0, 1, 2].map(layer =>
    mean((weather.soilMoistureLayers[layer] ?? []).slice(todayIndex * 24, (todayIndex + 1) * 24)) ?? null))
  const topsoilBand = topsoil === undefined ? undefined : topsoil < 0.15 ? 'dry' : topsoil <= 0.3 ? 'moist' : 'wet'
  const sowingRain = (d: number) => d >= 2 &&
    days.slice(d - 2, d + 1).every(day => day.rain !== null) &&
    sumRain(days, d - 2, d) >= cropRules.onsetRainMm
  const dry = (d: number) => drySpell(days, d)
  const sowingDay = Array.from({ length: Math.max(0, days.length - todayIndex) }, (_, i) => i + todayIndex)
    .find(sowingRain) ?? -1
  const todayRain = sowingRain(todayIndex)
  const todayDry = dry(todayIndex)
  const plantable = (d: number) => sowingRain(d) && dry(d).length <= cropRules.maxDrySpellDays &&
    soilTempC !== undefined && soilTempC >= cropRules.minSoilTempC
  const forecastWeek = days.slice(todayIndex, todayIndex + 7)
  const heatStressDays = forecastWeek.filter(day => day.high !== null && day.high !== undefined && day.high > cropRules.heatStressMaxC).length
  const heavyRainDays = forecastWeek.filter(day => day.rain !== null && day.rain >= 40).length
  let verdict: Verdict
  let decisionDay = todayIndex
  if (soilTempC !== undefined && soilTempC < cropRules.minSoilTempC) verdict = 'too_cold'
  else if (irrigated) verdict = 'plant'
  else if (plantable(todayIndex)) verdict = 'plant'
  else if (todayRain && todayDry.length > cropRules.maxDrySpellDays) verdict = 'false_start'
  else {
    const future = Array.from({ length: Math.min(8, days.length - todayIndex - 1) }, (_, i) => todayIndex + i + 1)
      .find(plantable)
    if (future !== undefined) { verdict = 'wait_window'; decisionDay = future }
    else verdict = 'wait_no_rain'
  }
  const relevantDay = verdict === 'wait_window' ? decisionDay
    : verdict === 'false_start' || verdict === 'plant' ? todayIndex : sowingDay
  const probabilityDays = relevantDay >= 2
    ? days.slice(Math.max(relevantDay - 2, todayIndex + 1), relevantDay + 1)
    : []
  const probabilityMean = mean(probabilityDays.map(d => d.probability))
  let drops = 0
  if (!irrigated) {
    if (relevantDay > todayIndex) drops++
    if (verdict === 'plant'
      ? days.slice(todayIndex + 1, todayIndex + 8).filter(day => day.rain !== null && day.rain >= 1).length < 3
      : relevantDay - todayIndex > 7) drops++
    if (probabilityMean !== undefined && probabilityMean < 50) drops++
    if (relevantDay >= 2 && sowingRain(relevantDay) && topsoilBand === 'dry') drops++
  }

  const coldMargin = cropRules.minSoilTempC - (soilTempC ?? cropRules.minSoilTempC)
  const confidence = verdict === 'too_cold'
    ? coldMargin >= 3 ? 'high' : coldMargin >= 1.5 ? 'medium' : 'low'
    : irrigated ? soilTempC === undefined ? 'low' : 'high'
    : drops === 0 ? 'high' : drops === 1 ? 'medium' : 'low'
  const window = verdict === 'wait_window' ? { start: days[decisionDay]?.date ?? '', end: days[decisionDay]?.date ?? '' } : undefined
  const dryForVerdict = verdict === 'false_start' ? todayDry : dry(decisionDay)
  const reasons: Advisory['reasons'] = irrigated
    ? verdict === 'too_cold'
      ? [{ key: 'tooCold', values: { temperature: Math.round(soilTempC ?? 0), minimum: cropRules.minSoilTempC } }]
      : soilTempC === undefined
        ? [{ key: 'irrigatedUnknown', values: {} }]
        : [{ key: 'irrigatedReady', values: {} }]
    : verdict === 'plant'
    ? [{ key: 'plantRain', values: { amount: Math.round(sumRain(days, todayIndex - 2, todayIndex)), days: cropRules.onsetRainMm } },
      { key: 'plantDry', values: { days: todayDry.length, tolerance: cropRules.maxDrySpellDays } }]
    : verdict === 'false_start'
      ? [{ key: 'falseStart', values: { days: todayDry.length, tolerance: cropRules.maxDrySpellDays, date: days[todayDry.start]?.date ?? todayKey } }]
      : verdict === 'wait_window'
        ? [{ key: 'window', values: { date: days[decisionDay]?.date ?? '' } },
          { key: 'windowRain', values: { amount: Math.round(sumRain(days, decisionDay - 2, decisionDay)), days: cropRules.onsetRainMm } }]
        : verdict === 'too_cold'
          ? [{ key: 'tooCold', values: { temperature: Math.round(soilTempC ?? 0), minimum: cropRules.minSoilTempC } }]
          : [{ key: 'noRain', values: { days: 3 } }]
  if (irrigated && heatStressDays) reasons.push({ key: 'heatRisk', values: { maximum: cropRules.heatStressMaxC, days: heatStressDays } })
  if (irrigated && heavyRainDays) reasons.push({ key: 'heavyRainRisk', values: { days: heavyRainDays } })
  if (topsoilBand) reasons.push({ key: `soil_${topsoilBand}`, values: { moisture: Math.round((topsoil ?? 0) * 100) } })
  return {
    verdict, confidence, window, reasons: reasons.slice(0, 3),
    metrics: {
      rainLast3: Math.round(sumRain(days, todayIndex - 2, todayIndex) * 10) / 10,
      rainNext7: Math.round(sumRain(days, todayIndex, todayIndex + 6) * 10) / 10,
      longestDrySpell: dryForVerdict.length,
      drySpellStart: days[dryForVerdict.start]?.date,
      topsoil, topsoilBand, soilTempC,
      heatStressDays, heavyRainDays,
    },
    sowingDay: relevantDay, dryStartDay: dryForVerdict.start, dryLength: dryForVerdict.length,
  }
}
