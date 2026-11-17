import { useEffect, useMemo, useState } from 'react'
import { analyzeHistory } from '../lib/advisor/history'
import type { Crop } from '../lib/advisor/crops'
import { fetchHistory, historyCacheKey, type CachedHistory } from '../lib/openMeteoHistory'
import { getHistoryCache } from '../lib/storage'
import copy from '../i18n/en.json'

function monthName(month: number, short = false): string {
  const name = Object.values(copy.historyMonths)[month] ?? ''
  return short ? name.slice(0, 3) : name
}

function dateLabel(date: string): string {
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`))
}

export default function HistoryPanel({ lat, lon, crop }: { lat: number; lon: number; crop: Crop }) {
  const [history, setHistory] = useState<CachedHistory | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [selectedYear, setSelectedYear] = useState<number>()
  const [selectedMonth, setSelectedMonth] = useState<number>()
  const analysis = useMemo(() => history ? analyzeHistory(history, crop) : undefined, [history, crop])

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    const key = historyCacheKey(lat, lon)
    setLoading(true)
    setError('')
    setHistory(null)
    fetchHistory(lat, lon, controller.signal).then(result => {
      if (active) setHistory(result)
    }).catch(reason => {
      if (!active || controller.signal.aborted) return
      setError(reason instanceof Error ? reason.message : copy.historyUnavailable)
      const stale = getHistoryCache<CachedHistory>(key, true)
      if (stale) setHistory(stale)
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false; controller.abort() }
  }, [lat, lon, attempt])

  useEffect(() => {
    if (analysis?.seasons.length) setSelectedYear(analysis.seasons.at(-1)!.startYear)
  }, [history, crop.id])

  const seasons = analysis?.seasons ?? []
  const filteredSeasons = selectedMonth === undefined
    ? seasons
    : seasons.filter(season => season.onset && new Date(`${season.onset.date}T00:00:00Z`).getUTCMonth() === selectedMonth)
  const selectedSeason = filteredSeasons.find(season => season.startYear === selectedYear) ?? filteredSeasons.at(-1)
  const maxRainfall = Math.max(1, ...seasons.flatMap(season => season.rainfall === undefined ? [] : [season.rainfall]))
  const maxMonthlyRainfall = Math.max(1, ...(analysis?.months ?? []).flatMap(month => month.rainfall === undefined ? [] : [month.rainfall]))
  const lastUpdated = history ? new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(history.fetchedAt) : ''

  return <section className="history-card card" aria-labelledby="history-title">
    <div className="history-heading">
      <div className="card-title"><span className="card-icon history-icon">⌁</span><h2 id="history-title">{copy.historyTitle}</h2></div>
      {history && <span className="history-updated">{copy.historyUpdated} {lastUpdated}</span>}
    </div>
    <p className="history-intro">{copy.historyIntro}</p>
    {loading && !history && <div className="history-loading" aria-label={copy.historyLoading}><div className="skeleton skeleton-line" /><div className="skeleton skeleton-chart" /></div>}
    {error && <div className={`history-error ${history ? 'subtle' : ''}`} role="status"><span>{error}</span><button onClick={() => setAttempt(value => value + 1)}>{copy.retry}</button></div>}
    {history && analysis && <>
      <p className="history-summary">{copy.historySummary
        .replace('{successful}', String(analysis.seasonsWithOnset))
        .replace('{total}', String(analysis.seasons.length))
        .replace('{falseStarts}', String(analysis.falseStartSeasons))}</p>
      <div className="history-window">
        <strong>{copy.historyWindow}</strong>
        <span>{analysis.commonOnsetMonth === undefined
          ? copy.historyNoWindow
          : copy.historyWindowMonth.replace('{month}', monthName(analysis.commonOnsetMonth)).replace('{count}', String(analysis.months[analysis.commonOnsetMonth]!.onsetCount)).replace('{total}', String(analysis.seasonsWithOnset))}</span>
      </div>
      <div className="history-calendar" role="group" aria-label={copy.historyCalendar}>
        {analysis.months.map(item => <button key={item.month} className={`history-month ${selectedMonth === item.month ? 'active' : ''}`} aria-pressed={selectedMonth === item.month} aria-label={copy.historyMonthAria
          .replace('{month}', monthName(item.month))
          .replace('{rain}', item.rainfall === undefined ? copy.metricNoData : `${item.rainfall.toFixed(0)} mm`)
          .replace('{onsets}', String(item.onsetCount))} onClick={() => setSelectedMonth(selectedMonth === item.month ? undefined : item.month)}>
          <strong>{monthName(item.month, true)}</strong>
          <span>{item.rainfall === undefined ? '—' : `${item.rainfall.toFixed(0)} mm`}</span>
          <i><b style={{ width: `${Math.min(100, (item.rainfall ?? 0) / maxMonthlyRainfall * 100)}%` }} /></i>
          <small>{item.onsetCount} {copy.historyOnsets}</small>
        </button>)}
      </div>
      <div className="history-season-heading">
        <h3>{copy.historyCompare}</h3>
        {selectedMonth !== undefined && <button onClick={() => setSelectedMonth(undefined)}>{copy.historyAllSeasons}</button>}
      </div>
      <div className="history-seasons" role="group" aria-label={copy.historyCompare}>
        {filteredSeasons.slice().reverse().map(season => <button key={season.startYear} className={`history-season ${selectedSeason?.startYear === season.startYear ? 'active' : ''}`} aria-pressed={selectedSeason?.startYear === season.startYear} onClick={() => setSelectedYear(season.startYear)}>
          <strong>{season.label}</strong>
          <span className="season-rain-track"><i style={{ width: `${season.rainfall === undefined ? 0 : season.rainfall / maxRainfall * 100}%` }} /></span>
          <span className="season-onset">{season.onset ? dateLabel(season.onset.date) : season.falseStart ? copy.historyFalseStart : copy.historyNoOnset}</span>
          <span className={`season-state ${season.onset ? 'reliable' : 'unreliable'}`}>{season.onset ? '✓' : '!'}</span>
        </button>)}
        {filteredSeasons.length === 0 && <p className="history-empty">{copy.historyNoMonth}</p>}
      </div>
      {selectedSeason && <div className="selected-season">
        <strong>{copy.historySelected} {selectedSeason.label}</strong>
        <span>{selectedSeason.onset
          ? selectedSeason.falseStart
            ? copy.historyBothDetails.replace('{onset}', dateLabel(selectedSeason.onset.date)).replace('{falseStart}', dateLabel(selectedSeason.falseStart.date))
            : copy.historyOnsetDetails.replace('{date}', dateLabel(selectedSeason.onset.date)).replace('{days}', String(selectedSeason.onset.dryDays))
          : selectedSeason.falseStart
            ? copy.historyFalseDetails.replace('{date}', dateLabel(selectedSeason.falseStart.date)).replace('{days}', String(selectedSeason.falseStart.dryDays))
            : copy.historyNoOnset}</span>
        <small>{selectedSeason.rainfall === undefined
          ? copy.metricNoData
          : copy.historySeasonRain.replace('{rain}', selectedSeason.rainfall.toFixed(0))}</small>
      </div>}
    </>}
    {!history && !loading && !error && <p className="history-empty">{copy.historyUnavailable}</p>}
    <p className="history-footnote">{copy.historySource}</p>
  </section>
}
