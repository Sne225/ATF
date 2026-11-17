import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-500.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/bricolage-grotesque/latin-500.css'
import '@fontsource/bricolage-grotesque/latin-600.css'
import '@fontsource/bricolage-grotesque/latin-700.css'
import SoilGauge from './components/SoilGauge'
import CropPicker from './components/CropPicker'
import MetricsGrid from './components/MetricsGrid'
import FieldMap, { type GPSPosition } from './components/FieldMap'
import { crops, visibleCrops, getWeather, reversePlace, type Crop, type Forecast } from './lib/api'
import { advise, type Advisory } from './lib/advisor/rules'
import { calculateMetrics } from './lib/advisor/metrics'
import { buildShareMessage, shareMessage } from './lib/share'
import { getWeatherCache } from './lib/storage'
import copy from './i18n/en.json'

const Outlook = lazy(() => import('./components/Outlook'))
const HistoryPanel = lazy(() => import('./components/HistoryPanel'))

type Position = { lat: number; lon: number }
const initialParams = new URLSearchParams(location.search)
const initiallyChosen = initialParams.has('lat') && initialParams.has('lon')
const readParam = (key: 'lat' | 'lon', fallback: number, min: number, max: number) => {
  const parsed = Number(initialParams.get(key))
  return initialParams.has(key) && Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback
}
const defaultPosition = { lat: readParam('lat', 0, -90, 90), lon: readParam('lon', 20, -180, 180) }
const initialCrop = initialParams.get('crop')

function verdictTitle(advisory: Advisory) {
  if (advisory.verdict === 'wait_window' && advisory.window?.start) {
    const date = new Date(`${advisory.window.start}T12:00:00`)
    const formatted = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short' }).format(date)
    return copy.verdicts.wait_window.replace('{date}', formatted)
  }
  return copy.verdicts[advisory.verdict]
}
function verdictIcon(verdict: Advisory['verdict']) {
  return ({ plant: '✓', false_start: '!', wait_window: '↗', wait_no_rain: '◷', too_cold: '↓' })[verdict]
}
const confidenceLabel: Record<Advisory['confidence'], string> = {
  high: copy.confHigh, medium: copy.confMedium, low: copy.confLow,
}
function reasonText(reason: Advisory['reasons'][number]) {
  let text: string = copy.reasons[reason.key as keyof typeof copy.reasons]
  for (const [key, value] of Object.entries(reason.values)) text = text.replace(`{${key}}`, String(value))
  return text
}

