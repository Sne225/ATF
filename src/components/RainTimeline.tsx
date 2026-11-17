import type { Forecast } from '../lib/openMeteo'
import type { Advisory } from '../lib/advisor/rules'
import copy from '../i18n/en.json'

export default function RainTimeline({ weather, advisory }: { weather: Forecast; advisory: Advisory }) {
  const max = Math.max(10, ...weather.days.flatMap(d => d.rain === null ? [] : [d.rain]))
  const today = 14
  const width = 620, height = 152, gap = 4, barWidth = (width - gap * 29) / 30
  const highlightStart = advisory.sowingDay >= 2 ? advisory.sowingDay - 2 : -1
  const dryFrom = advisory.dryStartDay
  const dryTo = dryFrom + advisory.dryLength - 1
  return <div className="chart-wrap" role="img" aria-label={copy.chartDescription}>
    <div className="chart-key"><span><i className="key-blue" /> {copy.rainExpected}</span><span><i className="key-green" /> {copy.sowingRain}</span><span><i className="key-dry" /> {copy.drySpell}</span></div>
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="rain-chart" aria-hidden="true">
      {[0, 1, 2, 3].map(i => <line key={i} x1="0" x2={width} y1={24 + i * 36} y2={24 + i * 36} className="chart-grid" />)}
      {weather.days.map((day, i) => {
        const barHeight = day.rain === null ? 0 : Math.max(2, (day.rain / max) * 112)
        const x = i * (barWidth + gap)
        const isDry = i >= dryFrom && i <= dryTo
        const isSowing = i >= highlightStart && i <= advisory.sowingDay
        return <g key={day.date}>
          {isDry && <rect x={x - 1} y="12" width={barWidth + 2} height="119" rx="4" className="dry-zone" />}
          {day.rain !== null && <rect x={x} y={128 - barHeight} width={barWidth} height={barHeight} rx="3"
            className={`rain-bar ${isSowing ? 'sowing-bar' : ''} ${i > today + 7 ? 'uncertain-bar' : ''}`} />
          }
        </g>
      })}
      <line x1={today * (barWidth + gap) - gap / 2} x2={today * (barWidth + gap) - gap / 2} y1="8" y2="132" className="today-line" />
    </svg>
    <div className="chart-dates"><span>{weather.days[0]?.date.slice(5)}</span><strong>{copy.today}</strong><span>{weather.days.at(-1)?.date.slice(5)}</span></div>
    <div className="chart-period"><span>14 {copy.dayPast}</span><span>16-day {copy.outlook}</span></div>
  </div>
}
