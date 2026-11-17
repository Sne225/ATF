import { thresholds, type Crop } from '../lib/advisor/crops'
import type { Advisory } from '../lib/advisor/rules'
import type { FieldMetrics } from '../lib/advisor/metrics'
import copy from '../i18n/en.json'

type MetricId = keyof typeof copy.metricLabels
type CardMetric = { id: MetricId; icon: string; value: string; status: FieldMetrics['soilTempStatus']; sentence: string }

function fill(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce((text, [key, value]) => text.replace(`{${key}}`, String(value)), template)
}

function formattedDate(value?: string): string {
  if (!value) return copy.metricNoData
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`))
}

export default function MetricsGrid({
  metrics,
  crop,
  advisory,
  irrigated,
}: {
  metrics: FieldMetrics
  crop: Crop
  advisory: Advisory
  irrigated: boolean
}) {
  const rules = thresholds(crop)
  const temp = metrics.soilTempC
  const rainStatus = metrics.rainNext7 === undefined ? 'unknown'
    : metrics.rainNext7 >= rules.onsetRainMm ? 'good' : metrics.rainNext7 > 0 ? 'watch' : 'risk'
  const moistureStatus = metrics.topsoilBand === 'moist' ? 'good'
    : metrics.topsoilBand === 'wet' ? 'watch'
      : metrics.topsoilBand === 'dry' ? 'risk' : 'unknown'
  const dryStatus = metrics.longestDryGap === undefined ? 'unknown'
    : irrigated ? 'good'
      : metrics.longestDryGap <= rules.maxDrySpellDays ? 'good'
        : metrics.longestDryGap <= rules.maxDrySpellDays + 2 ? 'watch' : 'risk'
  const balanceStatus = metrics.waterBalance === undefined ? 'unknown'
    : metrics.waterBalance >= 0 ? 'good' : metrics.waterBalance >= -20 ? 'watch' : 'risk'
  const harvestStatus = !metrics.expectedHarvest ? 'unknown'
    : advisory.verdict === 'plant' ? 'good' : 'watch'
  const cards: CardMetric[] = [
    {
      id: 'soilTemp', icon: '℃',
      value: temp === undefined ? copy.metricNoData : `${temp.toFixed(1)}°C`,
      status: metrics.soilTempStatus,
      sentence: temp === undefined ? copy.metricUnavailableSentence
        : fill(copy.metricSentences.soilTemp, { value: temp.toFixed(1), minimum: rules.minSoilTempC }),
    },
    {
      id: 'topsoil', icon: '◒',
      value: metrics.topsoil === undefined ? copy.metricNoData : `${Math.round(metrics.topsoil * 100)}%`,
      status: moistureStatus,
      sentence: fill(copy.metricSentences.topsoil, { trend: copy.metricTrends[metrics.topsoilTrend] }),
    },
    {
      id: 'rain', icon: '☔',
      value: metrics.rainNext7 === undefined ? copy.metricNoData : `${metrics.rainNext7.toFixed(1)} mm`,
      status: rainStatus,
      sentence: metrics.rainLast7 === undefined && metrics.rainNext7 === undefined
        ? copy.metricUnavailableSentence
        : fill(copy.metricSentences.rain, {
          last: metrics.rainLast7?.toFixed(1) ?? copy.metricNoData,
          next: metrics.rainNext7?.toFixed(1) ?? copy.metricNoData,
        }),
    },
    {
      id: 'dryGap', icon: '∅',
      value: metrics.longestDryGap === undefined ? copy.metricNoData : `${metrics.longestDryGap} ${copy.days}`,
      status: dryStatus,
      sentence: metrics.longestDryGap === undefined ? copy.metricUnavailableSentence
        : irrigated
          ? fill(copy.metricSentences.dryGapWatered, { days: metrics.longestDryGap })
          : fill(copy.metricSentences.dryGap, { days: metrics.longestDryGap, tolerance: rules.maxDrySpellDays }),
    },
    {
      id: 'waterBalance', icon: '↕',
      value: metrics.waterBalance === undefined ? copy.metricNoData : `${metrics.waterBalance.toFixed(1)} mm`,
      status: balanceStatus,
      sentence: fill(copy.metricSentences.waterBalance, { value: metrics.waterBalance?.toFixed(1) ?? copy.metricNoData }),
    },
    {
      id: 'heat', icon: '☼',
      value: `${metrics.heatStressDays} ${copy.days}`,
      status: metrics.heatStressDays === undefined ? 'unknown'
        : metrics.heatStressDays === 0 ? 'good' : metrics.heatStressDays < 3 ? 'watch' : 'risk',
      sentence: metrics.heatStressDays === undefined ? copy.metricUnavailableSentence
        : fill(copy.metricSentences.heat, { days: metrics.heatStressDays, maximum: rules.heatStressMaxC }),
    },
    {
      id: 'heavyRain', icon: '⚠',
      value: `${metrics.heavyRainDays} ${copy.days}`,
      status: metrics.heavyRainDays === undefined ? 'unknown' : metrics.heavyRainDays === 0 ? 'good' : 'risk',
      sentence: metrics.heavyRainDays === undefined ? copy.metricUnavailableSentence
        : fill(copy.metricSentences.heavyRain, { days: metrics.heavyRainDays }),
    },
    {
      id: 'harvest', icon: '⌑',
      value: metrics.expectedHarvest ? `${copy.around} ${formattedDate(metrics.expectedHarvest)}` : copy.metricNoData,
      status: harvestStatus,
      sentence: copy.metricSentences.harvest,
    },
  ]

  return <section className="field-metrics" aria-labelledby="field-metrics-title">
    <h2 id="field-metrics-title">{copy.metricSectionTitle}</h2>
    <div className="metric-grid">
      {cards.map(card => <details className={`metric-card metric-${card.status}`} key={card.id}>
        <summary>
          <div className="metric-card-top"><span className="metric-icon">{card.icon}</span><span className={`metric-status status-${card.status}`}><b aria-hidden="true">{card.status === 'good' ? '✓' : card.status === 'watch' || card.status === 'risk' ? '!' : '·'}</b>{copy.metricStatuses[card.status]}</span></div>
          <span className="metric-label">{copy.metricLabels[card.id]}</span>
          <strong className="metric-value">{card.value}</strong>
          <span className="metric-sentence">{card.sentence}</span>
        </summary>
        <p>{copy.metricExplanations[card.id]}</p>
      </details>)}
    </div>
  </section>
}