export default function App() {
  const [position, setPosition] = useState<Position>(defaultPosition)
  const [cropId, setCropId] = useState(crops.some(c => c.id === initialCrop) ? initialCrop! : 'maize')
  const [recentCropIds, setRecentCropIds] = useState<string[]>(() => {
    let saved: string[] = []
    try {
      const value: unknown = JSON.parse(localStorage.getItem('mvula:recent-crops') ?? '[]')
      if (Array.isArray(value)) saved = value.filter((id): id is string => typeof id === 'string' && crops.some(crop => crop.id === id))
    } catch { saved = [] }
    return initialCrop && crops.some(crop => crop.id === initialCrop)
      ? [initialCrop, ...saved.filter(id => id !== initialCrop)]
      : saved
  })
  const [irrigated, setIrrigated] = useState(initialParams.get('water') === '1')
  const [fieldChosen, setFieldChosen] = useState(initiallyChosen)
  const [place, setPlace] = useState(initiallyChosen
    ? copy.coordinatePlace.replace('{lat}', defaultPosition.lat.toFixed(2)).replace('{lon}', defaultPosition.lon.toFixed(2))
    : copy.unselectedPlace)
  const [weather, setWeather] = useState<Forecast | null>(null)
  const [advisory, setAdvisory] = useState<Advisory | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [offline, setOffline] = useState(!navigator.onLine)
  const [locationError, setLocationError] = useState('')
  const [gpsPosition, setGpsPosition] = useState<GPSPosition | null>(null)
  const [gpsWatching, setGpsWatching] = useState(false)
  const [shareStatus, setShareStatus] = useState('')
  const [confidenceOpen, setConfidenceOpen] = useState(false)
  const watchId = useRef<number | null>(null)
  const requestId = useRef(0)
  const weatherController = useRef<AbortController | null>(null)
  const reverseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reverseController = useRef<AbortController | null>(null)
  const locationRevision = useRef(0)
  const gpsMovedField = useRef(false)
  const crop: Crop = crops.find(c => c.id === cropId) ?? crops[0]!
  const pickerCrops = visibleCrops(recentCropIds, cropId)

  const chooseCrop = (nextCrop: Crop) => {
    setCropId(nextCrop.id)
    const updated = [nextCrop.id, ...recentCropIds.filter(id => id !== nextCrop.id)].slice(0, 5)
    setRecentCropIds(updated)
    try { localStorage.setItem('mvula:recent-crops', JSON.stringify(updated)) }
    catch { /* The picker remains usable when storage is disabled. */ }
  }

  const updatePosition = useCallback((next: Position, name?: string) => {
    const revision = ++locationRevision.current
    if (reverseTimer.current) clearTimeout(reverseTimer.current)
    reverseController.current?.abort()
    setPosition(next)
    if (name) setPlace(name)
    else {
      setPlace(copy.coordinatePlace.replace('{lat}', next.lat.toFixed(2)).replace('{lon}', next.lon.toFixed(2)))
      reverseTimer.current = setTimeout(() => {
        const controller = new AbortController()
        reverseController.current = controller
        reversePlace(next.lat, next.lon, controller.signal).then(result => {
          if (result && revision === locationRevision.current) setPlace(result)
        }).catch(() => undefined)
      }, 700)
    }
    const params = new URLSearchParams(location.search)
    params.set('lat', next.lat.toFixed(3)); params.set('lon', next.lon.toFixed(3)); params.set('crop', cropId)
    history.replaceState(null, '', `${location.pathname}?${params.toString()}`)
  }, [cropId])
  const updatePositionRef = useRef(updatePosition)
  updatePositionRef.current = updatePosition
  const chooseCoordinates = useCallback((lat: number, lng: number, name?: string) => {
    setFieldChosen(true)
    updatePositionRef.current({ lat, lon: lng }, name)
    setLocationError('')
  }, [])

  useEffect(() => {
    if (!initiallyChosen) return
    const controller = new AbortController()
    reverseController.current = controller
    const revision = locationRevision.current
    reversePlace(position.lat, position.lon, controller.signal).then(result => {
      if (result && revision === locationRevision.current) setPlace(result)
    }).catch(() => undefined)
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (fieldChosen) {
      params.set('lat', position.lat.toFixed(3))
      params.set('lon', position.lon.toFixed(3))
    } else {
      params.delete('lat')
      params.delete('lon')
    }
    params.set('crop', cropId)
    if (irrigated) params.set('water', '1')
    else params.delete('water')
    history.replaceState(null, '', `${location.pathname}?${params.toString()}`)
  }, [cropId, fieldChosen, irrigated, position])

  const loadWeather = useCallback(async () => {
    if (!fieldChosen) {
      setLoading(false)
      setError('')
      setAdvisory(null)
      setWeather(null)
      return
    }
    const id = ++requestId.current
    weatherController.current?.abort()
    const controller = new AbortController()
    weatherController.current = controller
    setLoading(true); setError('')
    setAdvisory(null); setWeather(null)
    try {
      const result = await getWeather(position.lat, position.lon, controller.signal)
      if (id !== requestId.current) return
      const advice = advise(result, crop, irrigated)
      setWeather(result); setAdvisory(advice); setOffline(!navigator.onLine)
    } catch (reason) {
      if (id !== requestId.current) return
      setOffline(true)
      const last = getWeatherCache<Forecast>(`${position.lat.toFixed(3)},${position.lon.toFixed(3)}`, true)
      if (last) {
        const advice = advise(last, crop, irrigated)
        setWeather(last); setAdvisory(advice); setOffline(true)
      }
      setError(reason instanceof Error ? reason.message : copy.retryLabel)
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, [crop, fieldChosen, irrigated, position])

  useEffect(() => { void loadWeather() }, [loadWeather])
  useEffect(() => {
    const online = () => setOffline(false)
    const offlineNow = () => setOffline(true)
    window.addEventListener('online', online); window.addEventListener('offline', offlineNow)
    return () => { window.removeEventListener('online', online); window.removeEventListener('offline', offlineNow) }
  }, [])

  useEffect(() => () => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current)
    if (reverseTimer.current) clearTimeout(reverseTimer.current)
    reverseController.current?.abort()
    weatherController.current?.abort()
  }, [])

  const useMyLocation = () => {
    if (!navigator.geolocation) { setLocationError(copy.locationUnavailable); return }
    setLocationError('')
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current)
    gpsMovedField.current = false
    setGpsPosition(null)
    setGpsWatching(true)
    watchId.current = navigator.geolocation.watchPosition(
      ({ coords }) => {
        const next = { lat: coords.latitude, lon: coords.longitude, accuracy: coords.accuracy }
        setGpsPosition(next)
        setLocationError('')
        if (!gpsMovedField.current) {
          gpsMovedField.current = true
          chooseCoordinates(next.lat, next.lon)
        }
      },
      error => {
        setLocationError(error.code === 1 ? copy.locationDenied : copy.locationFailed)
        if (error.code === 1) {
          if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current)
          watchId.current = null
          setGpsWatching(false)
          setGpsPosition(null)
        }
      },
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 15000 },
    )
  }

  const message = useMemo(() => advisory
    ? buildShareMessage(crop, place, weather?.days[14]?.date ?? '', advisory, location.href)
    : '', [advisory, crop, place, weather])
  const todayLabel = weather?.days[14]?.date
    ? new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${weather.days[14].date}T12:00:00`))
    : ''

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(location.href)
      setShareStatus(copy.copySuccess)
    } catch { setShareStatus(copy.copyUnavailable) }
    setTimeout(() => setShareStatus(''), 2500)
  }
  const shareNative = async () => {
    try {
      const result = await shareMessage(message, copy.shareTitle)
      if (result !== 'cancelled') setShareStatus(result === 'copied' ? copy.copySuccess : copy.shareSuccess)
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setShareStatus(copy.shareUnavailable)
    }
    setTimeout(() => setShareStatus(''), 2500)
  }
  const confidenceExplanation = advisory?.verdict === 'too_cold'
    ? copy.coldConfidence[advisory.confidence]
    : copy.confidenceTooltip

  return <main className="app-shell">
    <header className="topbar">
      <a className="brand" href={location.pathname} aria-label={copy.homeLabel}><span className="brand-mark">m</span><span>{copy.brand}<small>{copy.tagline}</small></span></a>
      <div className="header-note"><span className="weather-sun">☼</span> {copy.headerNote}</div>
    </header>
    <div className="workspace">
      <FieldMap lat={position.lat} lng={position.lon} locationLabel={place}
        fieldChosen={fieldChosen} onLocationChange={chooseCoordinates}
        gpsPosition={gpsPosition} gpsWatching={gpsWatching}
        onLocate={useMyLocation} locationError={locationError} />
      <section className="advice-panel" aria-label={copy.adviceLabel}>
        <div className="advice-inner">
          {offline && <div className="offline-banner" role="status"><span>◉</span> {advisory ? `${copy.offline} · ${new Date(weather?.fetchedAt ?? 0).toLocaleString()}` : copy.offlineEmpty}</div>}
          <div className="crop-section">
            <div className="section-heading"><h2>{copy.cropQuestion}</h2></div>
            <CropPicker visible={pickerCrops} selectedId={cropId} remainingCount={crops.length - pickerCrops.length} onSelect={chooseCrop} />
            <label className="irrigation-toggle">
              <input type="checkbox" role="switch" checked={irrigated} onChange={event => setIrrigated(event.target.checked)} />
              <span className="switch-track" aria-hidden="true"><span /></span>
              <span>{copy.irrigationLabel}</span>
            </label>
            {(crop.method === 'transplant' || crop.method === 'cutting') && !irrigated && <p className="rain-fed-note">{copy.rainFedNote}</p>}
          </div>
          {loading && !advisory ? <div className="loading-card" aria-label={copy.loading}><div className="skeleton skeleton-title" /><div className="skeleton skeleton-line" /><div className="skeleton skeleton-line short" /><div className="skeleton skeleton-chart" /></div> : null}
          {error && <div className={`error-banner ${advisory ? 'subtle' : ''}`} role="alert"><span>!</span><p>{error}</p><button onClick={() => void loadWeather()}>{copy.retry}</button></div>}
          {advisory && weather && <>
            <article className={`verdict-card verdict-${advisory.verdict}`} aria-live="polite">
              <div className="verdict-top"><span className="verdict-symbol">{verdictIcon(advisory.verdict)}</span><button className={`confidence confidence-${advisory.confidence}`} aria-label={copy.confidenceExplain} aria-expanded={confidenceOpen} onClick={() => setConfidenceOpen(!confidenceOpen)}><span className="confidence-dot" />{confidenceLabel[advisory.confidence]} {copy.confidence}</button></div>
              {confidenceOpen && <div className="confidence-help" role="tooltip">{confidenceExplanation}</div>}
              <span className="verdict-eyebrow">{copy.eyebrows[advisory.verdict]}</span>
              <h1>{verdictTitle(advisory)}</h1>
              <p>{copy.support[advisory.verdict]}</p>
              <div className="verdict-meta"><span>⌖ {place}</span><span>↻ {todayLabel} · {new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit' }).format(weather.fetchedAt)}</span></div>
            </article>
            <div className="reason-card card">
              <div className="card-title"><span className="card-icon">✳</span><h2>{copy.why}</h2></div>
              <ul>{advisory.reasons.map((reason, index) => {
                const blocksPlanting = ['falseStart', 'tooCold', 'noRain', 'soil_dry'].includes(reason.key)
                return <li key={`${reason.key}-${index}`}><span className={`reason-check ${blocksPlanting ? 'blocking' : 'supporting'}`}>{blocksPlanting ? '!' : '✓'}</span><span>{reasonText(reason)}</span></li>
              })}</ul>
            </div>
            <div className="rain-card card">
              <Suspense fallback={<div className="chart-loading skeleton" aria-label={copy.chartLoading} />}>
                <Outlook weather={weather} advisory={advisory} />
              </Suspense>
            </div>
            <div className="soil-card card">
              <div className="card-title"><span className="card-icon soil-icon">◒</span><h2>{copy.soilMoisture}</h2><span className="estimate-tag">{copy.estimate}</span></div>
              <SoilGauge advisory={advisory} />
            </div>
            <MetricsGrid metrics={calculateMetrics(weather, crop, advisory)} crop={crop} advisory={advisory} irrigated={irrigated} />
            <Suspense fallback={<div className="loading-card history-skeleton" aria-label={copy.historyLoading}><div className="skeleton skeleton-line" /><div className="skeleton skeleton-chart" /></div>}>
              <HistoryPanel lat={position.lat} lon={position.lon} crop={crop} />
            </Suspense>
            <div className="share-card card">
              <div className="share-heading"><div><span className="section-kicker">{copy.passItOn}</span><h2>{copy.shareAdvice}</h2></div></div>
              <div className="share-actions"><a className="share-button whatsapp" target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(message)}`}><svg className="whatsapp-glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 11.6a8.4 8.4 0 0 1-12.4 7.3L3 20l1.2-4.9a8.4 8.4 0 1 1 16.3-3.5Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><path d="M8.2 7.8c.2-.5.4-.5.7-.5h.5c.2 0 .4.1.5.4l.7 1.7c.1.2 0 .4-.1.6l-.5.6c-.2.2-.2.4 0 .6.4.7 1.1 1.4 1.8 1.8.2.1.4.1.6-.1l.7-.8c.2-.2.4-.2.6-.1l1.6.8c.3.1.4.3.4.5 0 .3-.2 1.1-.7 1.5-.5.4-1.1.6-1.8.4-1-.2-2.2-.8-3.4-1.9-1.3-1.1-2.2-2.5-2.4-3.5-.2-.9.1-1.6.8-2Z" fill="currentColor"/></svg>{copy.whatsapp}</a>{typeof navigator.share === 'function' && <button className="share-button share-native" onClick={() => void shareNative()}>{copy.share} <span>↗</span></button>}<button className="share-button copy-link" onClick={() => void copyLink()}>{copy.copyLink} <span>⧉</span></button></div>
              {shareStatus && <p className="share-status" role="status">{shareStatus}</p>}
            </div>
          </>}
          <details className="how-card card">
            <summary><span className="how-icon">i</span><span><strong>{copy.howTitle}</strong><small>{copy.howSubtitle}</small></span><span className="details-chevron">⌄</span></summary>
            <div className="how-content"><p>{copy.howText}</p><p><strong>{copy.disclaimer}</strong></p><p>{copy.weatherBy}. {copy.mapboxAttribution}.</p></div>
          </details>
          <footer className="footer-note"><span>✦</span> {copy.footer}</footer>
        </div>
      </section>
    </div>
  </main>
}
