import { useMemo, useState } from 'react'
import { CloudRain } from 'lucide-react'
import type { Advisory } from '../lib/advisor/rules'
import type { Forecast } from '../lib/api'
import copy from '../i18n/en.json'

type Measure = 'rain' | 'temperature' | 'soil' | 'balance'
type Point = { index: number; date: string; rain?: number; high?: number; low?: number; soil?: number; balance?: number }

const mean = (values: (number | null | undefined)[]) => {
  const known = values.filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value))
  return known.length ? known.reduce((sum, value) => sum + value, 0) / known.length : undefined
}

function daySoil(weather: Forecast, index: number): number | undefined {
  const start = index * 24
  const layers = weather.soilMoistureLayers.map(layer => mean(layer.slice(start, start + 24)))
  return mean(layers)
}

function dateLabel(date: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('en', { ...options, timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`))
}

function valueLabel(value: number | undefined, unit = ''): string {
  return value === undefined ? copy.metricNoData : `${value.toFixed(value % 1 ? 1 : 0)}${unit}`
}

function weatherLabel(code: number | null): string {
  if (code === null) return copy.outlookUnknown
  if (code === 0) return copy.weatherClear
  if (code <= 3) return copy.weatherCloudy
  if (code <= 48) return copy.weatherFog
  if (code <= 67 || (code >= 80 && code <= 82)) return copy.weatherRain
  if (code <= 77 || (code >= 85 && code <= 86)) return copy.weatherSnow
  if (code >= 95) return copy.weatherStorm
  return copy.outlookUnknown
}

function measureFor(day: Point, measure: Measure): number | undefined {
  if (measure === 'temperature') return day.high
  if (measure === 'soil') return day.soil
  if (measure === 'balance') return day.balance
  return day.rain
}

export default function Outlook({ weather, advisory }: { weather: Forecast; advisory: Advisory }) {
  const [measure, setMeasure] = useState<Measure>('rain')
  const [range, setRange] = useState<7 | 16 | 30>(16)
  const [selectedDay, setSelectedDay] = useState(0)
  const allDays = useMemo<Point[]>(() => weather.days.map((day, index) => {
    const rain = day.rain ?? undefined
    const et0 = day.et0 ?? undefined
    const soil = daySoil(weather, index)
    return {
      index, date: day.date, rain,
      high: day.high ?? undefined,
      low: day.low ?? undefined,
      soil: soil === undefined ? undefined : soil * 100,
      balance: rain === undefined || et0 === undefined ? undefined : rain - et0,
    }
  }), [weather])
  const days = allDays.slice(14, 30)
  const selected = days[selectedDay]
  const chartStart = range === 30 ? 0 : 14
  const visible = range === 30 ? allDays : allDays.slice(14, 14 + range)
  const width = 620, height = 172, left = 5, right = 5, top = 14, bottom = 25
  const plotWidth = width - left - right
  const step = plotWidth / Math.max(visible.length, 1)
  const barWidth = Math.min(20, step * 0.56)
  const plotHeight = height - top - bottom
  const allValues = visible.flatMap(day => measure === 'temperature'
    ? [day.high, day.low].filter((value): value is number => value !== undefined)
    : [measureFor(day, measure)].filter((value): value is number => value !== undefined))
  const valueMin = measure === 'soil' ? 0
    : measure === 'temperature' && allValues.length ? Math.floor(Math.min(...allValues) - 2)
      : measure === 'balance' && allValues.length ? Math.min(0, Math.floor(Math.min(...allValues) - 2)) : 0
  const valueMax = measure === 'soil' ? Math.max(50, Math.ceil(Math.max(0, ...allValues) / 10) * 10)
    : measure === 'temperature' && allValues.length ? Math.ceil(Math.max(...allValues) + 2)
      : measure === 'balance' && allValues.length ? Math.max(0, Math.ceil(Math.max(...allValues) + 2))
        : Math.max(5, ...allValues)
  const y = (value: number) => top + (valueMax - value) / Math.max(valueMax - valueMin, 0.01) * plotHeight
  const zeroY = y(0)
  const pointX = (offset: number) => left + offset * step + step / 2
  const lineFor = (key: 'high' | 'low' | 'soil') => {
    let active = false
    return visible.map((day, offset) => {
      const value = day[key]
      if (value === undefined) { active = false; return '' }
      const command = active ? 'L' : 'M'
      active = true
      return `${command}${pointX(offset)},${y(value)}`
    }).filter(Boolean).join(' ')
  }
  const selectedOffset = selected ? selected.index - chartStart : 0
  const sowStart = advisory.sowingDay >= 2 ? advisory.sowingDay - 2 : -1
  const sowEnd = advisory.sowingDay
  const dryStart = advisory.dryStartDay
  const dryEnd = dryStart + advisory.dryLength - 1
  const unit = measure === 'rain' ? ' mm' : measure === 'temperature' ? '°C' : measure === 'soil' ? '%' : ' mm'
  const selectedValue = selected ? measureFor(selected, measure) : undefined
  const soilPercent = selected?.soil
  const selectedSummary: { id: Measure; label: string; value: string }[] = [
    { id: 'rain', label: copy.rainfall, value: valueLabel(selected?.rain, ' mm') },
    { id: 'temperature', label: copy.temperatureLabel, value: selected ? `${valueLabel(selected.low, '°')} / ${valueLabel(selected.high, '°')}` : copy.metricNoData },
    { id: 'soil', label: copy.soilMoisture, value: valueLabel(soilPercent, '%') },
    { id: 'balance', label: copy.waterBalanceLabel, value: valueLabel(selected?.balance, ' mm') },
  ]

  return <div className="outlook">
    <div className="card-title"><span className="card-icon rain-icon" aria-hidden="true"><CloudRain /></span><h2>{copy.outlookTitle}</h2></div>
    <div className="outlook-summary" aria-label={copy.outlookSummary}>
      {selectedSummary.map(item => <button key={item.id} className={`summary-chip ${measure === item.id ? 'active' : ''}`} aria-pressed={measure === item.id} onClick={() => setMeasure(item.id)}>
        <span>{item.label}</span><strong>{item.value}</strong>
      </button>)}
    </div>
    <div className="outlook-days" role="group" aria-label={copy.outlookDays}>
      {days.map((day, index) => <button key={day.date} className={`outlook-day ${selectedDay === index ? 'selected' : ''}`} aria-pressed={selectedDay === index} aria-label={`${dateLabel(day.date, { weekday: 'long', day: 'numeric', month: 'long' })}: ${weatherLabel(weather.days[day.index]?.weatherCode ?? null)}, ${valueLabel(day.rain, ' mm')} rain`} onClick={() => {
        setSelectedDay(index)
        if (range !== 30 && index >= range) setRange(16)
      }}>
        <span>{index === 0 ? copy.today : dateLabel(day.date, { weekday: 'short' })}</span>
        <strong>{dateLabel(day.date, { day: 'numeric' })}</strong>
        <small>{valueLabel(day.rain, ' mm')}</small>
      </button>)}
    </div>
    <div className="outlook-chart-head">
      <div><strong>{selected ? dateLabel(selected.date, { weekday: 'long', day: 'numeric', month: 'short' }) : copy.outlookUnknown}</strong><span>{weatherLabel(weather.days[selected?.index ?? 14]?.weatherCode ?? null)}</span></div>
      <div className="range-switch" role="group" aria-label={copy.outlookRangeLabel}>
        {([7, 16, 30] as const).map(value => <button key={value} className={range === value ? 'active' : ''} aria-pressed={range === value} onClick={() => {
          setRange(value)
          if (value !== 30 && selectedDay >= value) setSelectedDay(0)
        }}>{copy.outlookRanges[String(value) as keyof typeof copy.outlookRanges]}</button>)}
      </div>
    </div>
    <div className="measure-switch" role="group" aria-label={copy.outlookMeasureLabel}>
      {(['rain', 'temperature', 'soil', 'balance'] as const).map(id => <button key={id} className={measure === id ? 'active' : ''} aria-pressed={measure === id} onClick={() => setMeasure(id)}>{copy.measureLabels[id]}</button>)}
    </div>
    <div className="outlook-chart-wrap" role="img" aria-label={`${copy.outlookChartLabel}: ${copy.measureLabels[measure]}, ${range} ${copy.days}`}>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="outlook-chart" aria-hidden="true">
        {[0, 1, 2, 3].map(i => <line key={i} x1={left} x2={width - right} y1={top + i * plotHeight / 3} y2={top + i * plotHeight / 3} className="chart-grid" />)}
        {visible.map((day, offset) => {
          const x = pointX(offset)
          const isSowing = day.index >= sowStart && day.index <= sowEnd
          const isDry = day.index >= dryStart && day.index <= dryEnd
          const value = measureFor(day, measure)
          const barY = value === undefined ? zeroY : measure === 'balance' ? Math.min(y(value), zeroY) : y(value)
          const barHeight = value === undefined ? 0 : measure === 'balance' ? Math.abs(zeroY - y(value)) : Math.max(1.5, zeroY - y(value))
          return <g key={day.date}>
            {isSowing && <rect x={x - step / 2} y={top} width={step} height={plotHeight} className="outlook-sowing-band" />}
            {isDry && <rect x={x - step / 2} y={top} width={step} height={plotHeight} className="outlook-dry-band" />}
            {selectedOffset === offset && <rect x={x - step / 2} y={top} width={step} height={plotHeight} className="outlook-selected-band" />}
            {(measure === 'rain' || measure === 'balance') && value !== undefined && <rect x={x - barWidth / 2} y={barY} width={barWidth} height={barHeight} rx="3" className={`outlook-bar ${measure === 'balance' && value < 0 ? 'negative' : ''} ${day.index > 21 ? 'uncertain-bar' : ''}`}><title>{`${dateLabel(day.date, { weekday: 'short', day: 'numeric', month: 'short' })}: ${valueLabel(value, unit)}`}</title></rect>}
          </g>
        })}
        {measure === 'temperature' && <><path d={lineFor('high')} className="outlook-line temperature-high" /><path d={lineFor('low')} className="outlook-line temperature-low" />
          {visible.map((day, index) => <g key={`${day.date}-temperature`}>{day.high !== undefined && <circle cx={pointX(index)} cy={y(day.high)} r="3" className="outlook-point temperature-high"><title>{`${dateLabel(day.date, { day: 'numeric', month: 'short' })}: ${valueLabel(day.high, '°C')} high`}</title></circle>}{day.low !== undefined && <circle cx={pointX(index)} cy={y(day.low)} r="3" className="outlook-point temperature-low"><title>{`${dateLabel(day.date, { day: 'numeric', month: 'short' })}: ${valueLabel(day.low, '°C')} low`}</title></circle>}</g>)}
        </>}
        {measure === 'soil' && <><path d={lineFor('soil')} className="outlook-line soil-line" />{visible.map((day, index) => day.soil === undefined ? null : <circle key={day.date} cx={pointX(index)} cy={y(day.soil)} r="3" className="outlook-point soil-point"><title>{`${dateLabel(day.date, { day: 'numeric', month: 'short' })}: ${valueLabel(day.soil * 100, '%')}`}</title></circle>)}</>}
        {measure === 'balance' && <line x1={left} x2={width - right} y1={zeroY} y2={zeroY} className="outlook-zero" />}
        {14 >= chartStart && 14 < chartStart + visible.length && <line x1={pointX(14 - chartStart) - step / 2} x2={pointX(14 - chartStart) - step / 2} y1={top} y2={height - bottom} className="today-line" />}
      </svg>
      <div className="outlook-axis-labels"><span>{valueLabel(valueMax, unit)}</span><span>{valueLabel(valueMin, unit)}</span></div>
    </div>
    <div className="outlook-legend"><span><i className="legend-rain" />{copy.measureLabels[measure]}</span><span><i className="legend-sowing" />{copy.sowingRain}</span><span><i className="legend-dry" />{copy.drySpell}</span></div>
    <p className="outlook-note">{selected && selectedValue !== undefined ? `${copy.selectedDay}: ${valueLabel(selectedValue, unit)}.` : copy.outlookMissingNote}</p>
  </div>
}
